-- Local stand-ins for the Supabase objects the referral migration uses, for
-- verification/referral-programme.test.mjs (PGlite). Copied from production on 10 Nov 2026 where it
-- matters; tables cut to the columns the migration and its test use. Not for Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema app;
create schema extensions;
grant usage on schema app, auth, extensions to anon, authenticated, service_role;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function extensions.gen_random_bytes(n integer) returns bytea language plpgsql volatile as $$
declare b bytea := ''::bytea;
begin
  for i in 1..n loop
    b := b || set_byte('\x00'::bytea, 0, floor(random() * 256)::integer);
  end loop;
  return b;
end $$;

create table public.tenants (
  id text primary key default gen_random_uuid()::text, created_date timestamptz default now(),
  updated_date timestamptz default now(), name text not null, slug text not null unique, logo_url text,
  status text default 'trial', owner_email text not null, phone text, seller_type text default 'merchant',
  is_public boolean default true);
create table public.tenant_users (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, user_email text not null,
  status text default 'active', is_owner boolean default false, user_phone text, updated_date timestamptz default now());
create table public.app_users (
  id text primary key default gen_random_uuid()::text, email text not null unique, full_name text, phone text unique,
  role text default 'user' check (role in ('superadmin', 'admin', 'manager', 'supervisor', 'staff')),
  updated_date timestamptz default now());
create table public.subscriptions (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, tier text default 'free',
  billing_cycle text default 'monthly', status text default 'trial', current_period_end timestamptz,
  grace_period_ends_at timestamptz, stripe_subscription_id text, stripe_customer_id text,
  updated_date timestamptz default now());
create table public.notifications (
  id text primary key default gen_random_uuid()::text, created_date timestamptz default now(), tenant_id text,
  user_email text, type text not null, title text not null, message text not null, data jsonb, link text,
  is_read boolean default false, priority text default 'normal');
create table public.super_admins (id text primary key default gen_random_uuid()::text, email text, is_active boolean);
create table public.tenant_entitlement_overrides (tenant_id text, key text, value jsonb);
create table app.alert_recipients (email text primary key, created_at timestamptz default now());

create function app.jwt_email() returns text language sql stable set search_path to '' as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
$$;
create function app.tier_to_plan(p_tier text) returns text language sql immutable set search_path to '' as $$
  select case when p_tier ilike '%pro%' then 'pro' when p_tier ilike '%growth%' then 'growth' else 'starter' end
$$;
create function app.tenant_plan(p_tenant_id text) returns text language sql stable security definer set search_path to '' as $$
  select case
    when t.seller_type = 'individual' then 'personal'
    when s.status = 'active' then app.tier_to_plan(s.tier)
    when s.status = 'trial' and s.current_period_end >= now() then app.tier_to_plan(s.tier)
    when s.status = 'past_due' and s.grace_period_ends_at > now() then app.tier_to_plan(s.tier)
    else 'lapsed'
  end
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id
  where t.id = p_tenant_id
$$;
create function app.is_owner(p_tenant_id text) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.tenant_users tu
                  where tu.tenant_id = p_tenant_id and lower(tu.user_email) = app.jwt_email()
                    and tu.status = 'active' and coalesce(tu.is_owner, false))
$$;
-- Production: app.entitlement(p_tenant_id, 'can_sell'); here only the override matters.
create function app.can_sell(p_tenant_id text) returns boolean language sql stable security definer set search_path to '' as $$
  select not exists (select 1 from public.tenant_entitlement_overrides o
                      where o.tenant_id = p_tenant_id and o.key = 'can_sell' and o.value = 'false'::jsonb)
$$;
create function app.sellio_admin_emails() returns setof text language sql stable security definer set search_path to '' as $$
  select r.email from app.alert_recipients r
  union
  select lower(sa.email) from public.super_admins sa where coalesce(sa.is_active, true)
$$;
create function public.alert_sellio_admins(p_type text, p_title text, p_message text, p_data jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_n integer;
begin
  if coalesce(btrim(p_type), '') = '' or coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'An alert needs a type, a title and a message.' using errcode = '22023';
  end if;
  insert into public.notifications (user_email, type, title, message, data, priority)
  select a.email, left(p_type, 100), left(p_title, 200), left(p_message, 2000), coalesce(p_data, '{}'::jsonb), 'high'
    from app.sellio_admin_emails() a(email);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.alert_sellio_admins(text, text, text, jsonb) from public, anon, authenticated;
