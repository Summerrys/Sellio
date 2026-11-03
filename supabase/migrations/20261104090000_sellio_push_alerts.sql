-- Sellio push alerts (milestone 4).
-- - public.push_devices: the phones that get Sellio's alerts. The Android app registers its
--   Firebase Cloud Messaging (FCM) token after sign-in and forgets it on sign-out.
-- - app.notification_push: when a notification is saved for someone with a registered phone,
--   the database asks the send-push edge function (supabase/functions/send-push) to send it.
--   The request carries a secret kept in Vault; send-push checks it with
--   public.push_notification_payload.
-- - app.order_new_alert: when a customer places an order (storefront, table QR, shop checkout),
--   the shop's people who can see orders get a "New order" notification (bell, and phone).
-- Nothing here can stop an order or a notification from being saved: each alert step catches
-- its own errors.

create extension if not exists pg_net with schema extensions;

-- 1. The shared secret between the database and send-push. Made here, kept only in Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sellio_push_hook') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sellio_push_hook',
      'Sent by app.notification_push to the send-push edge function, which checks it with public.push_notification_payload.');
  end if;
end $$;

-- 2. Phones that get Sellio's push alerts. Only the functions below use this table.
create table if not exists public.push_devices (
  token        text primary key check (char_length(token) between 20 and 4096),
  user_id      uuid not null references auth.users (id) on delete cascade,
  user_email   text not null check (user_email = lower(user_email)),
  platform     text not null check (platform in ('android', 'ios')),
  app_version  text check (char_length(app_version) <= 40),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_user_email_idx on public.push_devices (user_email);
create index if not exists push_devices_user_id_idx on public.push_devices (user_id, last_seen_at desc);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
comment on table public.push_devices is
  'Phones that get Sellio push alerts (FCM tokens). Written by register_push_device / unregister_push_device; read by push_notification_payload. No direct access for app users.';

-- 3. The app registers this phone for the signed-in account (after sign-in, at start and when
--    Firebase gives it a new token), and forgets it when signing out.
create or replace function public.register_push_device(p_token text, p_platform text, p_app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := app.jwt_email();
  v_token text := btrim(coalesce(p_token, ''));
begin
  if v_uid is null or v_email is null then
    raise exception 'Sign in to get alerts on this phone.' using errcode = '42501', hint = 'sign_in';
  end if;
  if char_length(v_token) not between 20 and 4096 or v_token ~ '\s' then
    raise exception 'This phone''s alert address isn''t valid.' using errcode = '22023', hint = 'bad_token';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'Unknown kind of phone.' using errcode = '22023', hint = 'bad_platform';
  end if;

  -- A phone belongs to the account last signed in on it.
  insert into public.push_devices (token, user_id, user_email, platform, app_version)
  values (v_token, v_uid, v_email, p_platform, left(nullif(btrim(coalesce(p_app_version, '')), ''), 40))
  on conflict (token) do update
    set user_id      = excluded.user_id,
        user_email   = excluded.user_email,
        platform     = excluded.platform,
        app_version  = excluded.app_version,
        last_seen_at = now();

  -- At most 10 phones per account: the ones used longest ago go.
  delete from public.push_devices d
   where d.user_id = v_uid
     and d.token in (select x.token from public.push_devices x
                      where x.user_id = v_uid
                      order by x.last_seen_at desc, x.created_at desc
                      offset 10);
end $$;

-- Signing out may already have ended the session, so this works without one: whoever has
-- the phone's token can only take that phone off the list.
create or replace function public.unregister_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices where token = btrim(coalesce(p_token, ''));
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated, service_role;
revoke all on function public.unregister_push_device(text) from public;
grant execute on function public.unregister_push_device(text) to anon, authenticated, service_role;

-- 4. send-push reads a notification and its recipient's phones, with the shared secret.
--    Service role only (the edge function).
create or replace function public.push_notification_payload(p_secret text, p_notification_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.notifications%rowtype;
begin
  if p_secret is null or not exists (
       select 1 from vault.decrypted_secrets s
        where s.name = 'sellio_push_hook' and s.decrypted_secret = p_secret) then
    return jsonb_build_object('ok', false);
  end if;
  select * into n from public.notifications where id = p_notification_id;
  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'found', true,
    'notification', jsonb_build_object(
      'id', n.id, 'type', n.type, 'title', n.title, 'message', n.message, 'link', n.link,
      'data', n.data, 'priority', n.priority, 'is_read', coalesce(n.is_read, false),
      'created_date', n.created_date),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('token', d.token, 'platform', d.platform))
        from public.push_devices d
       where d.user_email = lower(btrim(coalesce(n.user_email, '')))), '[]'::jsonb));
