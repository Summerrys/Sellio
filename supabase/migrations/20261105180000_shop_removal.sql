-- Removing a shop for good (Alvin, 5 Nov 2026). First use: Alvin's Cafetelier test shop. The
-- same steps are meant for "Start again" and the final deletion of closed accounts.
--
-- The account-purge edge function runs them in this order: it ends the shop's Stripe
-- subscriptions, removes the shop's files through the Storage API (rows in storage.objects
-- can't be deleted with SQL), then calls shop_removal(id, false), which deletes the shop's rows
-- in one transaction and refuses while any of its files remain. shop_removal(id, true) is the
-- dry run: it makes every change, reports it, and rolls it all back. The log of Stripe events
-- (stripe_webhook_events) keeps its rows.

-- The shop's files: everything under <shop id>/ in product-images (product photos, logo, table
-- QR codes, storefront banner, payment QR, share images), setup leftovers under
-- temp/onboarding/<shop id>/, and the photos sent in the shop's chats (chat-images, found
-- through each message's image_path, since chat photos are stored under the sender's id).
create or replace function app.shop_files(p_tenant_id text)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id = 'product-images'
     and (left(o.name, length(p_tenant_id) + 1) = p_tenant_id || '/'
          or left(o.name, length(p_tenant_id) + 17) = 'temp/onboarding/' || p_tenant_id || '/')
  union
  select o.bucket_id, o.name
    from public.chat_conversations c
    join public.chat_messages m on m.conversation_id = c.id and m.image_path is not null
    join storage.objects o on o.bucket_id = 'chat-images' and o.name = m.image_path
   where c.tenant_id = p_tenant_id
$$;

