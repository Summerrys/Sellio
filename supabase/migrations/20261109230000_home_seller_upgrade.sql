-- A free home shop can move to a business plan (Alvin, 9 Nov 2026: "Ensure that the upgrade wall
-- works for free home seller too"; picks: 7 days free, one trial per shop; stop paying → back to
-- a free home shop, staff logins off).
--
-- When a home shop's owner pays for Starter, Growth or Pro from the shop's plan window, the
-- shop becomes a business shop on that plan, in place: same name, link, listings, orders and
-- ratings. It gets the business roles a new business shop starts with. When that plan ends
-- (cancelled, or unpaid after Stripe's retries) it goes back to a free home shop, and its staff
-- logins are switched off until it has a plan again.
--
-- Both happen in sync_stripe_billing_state, which every Stripe event, the billing-return check
-- and the plan check go through: the shop follows its plan's status.

alter table public.tenants add column if not exists upgraded_from_home_at timestamptz;
comment on column public.tenants.upgraded_from_home_at is
  'When this shop first moved from a free home shop to a business plan. Set: it goes back to a free home shop when its plan ends (sync_stripe_billing_state).';

alter table public.tenant_users add column if not exists paused_by_plan boolean not null default false;
comment on column public.tenant_users.paused_by_plan is
  'Switched off because the shop''s business plan ended (it went back to a free home shop). Switched on again when it has a plan.';

-- A free home shop on a business plan: a business shop, in place.
create or replace function app.home_shop_to_business(p_tenant_id text, p_tier text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text := app.tier_to_plan(coalesce(p_tier, 'starter'));
  v_food boolean;
begin
  update public.tenants
     set seller_type = 'merchant',
         has_used_trial = true, -- one free trial per shop
         upgraded_from_home_at = coalesce(upgraded_from_home_at, now()),
         updated_date = now()
   where id = p_tenant_id and seller_type = 'individual'
  returning coalesce(industry, '') ~* '(f&b|cafe|restaurant|food|beverage|bar)' into v_food;
  if not found then
    return false;
  end if;

  -- Staff logins switched off when an earlier plan ended come back.
  update public.tenant_users
     set status = 'active', paused_by_plan = false
   where tenant_id = p_tenant_id and paused_by_plan;

  -- The roles a new business shop starts with (complete-onboarding), where the shop has none
  -- of that kind yet: Manager and Staff; on Growth and Pro also Cashier, and Kitchen Staff for
  -- food or Inventory Staff otherwise. Its Owner role it has already.
  insert into public.roles (tenant_id, name, slug, is_system, description, permissions)
  select p_tenant_id, d.name, d.slug, false, d.description, d.permissions
    from (values
      ('manager', 'Manager', 'Day-to-day operations management', jsonb_build_array(
        'staff.view', 'staff.edit', 'products.view', 'products.create', 'products.edit',
        'categories.view', 'categories.create', 'categories.edit', 'inventory.view', 'inventory.adjust',
        'orders.view', 'orders.create', 'orders.edit', 'tables.view', 'tables.edit', 'payments.view',
        'reports.view', 'orders.print_chit', 'settings.view'), true),
      ('staff', 'Staff', 'Basic staff access', jsonb_build_array(
        'products.view', 'orders.view', 'orders.create', 'tables.view', 'orders.print_chit'), true),
      ('cashier', 'Cashier', 'Process orders and payments', jsonb_build_array(
        'products.view', 'categories.view', 'orders.view', 'orders.create', 'orders.edit', 'tables.view',
        'payments.view', 'orders.print_chit', 'settings.view'), v_tier <> 'starter'),
      ('kitchen-staff', 'Kitchen Staff', 'View and update order preparation status', jsonb_build_array(
        'products.view', 'orders.view', 'orders.edit', 'inventory.view', 'orders.print_chit'), v_tier <> 'starter' and v_food),
      ('inventory-staff', 'Inventory Staff', 'Stock and inventory management', jsonb_build_array(
        'products.view', 'inventory.view', 'inventory.adjust', 'categories.view'), v_tier <> 'starter' and not v_food)
    ) as d(slug, name, description, permissions, wanted)
   where d.wanted
     and not exists (select 1 from public.roles r where r.tenant_id = p_tenant_id and r.slug = d.slug);
  return true;
end $$;
revoke all on function app.home_shop_to_business(text, text) from public, anon, authenticated;

-- A shop that started as a free home shop, when its business plan ends: a free home shop again.
create or replace function app.business_to_home_shop(p_tenant_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tenants
     set seller_type = 'individual', plan = 'free', billing_status = 'none', status = 'active',
         updated_date = now()
   where id = p_tenant_id and seller_type = 'merchant' and upgraded_from_home_at is not null;
  if not found then
    return false;
  end if;
  -- A home shop has one login, its owner's: staff logins wait for the next plan.
  update public.tenant_users
     set status = 'suspended', paused_by_plan = true
   where tenant_id = p_tenant_id and not coalesce(is_owner, false) and status = 'active';
  return true;
end $$;
revoke all on function app.business_to_home_shop(text) from public, anon, authenticated;

-- As before, plus: a free home shop whose plan has started (trial or active) becomes a business
-- shop; a home shop's old plan news changes nothing about it; and a shop that started as a free
-- home shop goes back to one when its plan ends (cancelled or suspended).
create or replace function public.sync_stripe_billing_state(p_tenant_id text, p_status text, p_tier text, p_billing_cycle text, p_amount numeric, p_currency text, p_max_users integer, p_max_products integer, p_max_orders integer, p_max_roles integer, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_price_id text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_invoice_present boolean, p_invoice_id text, p_invoice_status text, p_invoice_amount_due_minor bigint, p_invoice_currency text, p_invoice_hosted_url text, p_next_payment_attempt timestamp with time zone, p_failure_code text, p_failure_message text, p_grace_period_ends_at timestamp with time zone, p_clear_failure boolean, p_reset_orders boolean, p_event_created_at timestamp with time zone, p_event_id text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows integer := 0;
  v_type text;
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

  select t.seller_type into v_type from public.tenants t where t.id = p_tenant_id for update;

  -- A free home shop whose plan has started (its owner paid from the shop, or its plan runs
  -- again after it went back to a free home shop): a business shop on that plan, in place.
  if v_type = 'individual' and p_status in ('trial', 'active') and p_stripe_subscription_id is not null then
    perform app.home_shop_to_business(p_tenant_id, p_tier);
    v_type := 'merchant';
  end if;

  -- Still a free home shop (news about a plan that has ended): it stays as it is.
  if v_type = 'individual' then
    return true;
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

  -- A shop that started as a free home shop: when its plan ends, a free home shop again.
  if p_status in ('suspended', 'cancelled') then
    perform app.business_to_home_shop(p_tenant_id);
  end if;

  return true;
end;
$function$;
