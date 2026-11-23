-- Local stand-ins for the Supabase objects the handover QR migration uses
-- (supabase/migrations/20261123094152_handover_qr.sql), for verification/handover-qr.test.mjs
-- (PGlite). Helpers and the orders trigger that sets the buyer copied from production on 23 Nov
-- 2026; tables cut to the columns the migration and its test use. Not for Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema app;
grant usage on schema app, auth to anon, authenticated, service_role;
-- As on Supabase: functions made in public are callable by anon, authenticated and service_role
-- unless a migration takes that away (pg_default_acl, read on the live database 23 Nov 2026).
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled');

create table public.tenants (
  id text primary key default gen_random_uuid()::text, name text not null, slug text not null unique,
  owner_email text not null, seller_type text check (seller_type in ('merchant', 'individual')),
  status text default 'active', is_public boolean default true, created_date timestamptz default now());
create table public.roles (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, name text not null,
  permissions jsonb default '[]'::jsonb, created_date timestamptz default now());
create table public.tenant_users (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, user_email text not null,
  role_id text, status text default 'active', is_owner boolean default false, user_name text,
  created_date timestamptz default now());
create table public.app_users (
  id text primary key default gen_random_uuid()::text, email text not null, full_name text,
  role text check (role in ('superadmin', 'admin', 'manager', 'supervisor', 'staff')),
  created_date timestamptz default now());
create table public.products (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, name text not null,
  price numeric not null, is_active boolean default true);
create table public.orders (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, order_number text not null,
  status public.order_status default 'pending', type text default 'dine_in', customer_name text,
  customer_phone text, items jsonb default '[]'::jsonb, subtotal numeric, total_amount numeric not null,
  payment_method text default 'pending' check (payment_method in ('cash', 'card', 'qr', 'digital_wallet', 'pending')),
  payment_status text default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded', 'partial')),
  notes text, buyer_id text, customer_id uuid, is_deleted boolean not null default false, fulfilment jsonb,
  created_date timestamptz default now(), updated_date timestamptz default now());

create function app.jwt_email() returns text language sql stable set search_path to '' as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
$$;
create function app.is_member(p_tenant_id text) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = p_tenant_id and lower(tu.user_email) = app.jwt_email() and tu.status = 'active')
$$;
create function app.has_permission(p_tenant_id text, p_permission text) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.tenant_users tu
      left join public.roles r on r.id = tu.role_id and r.tenant_id = tu.tenant_id
     where tu.tenant_id = p_tenant_id and lower(tu.user_email) = app.jwt_email() and tu.status = 'active'
       and (coalesce(tu.is_owner, false)
            or coalesce(r.permissions, '[]'::jsonb) ? p_permission
            or coalesce(r.permissions, '[]'::jsonb) ? '*'))
$$;

-- Orders: the shop's team does anything with its own rows (production's tenant_members_all).
alter table public.orders enable row level security;
create policy tenant_members_all on public.orders for all to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
grant select, insert, update, delete on public.orders to authenticated;
grant select on public.tenants, public.products to anon, authenticated;

create function app.order_set_buyer() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.buyer_id is null and auth.uid() is not null and not app.is_member(new.tenant_id) then
    new.buyer_id := auth.uid()::text;
  end if;
  return new;
end $$;
create trigger orders_set_buyer before insert on public.orders for each row execute function app.order_set_buyer();