-- Staff logins only this shop uses (the ones createStaffUser made for it): not the owner, not
-- on any other shop's team (whatever the status), not owning a shop, not an alert recipient or
-- super admin, and not an account whose app_users role is 'admin' (every account that signed up
-- by itself has that role; createStaffUser's logins have 'staff'). They are deleted with the
-- shop. Anyone else only loses this shop's membership.
create or replace function app.shop_staff_logins(p_tenant_id text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id, s.email
    from (select distinct lower(btrim(tu.user_email)) as email
            from public.tenant_users tu
           where tu.tenant_id = p_tenant_id
             and not coalesce(tu.is_owner, false)
             and tu.user_email is not null) s
    join auth.users u on lower(u.email) = s.email
   where s.email <> coalesce((select lower(btrim(t.owner_email)) from public.tenants t where t.id = p_tenant_id), '')
     and not exists (select 1 from public.tenant_users o
                      where lower(btrim(o.user_email)) = s.email and o.tenant_id <> p_tenant_id)
     and not exists (select 1 from public.tenants t
                      where lower(btrim(t.owner_email)) = s.email and t.id <> p_tenant_id)
     and not exists (select 1 from app.sellio_admin_emails() a(email) where a.email = s.email)
     and not exists (select 1 from public.app_users au where lower(btrim(au.email)) = s.email and au.role = 'admin')
$$;

create or replace function public.shop_removal(p_tenant_id text, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_owner text;
  v_files jsonb;
  v_staff jsonb;
  v_staff_ids uuid[];
  v_staff_emails text[];
  v_subs text[];
  v_customers text[];
  v_deleted jsonb := '{}'::jsonb;
  v_n bigint;
  v_table text;
  v_rolled_back boolean := false;
begin
  if p_tenant_id is null or btrim(p_tenant_id) = '' then
    raise exception 'A shop id is required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shop-removal:' || p_tenant_id, 0));
  -- Locked for the whole removal: sync_stripe_billing_state waits on this row, so a Stripe
  -- event arriving meanwhile can't give the shop a new subscriptions row.
  select * into v_tenant from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    return jsonb_build_object('found', false, 'tenantId', p_tenant_id);
  end if;
  v_owner := lower(btrim(coalesce(v_tenant.owner_email, '')));

  select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'name', f.name) order by f.bucket_id, f.name), '[]'::jsonb)
    into v_files
    from app.shop_files(p_tenant_id) f;
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'email', s.email) order by s.email), '[]'::jsonb),
         coalesce(array_agg(s.user_id), '{}'::uuid[]),
         coalesce(array_agg(s.email), '{}'::text[])
    into v_staff, v_staff_ids, v_staff_emails
    from app.shop_staff_logins(p_tenant_id) s;
  select coalesce(array_agg(distinct s.stripe_subscription_id) filter (where s.stripe_subscription_id is not null), '{}'::text[]),
         coalesce(array_agg(distinct s.stripe_customer_id) filter (where s.stripe_customer_id is not null), '{}'::text[])
    into v_subs, v_customers
    from public.subscriptions s
   where s.tenant_id = p_tenant_id;
  if v_tenant.stripe_customer_id is not null and not (v_tenant.stripe_customer_id = any(v_customers)) then
    v_customers := v_customers || v_tenant.stripe_customer_id;
  end if;

  if not p_dry_run and jsonb_array_length(v_files) > 0 then
    raise exception 'The shop still has % files. Remove them through the Storage API first.', jsonb_array_length(v_files)
      using errcode = '55000';
  end if;

  begin
    -- What buyers were told about this shop's orders, and the shop's own notifications.
    delete from public.notifications n
     where n.tenant_id = p_tenant_id
        or n.data ->> 'shop_id' = p_tenant_id
        or (n.data ->> 'order_id') in (select o.id from public.orders o where o.tenant_id = p_tenant_id);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('notifications', v_n);

    delete from app.order_status_times x
     where x.order_id in (select o.id from public.orders o where o.tenant_id = p_tenant_id);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('app.order_status_times', v_n);

    delete from public.listing_likes l
     where l.product_id in (select p.id from public.products p where p.tenant_id = p_tenant_id);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('listing_likes', v_n);

    delete from public.chat_messages m
     where m.conversation_id in (select c.id from public.chat_conversations c where c.tenant_id = p_tenant_id);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('chat_messages', v_n);

    delete from public.rating_reports r
     where r.rating_id in (select s.id from public.shop_ratings s where s.tenant_id = p_tenant_id);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('rating_reports', v_n);

    -- Every other table that carries the shop's id, children before parents.
    foreach v_table in array array[
      'public.order_items', 'public.orders', 'public.delivery_order_items', 'public.delivery_orders',
      'public.payments', 'public.table_calls', 'public.table_sessions', 'public.tables',
      'public.stock_take_items', 'public.stock_takes', 'public.stock_history', 'public.inventory_items',
      'app.inventory_adjustment_requests', 'public.product_variants', 'public.products', 'public.categories',
      'public.suppliers', 'public.business_hours', 'public.storefront_configs', 'public.theme_configs',
      'public.notification_preferences', 'app.checkout_requests', 'public.chat_conversations',
      'public.shop_ratings', 'public.customers', 'public.tenant_entitlement_overrides',
      'app.personal_order_usage', 'app.ai_monthly_usage', 'app.ai_last_analysis', 'app.shop_selling',
      'app.world_owned', 'app.world_stall_styles', 'app.world_milestones', 'public.subscriptions']
    loop
      execute format('delete from %s where tenant_id = $1', v_table::regclass) using p_tenant_id;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted || jsonb_build_object(replace(v_table, 'public.', ''), v_n);
    end loop;

    -- The checkout that paid for this shop (complete-onboarding would reuse a registered invite
    -- for the owner's next shop).
    delete from public.merchant_invites i
     where i.stripe_subscription_id = any(v_subs)
        or i.stripe_customer_id = any(v_customers)
        or (lower(btrim(i.email)) = v_owner and i.status = 'registered'
            and not exists (select 1 from public.tenants t
                             where lower(btrim(t.owner_email)) = v_owner and t.id <> p_tenant_id));
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('merchant_invites', v_n);

    -- Staff logins only this shop used.
    delete from public.notifications n where lower(btrim(n.user_email)) = any(v_staff_emails);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('staff_notifications', v_n);
    delete from public.push_devices d where d.user_id = any(v_staff_ids) or d.user_email = any(v_staff_emails);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('staff_push_devices', v_n);
    delete from public.app_users au where lower(btrim(au.email)) = any(v_staff_emails);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('staff_profiles', v_n);
    delete from auth.users u where u.id = any(v_staff_ids);
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('staff_logins', v_n);

    delete from public.tenant_users tu where tu.tenant_id = p_tenant_id;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('tenant_users', v_n);
    delete from public.roles r where r.tenant_id = p_tenant_id;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('roles', v_n);

    -- The owner (and anyone else whose workspace this was) keeps their account, with no shop.
    update public.app_users au set tenant_id = null, onboarding_completed = false where au.tenant_id = p_tenant_id;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('profiles_without_shop', v_n);

    delete from public.tenants t where t.id = p_tenant_id;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object('tenants', v_n);

    if p_dry_run then
      raise exception 'dry run' using errcode = 'SD001';
    end if;
  exception when sqlstate 'SD001' then
    v_rolled_back := true;
  end;

  return jsonb_build_object(
    'found', true,
    'dryRun', p_dry_run,
    'rolledBack', v_rolled_back,
    'tenantId', v_tenant.id,
    'name', btrim(v_tenant.name),
    'slug', v_tenant.slug,
    'ownerEmail', nullif(v_owner, ''),
    'subscriptions', to_jsonb(v_subs),
    'files', case when p_dry_run then v_files else to_jsonb(jsonb_array_length(v_files)) end,
    'staff', v_staff,
    'deleted', v_deleted);
end
$$;

revoke all on function app.shop_files(text) from public, anon, authenticated;
revoke all on function app.shop_staff_logins(text) from public, anon, authenticated;
revoke all on function public.shop_removal(text, boolean) from public, anon, authenticated;
grant execute on function public.shop_removal(text, boolean) to service_role;

-- The account-purge function's header secret, kept only in Vault (like sellio_push_hook).
create or replace function public.purge_hook_valid(p_secret text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(length(p_secret) >= 32, false) and exists (
    select 1 from vault.decrypted_secrets s
     where s.name = 'sellio_purge_hook' and s.decrypted_secret = p_secret)
$$;
revoke all on function public.purge_hook_valid(text) from public, anon, authenticated;
grant execute on function public.purge_hook_valid(text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'sellio_purge_hook') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sellio_purge_hook',
      'Header secret (x-sellio-purge) for the account-purge edge function');
  end if;
end $$;

-- Billing state waits on the shop's row (for key share) instead of only checking that it
-- exists, so it can't run alongside shop_removal and leave a subscriptions row for a shop
-- that no longer exists. Otherwise unchanged.
create or replace function public.sync_stripe_billing_state(p_tenant_id text, p_status text, p_tier text, p_billing_cycle text, p_amount numeric, p_currency text, p_max_users integer, p_max_products integer, p_max_orders integer, p_max_roles integer, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_price_id text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_invoice_present boolean, p_invoice_id text, p_invoice_status text, p_invoice_amount_due_minor bigint, p_invoice_currency text, p_invoice_hosted_url text, p_next_payment_attempt timestamp with time zone, p_failure_code text, p_failure_message text, p_grace_period_ends_at timestamp with time zone, p_clear_failure boolean, p_reset_orders boolean, p_event_created_at timestamp with time zone, p_event_id text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows integer := 0;
begin
  if p_status not in ('trial', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Unsupported billing status: %', p_status;
  end if;

  if p_tier is not null and p_tier not in ('free', 'starter', 'growth', 'pro') then
    raise exception 'Unsupported subscription tier: %', p_tier;
  end if;

  if p_billing_cycle is not null and p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'Unsupported billing cycle: %', p_billing_cycle;
  end if;

  perform 1 from public.tenants where id = p_tenant_id for key share;
  if not found then
    raise exception 'Tenant not found: %', p_tenant_id;
  end if;

  insert into public.subscriptions (
    tenant_id,
    tier,
    billing_cycle,
    status,
    amount,
    currency,
    max_users,
    max_products,
    max_orders,
    max_roles,
    current_period_start,
    current_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    last_invoice_id,
    invoice_status,
    invoice_amount_due_minor,
    invoice_currency,
    invoice_hosted_url,
    next_payment_attempt,
    last_payment_error_code,
    last_payment_error_message,
    grace_period_ends_at,
    last_stripe_event_created_at,
    last_stripe_event_id,
    orders_this_period,
    orders_period_reset_at,
    updated_date
  )
  values (
    p_tenant_id,
    coalesce(p_tier, 'free'),
    coalesce(p_billing_cycle, 'monthly'),
    p_status,
    p_amount,
    coalesce(upper(p_currency), 'SGD'),
    p_max_users,
    p_max_products,
    p_max_orders,
    p_max_roles,
    p_period_start,
    p_period_end,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    case when p_invoice_present then p_invoice_id else null end,
    case when p_invoice_present then p_invoice_status else null end,
    case when p_invoice_present then p_invoice_amount_due_minor else null end,
    case when p_invoice_present then upper(p_invoice_currency) else null end,
    case when p_invoice_present then p_invoice_hosted_url else null end,
    case when p_invoice_present then p_next_payment_attempt else null end,
    case when p_clear_failure then null else p_failure_code end,
    case when p_clear_failure then null else p_failure_message end,
    case when p_status = 'past_due' then p_grace_period_ends_at else null end,
    p_event_created_at,
    p_event_id,
    0,
    now(),
    now()
  )
  on conflict (tenant_id) do update set
    tier = case when p_tier is null then subscriptions.tier else p_tier end,
    billing_cycle = case when p_billing_cycle is null then subscriptions.billing_cycle else p_billing_cycle end,
    status = p_status,
    amount = case when p_amount is null then subscriptions.amount else p_amount end,
    currency = case when p_currency is null then subscriptions.currency else upper(p_currency) end,
    max_users = case when p_tier is null then subscriptions.max_users else p_max_users end,
    max_products = case when p_tier is null then subscriptions.max_products else p_max_products end,
    max_orders = case when p_tier is null then subscriptions.max_orders else p_max_orders end,
    max_roles = case when p_tier is null then subscriptions.max_roles else p_max_roles end,
    current_period_start = coalesce(p_period_start, subscriptions.current_period_start),
    current_period_end = coalesce(p_period_end, subscriptions.current_period_end),
    stripe_customer_id = coalesce(p_stripe_customer_id, subscriptions.stripe_customer_id),
    stripe_subscription_id = coalesce(p_stripe_subscription_id, subscriptions.stripe_subscription_id),
    stripe_price_id = coalesce(p_stripe_price_id, subscriptions.stripe_price_id),
    last_invoice_id = case when p_invoice_present then p_invoice_id else subscriptions.last_invoice_id end,
    invoice_status = case when p_invoice_present then p_invoice_status else subscriptions.invoice_status end,
    invoice_amount_due_minor = case when p_invoice_present then p_invoice_amount_due_minor else subscriptions.invoice_amount_due_minor end,
    invoice_currency = case when p_invoice_present then upper(p_invoice_currency) else subscriptions.invoice_currency end,
    invoice_hosted_url = case when p_invoice_present then p_invoice_hosted_url else subscriptions.invoice_hosted_url end,
    next_payment_attempt = case when p_invoice_present then p_next_payment_attempt else subscriptions.next_payment_attempt end,
    last_payment_error_code = case
      when p_clear_failure then null
      when p_failure_code is not null then p_failure_code
      else subscriptions.last_payment_error_code
    end,
    last_payment_error_message = case
      when p_clear_failure then null
      when p_failure_message is not null then p_failure_message
      else subscriptions.last_payment_error_message
    end,
    grace_period_ends_at = case
      when p_status <> 'past_due' then null
      when p_grace_period_ends_at is null then subscriptions.grace_period_ends_at
      when subscriptions.grace_period_ends_at is null then p_grace_period_ends_at
      else greatest(subscriptions.grace_period_ends_at, p_grace_period_ends_at)
    end,
    last_stripe_event_created_at = coalesce(p_event_created_at, subscriptions.last_stripe_event_created_at),
    last_stripe_event_id = coalesce(p_event_id, subscriptions.last_stripe_event_id),
    orders_this_period = case when p_reset_orders then 0 else subscriptions.orders_this_period end,
    orders_period_reset_at = case when p_reset_orders then now() else subscriptions.orders_period_reset_at end,
    updated_date = now()
  where p_event_created_at is null
     or subscriptions.last_stripe_event_created_at is null
     or p_event_created_at >= subscriptions.last_stripe_event_created_at;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  update public.tenants
  set
    billing_status = p_status,
    plan = coalesce(p_tier, plan),
    stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
    status = case
      when p_status = 'trial' then 'trial'
      when p_status in ('active', 'past_due') then 'active'
      when p_status in ('suspended', 'cancelled') then 'suspended'
      else status
    end,
    updated_date = now()
  where id = p_tenant_id;

  return true;
end;
$function$;
