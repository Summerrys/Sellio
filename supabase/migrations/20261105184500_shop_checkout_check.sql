-- Who may pay for a shop (Alvin, 5 Nov 2026). A checkout started from a shop names the shop in
-- its client_reference_id, which anyone can put in a checkout link. stripe-webhook attaches it
-- only when the payer is the shop's owner:
--   the payer's email is the shop's owner_email, or an owner's on its team (active);
--   or the payer's phone (when the checkout asked for one) is an owner's phone;
--   or the checkout used the shop's own Stripe customer.
-- Otherwise it isn't attached and the Sellio admins get an alert (alert_sellio_admins).
-- It also says whether the shop has had its free trial (one per shop).
create or replace function public.shop_checkout_check(p_tenant_id text, p_email text, p_phone text, p_customer_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_owners text[];
  v_via text;
begin
  if p_tenant_id is null or btrim(p_tenant_id) = '' then
    return jsonb_build_object('found', false);
  end if;
  select * into v_tenant from public.tenants t where t.id = p_tenant_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(array_agg(distinct x.email), '{}'::text[]) into v_owners
    from (select lower(btrim(v_tenant.owner_email)) as email
          union
          select lower(btrim(tu.user_email))
            from public.tenant_users tu
           where tu.tenant_id = p_tenant_id
             and coalesce(tu.is_owner, false)
             and coalesce(tu.status, 'active') = 'active') x
   where x.email is not null and x.email <> '';

  if v_email is not null and v_email = any(v_owners) then
    v_via := 'email';
  elsif v_phone is not null and length(v_phone) >= 8 and (
        exists (select 1 from public.app_users au
                 where lower(btrim(au.email)) = any(v_owners)
                   and regexp_replace(coalesce(au.phone, ''), '\D', '', 'g') = v_phone)
     or exists (select 1 from public.tenant_users tu
                 where tu.tenant_id = p_tenant_id
                   and coalesce(tu.is_owner, false)
                   and coalesce(tu.status, 'active') = 'active'
                   and regexp_replace(coalesce(tu.user_phone, ''), '\D', '', 'g') = v_phone)) then
    v_via := 'phone';
  elsif p_customer_id is not null and (
        p_customer_id = v_tenant.stripe_customer_id
     or exists (select 1 from public.subscriptions s
                 where s.tenant_id = p_tenant_id and s.stripe_customer_id = p_customer_id)) then
    v_via := 'customer';
  end if;

  return jsonb_build_object(
    'found', true,
    'matched', v_via is not null,
    'via', v_via,
    'name', btrim(v_tenant.name),
    'ownerEmail', nullif(array_to_string(v_owners, ', '), ''),
    'hasUsedTrial', coalesce(v_tenant.has_used_trial, false),
    'sellerType', v_tenant.seller_type);
end
$$;
revoke all on function public.shop_checkout_check(text, text, text, text) from public, anon, authenticated;
grant execute on function public.shop_checkout_check(text, text, text, text) to service_role;

-- An alert to every Sellio admin (app.alert_recipients and active super_admins): a
-- notification each, which also goes to their phones (notifications_push).
create or replace function public.alert_sellio_admins(p_type text, p_title text, p_message text, p_data jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer;
begin
  if coalesce(btrim(p_type), '') = '' or coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'An alert needs a type, a title and a message.' using errcode = '22023';
  end if;
  insert into public.notifications (user_email, type, title, message, data, priority)
  select a.email, left(p_type, 100), left(p_title, 200), left(p_message, 2000), coalesce(p_data, '{}'::jsonb), 'high'
    from app.sellio_admin_emails() a(email);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.alert_sellio_admins(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.alert_sellio_admins(text, text, text, jsonb) to service_role;
