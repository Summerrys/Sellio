-- Local stand-ins for the Supabase objects the profile-photo migrations use
-- (20261110021000_profile_photo.sql, then 20261111010000_profile_photo_per_sign_in.sql), for
-- verification/profile-photo.test.mjs (PGlite). Helpers copied from production on 11 Nov 2026;
-- tables cut to the columns the migrations and their test use. Not for Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema app;
create schema storage;
grant usage on schema app, auth, storage to anon, authenticated, service_role;

create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create table storage.buckets (
  id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

create table public.app_users (
  id text primary key default gen_random_uuid()::text, email text not null, full_name text,
  role text check (role in ('superadmin', 'admin', 'manager', 'supervisor', 'staff')),
  created_date timestamptz default now());

create function app.jwt_email() returns text language sql stable set search_path to '' as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
$$;
create function app.auth_identity_exists() returns boolean language sql stable security definer set search_path to '' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid());
$$;