end $$;

revoke all on function public.push_notification_payload(text, text) from public, anon, authenticated;
grant execute on function public.push_notification_payload(text, text) to service_role;

-- 5. A saved notification goes to its recipient's phones, if they have registered any.
--    pg_net sends the request after the transaction commits (and not at all if it rolls back).
create or replace function app.notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    if not exists (select 1 from public.push_devices d
                    where d.user_email = lower(btrim(coalesce(new.user_email, '')))) then
      return null;
    end if;
    select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'sellio_push_hook';
    if v_secret is null then
      return null;
    end if;
    perform net.http_post(
      url := 'https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sellio-push', v_secret),
      timeout_milliseconds := 8000);
  exception when others then
    null;  -- the notification is saved even if its phone alert can't be sent
  end;
  return null;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function app.notification_push();

-- 6. The shop hears of each order a customer places: one "new_order" notification for each
--    of its people who can see orders (app.chat_seller_emails, as for chats and ratings).
--    It runs as the order's transaction commits (a deferred trigger), so the order is read
--    as saved: a shop checkout adds the collection or delivery details after placing it.
create or replace function app.order_new_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.orders%rowtype;
  v_currency text;
  v_kind     text;
  v_items    numeric;
  v_name     text;
begin
  begin
    -- Customers' orders through the apps only: not the shop's own staff keying one in, and
    -- not Sellio's own tools (service role, SQL).
    if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then
      return null;
    end if;
    if auth.uid() is not null and app.is_member(new.tenant_id) then
      return null;
    end if;

    select * into o from public.orders where id = new.id;
    if not found or coalesce(o.is_deleted, false)
       or o.status::text not in ('pending', 'confirmed', 'preparing', 'ready') then
      return null;
    end if;

    select coalesce(nullif(btrim(t.currency), ''), 'SGD') into v_currency
      from public.tenants t where t.id = o.tenant_id;
    v_kind := case
      when o.type = 'dine_in' then
        case when nullif(btrim(coalesce(o.table_name, '')), '') is null then 'Dine-in'
             when o.table_name ~* 'table' then btrim(o.table_name)
             else 'Table ' || btrim(o.table_name) end
      when o.fulfilment ->> 'method' = 'collection' then 'Collection'
      when o.fulfilment ->> 'method' = 'delivery' or o.type = 'delivery' then 'Delivery'
      else 'Takeaway' end;
    select sum(case when jsonb_typeof(e -> 'quantity') = 'number' then (e ->> 'quantity')::numeric else 1 end)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) as e;
    v_name := left(nullif(btrim(regexp_replace(coalesce(o.customer_name, ''), '[[:cntrl:]]+', ' ', 'g')), ''), 40);

    -- "New order #ORD-000123" / "Table 2 · 3 items · SGD 18.50"
    insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
    select o.tenant_id, e, 'new_order',
           'New order #' || coalesce(o.order_number, ''),
           concat_ws(' · ', v_kind, v_name,
                     case when v_items = 1 then '1 item'
                          when v_items > 1 then to_char(v_items, 'FM999990') || ' items' end,
                     coalesce(v_currency, 'SGD') || ' ' || to_char(coalesce(o.total_amount, 0), 'FM999999990.00')),
           '/Orders',
           jsonb_build_object('order_id', o.id, 'shop_id', o.tenant_id),
           'normal'
      from app.chat_seller_emails(o.tenant_id) as e;
  exception when others then
    null;  -- the order is saved even if the shop can't be told
  end;
  return null;
end $$;

drop trigger if exists orders_new_alert on public.orders;
create constraint trigger orders_new_alert
  after insert on public.orders
  deferrable initially deferred
  for each row execute function app.order_new_alert();
