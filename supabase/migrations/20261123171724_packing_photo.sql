-- Packing photo (Alvin, 24 Nov 2026): a home seller marks an order packed with a photo taken in
-- Sellio's own camera, the order number in it, before the order can go to "Ready for collection" /
-- "Out for delivery" or be handed over. For orders with a buyer QR (app.order_handovers: a home
-- seller's order placed by a signed-in buyer). The phone stamps the photo with the order number,
-- the shop and the time; the server keeps it privately with when and by whom, and nobody can
-- replace or delete it. The shop's team and the order's buyer can see it.
--
-- Storage: bucket order-photos (private, 5 MB, JPEG/PNG/WebP), <shop id>/<order id>/<uuid>.jpg.
-- Upload: someone on the shop's team with orders.edit, for an accepted order that has a buyer QR
-- and isn't handed over or cancelled. Read: the shop's team; the buyer, the photos recorded for
-- their order. No update or delete policy: a photo stays as taken (the Payment QR policies on
-- storage.objects are restrictive, so they grant nothing here).
--
-- shop_packing_photo records an uploaded photo (uploaded by the caller within the last 30 minutes)
-- and moves an accepted order to ready in the same step. The step to ready or completed is
-- refused without a photo (orders_require_packing_photo; the handover's scan answers not_packed),
-- except for orders already ready before this, and for the service role. A ready order can
-- still get a photo (recorded, no step change). The buyer's "ready" notification mentions it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table app.order_packing_photos (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  tenant_id text not null,
  path text not null unique,
  taken_at timestamptz not null default now(),
  taken_by text,
  taken_by_name text,
  bytes bigint
);
create index order_packing_photos_order on app.order_packing_photos (order_id, taken_at desc);
alter table app.order_packing_photos enable row level security;
revoke all on app.order_packing_photos from public, anon, authenticated;

-- Whether an order still needs its packing photo: it has a buyer QR and no photo yet.
create function app.packing_missing(p_order_id text) returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from app.order_handovers h where h.order_id = p_order_id)
     and not exists (select 1 from app.order_packing_photos p where p.order_id = p_order_id)
$$;
revoke all on function app.packing_missing(text) from public, anon, authenticated;
grant execute on function app.packing_missing(text) to authenticated, service_role;

-- Storage: may the caller upload p_name (<shop id>/<order id>/<uuid>.<jpg|jpeg|png|webp>)?
create function app.packing_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path to ''
as $$
  select coalesce((
    select app.has_permission(o.tenant_id, 'orders.edit')
      from public.orders o
      join app.order_handovers h on h.order_id = o.id
     where coalesce(array_length(storage.foldername(p_name), 1), 0) = 2
       and o.tenant_id = (storage.foldername(p_name))[1]
       and o.id = (storage.foldername(p_name))[2]
       and storage.filename(p_name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
       and not coalesce(o.is_deleted, false)
       and o.status in ('confirmed', 'preparing', 'ready')
       and h.verified_at is null
  ), false)
$$;
revoke all on function app.packing_upload_ok(text) from public, anon, authenticated;
grant execute on function app.packing_upload_ok(text) to authenticated, service_role;

-- Storage: may the caller see p_name? The shop's team: its orders' photos. The buyer: the photos
-- recorded for their order.
create function app.order_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path to ''
as $$
  select coalesce((
    select app.is_member(o.tenant_id)
           or (auth.uid() is not null and o.buyer_id = auth.uid()::text
               and exists (select 1 from app.order_packing_photos p where p.path = p_name and p.order_id = o.id))
      from public.orders o
     where coalesce(array_length(storage.foldername(p_name), 1), 0) = 2
       and o.tenant_id = (storage.foldername(p_name))[1]
       and o.id = (storage.foldername(p_name))[2]
  ), false)
$$;
revoke all on function app.order_photo_visible(text) from public, anon, authenticated;
grant execute on function app.order_photo_visible(text) to authenticated, service_role;

create policy "Order photos: the shop's team adds them" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'order-photos' and app.packing_upload_ok(name));
create policy "Order photos: seen by the shop and the order's buyer" on storage.objects
  for select to authenticated
  using (bucket_id = 'order-photos' and app.order_photo_visible(name));

-- ── The shop ───────────────────────────────────────────────────────────────────────────────
-- Record an uploaded packing photo for an order, and move it to ready if it was accepted or being
-- prepared. Answers {ok, reason, …}: unknown, not_needed (no buyer QR), cancelled,
-- already_completed, not_accepted (still pending), bad_photo (not this order's photo path),
-- photo_missing (not uploaded, or by someone else), photo_old (uploaded over 30 minutes ago).
-- The same photo again (a retry) answers ok with already: true.
create function public.shop_packing_photo(p_tenant_id text, p_order_id text, p_path text) returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  o public.orders%rowtype;
  v_email text := app.jwt_email();
  v_obj record;
  v_name text;
  v_at timestamptz := now();
  v_status text;
  v_prev app.order_packing_photos%rowtype;
begin
  if auth.uid() is null or not app.has_permission(p_tenant_id, 'orders.edit') then
    raise exception 'Only the shop''s team can mark its orders packed.' using errcode = '42501', hint = 'not_member';
  end if;
  select * into o from public.orders x where x.id = p_order_id and x.tenant_id = p_tenant_id for update;
  if not found or coalesce(o.is_deleted, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into v_prev from app.order_packing_photos p where p.path = p_path;
  if found then
    if v_prev.order_id <> o.id then
      return jsonb_build_object('ok', false, 'reason', 'bad_photo');
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o.id, 'order_number', o.order_number,
      'status', o.status, 'path', v_prev.path, 'taken_at', v_prev.taken_at, 'taken_by_name', v_prev.taken_by_name);
  end if;
  if not exists (select 1 from app.order_handovers h where h.order_id = o.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_needed');
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_number', o.order_number);
  end if;
  if o.status in ('completed', 'served') then
    return jsonb_build_object('ok', false, 'reason', 'already_completed', 'order_number', o.order_number);
  end if;
  if o.status = 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_accepted', 'order_number', o.order_number);
  end if;
  if p_path is null or not app.packing_upload_ok(p_path) or (storage.foldername(p_path))[2] is distinct from o.id then
    return jsonb_build_object('ok', false, 'reason', 'bad_photo');
  end if;
  select x.owner_id, x.created_at, nullif(x.metadata ->> 'size', '')::bigint as bytes into v_obj
    from storage.objects x
   where x.bucket_id = 'order-photos' and x.name = p_path;
  if not found or v_obj.owner_id is distinct from auth.uid()::text then
    return jsonb_build_object('ok', false, 'reason', 'photo_missing');
  end if;
  if v_obj.created_at < v_at - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'photo_old');
  end if;

  select coalesce(
           (select nullif(btrim(tu.user_name), '') from public.tenant_users tu
             where tu.tenant_id = p_tenant_id and lower(btrim(tu.user_email)) = v_email
             order by tu.created_date limit 1),
           (select nullif(btrim(u.full_name), '') from public.app_users u
             where lower(btrim(u.email)) = v_email
             order by u.created_date limit 1))
    into v_name;

  insert into app.order_packing_photos (order_id, tenant_id, path, taken_at, taken_by, taken_by_name, bytes)
  values (o.id, o.tenant_id, p_path, v_at, v_email, v_name, v_obj.bytes);

  v_status := o.status::text;
  if o.status in ('confirmed', 'preparing') then
    update public.orders x set status = 'ready', updated_date = v_at where x.id = o.id;
    v_status := 'ready';
  end if;
  return jsonb_build_object('ok', true, 'order_id', o.id, 'order_number', o.order_number, 'status', v_status,
    'path', p_path, 'taken_at', v_at, 'taken_by_name', v_name);
end $$;
revoke all on function public.shop_packing_photo(text, text, text) from public, anon, authenticated;
grant execute on function public.shop_packing_photo(text, text, text) to authenticated, service_role;

-- The latest packing photo of each of the shop's orders asked for (and how many were taken).
create function public.shop_packing_photos(p_tenant_id text, p_order_ids text[])
returns table (order_id text, path text, taken_at timestamptz, taken_by_name text, photos integer)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not app.is_member(p_tenant_id) then
    raise exception 'Only the shop''s team can see its orders.' using errcode = '42501', hint = 'not_member';
  end if;
  return query
    select distinct on (p.order_id) p.order_id, p.path, p.taken_at, p.taken_by_name,
           (count(*) over (partition by p.order_id))::integer
      from app.order_packing_photos p
     where p.tenant_id = p_tenant_id
       and p.order_id = any ((coalesce(p_order_ids, '{}'::text[]))[1:500])
     order by p.order_id, p.taken_at desc;
end $$;
revoke all on function public.shop_packing_photos(text, text[]) from public, anon, authenticated;
grant execute on function public.shop_packing_photos(text, text[]) to authenticated, service_role;

-- ── The buyer ──────────────────────────────────────────────────────────────────────────────
-- The latest packing photo of the caller's own order: {path, taken_at}, or null.
create function public.my_packing_photo(p_order_id text) returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object('path', p.path, 'taken_at', p.taken_at)
    from app.order_packing_photos p
    join public.orders o on o.id = p.order_id
   where p.order_id = p_order_id
     and auth.uid() is not null
     and o.buyer_id = auth.uid()::text
   order by p.taken_at desc
   limit 1
$$;
revoke all on function public.my_packing_photo(text) from public, anon, authenticated;
grant execute on function public.my_packing_photo(text) to authenticated, service_role;

-- ── The gate ───────────────────────────────────────────────────────────────────────────────
-- An order with a buyer QR goes to ready or completed (from pending, accepted or preparing) only
-- once its packing photo is in. Orders ready before this are not held back. The service role
-- (Sellio's own fixes) is not held back either.
create function app.order_require_packing_photo() returns trigger
language plpgsql set search_path to ''
as $$
begin
  if new.status in ('ready', 'completed') and old.status in ('pending', 'confirmed', 'preparing')
     and current_user <> 'service_role' and app.packing_missing(new.id) then
    raise exception 'Take the packing photo to mark this order packed.'
      using errcode = '42501', hint = 'packing_photo_required';
  end if;
  return new;
end $$;
revoke all on function app.order_require_packing_photo() from public, anon, authenticated;

create trigger orders_require_packing_photo before update of status on public.orders
  for each row execute function app.order_require_packing_photo();

-- The handover's scan (and code) answers not_packed for an order not packed yet, instead of
-- failing on the gate. Otherwise as before (20261123094152_handover_qr.sql).
create or replace function app.handover_complete(p_tenant_id text, p_order_id text, p_via text, p_courier boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path to ''
as $$
declare
  o public.orders%rowtype;
  h app.order_handovers%rowtype;
  v_email text := case when p_courier then null else app.jwt_email() end;
  v_name text;
  v_at timestamptz := now();
  v_method text;
begin
  select * into o from public.orders x where x.id = p_order_id and x.tenant_id = p_tenant_id for update;
  if not found or coalesce(o.is_deleted, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into h from app.order_handovers x where x.order_id = o.id;
  v_method := coalesce(o.fulfilment ->> 'method', case when o.type = 'delivery' then 'delivery' else 'collection' end);
  if h.verified_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already', 'order_id', o.id, 'order_number', o.order_number,
      'method', v_method, 'verified_at', h.verified_at, 'verified_via', h.verified_via, 'verified_by_name', h.verified_by_name,
      'verified_by_courier', h.verified_by_courier);
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_id', o.id, 'order_number', o.order_number);
  end if;
  if o.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed', 'order_id', o.id, 'order_number', o.order_number);
  end if;
  if o.status in ('pending', 'confirmed', 'preparing') and app.packing_missing(o.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_packed', 'order_id', o.id, 'order_number', o.order_number,
      'method', v_method);
  end if;

  if p_courier then
    v_name := h.courier_name;
  else
    select coalesce(
             (select nullif(btrim(tu.user_name), '') from public.tenant_users tu
               where tu.tenant_id = p_tenant_id and lower(btrim(tu.user_email)) = v_email
               order by tu.created_date limit 1),
             (select nullif(btrim(u.full_name), '') from public.app_users u
               where lower(btrim(u.email)) = v_email
               order by u.created_date limit 1))
      into v_name;
  end if;

  update app.order_handovers x
     set verified_at = v_at, verified_via = p_via, verified_by = v_email, verified_by_name = v_name,
         verified_by_courier = coalesce(p_courier, false),
         courier_link = null, courier_link_expires_at = null
   where x.order_id = o.id;
  update public.orders x set status = 'completed', updated_date = v_at where x.id = o.id;

  return jsonb_build_object('ok', true, 'order_id', o.id, 'order_number', o.order_number, 'method', v_method,
    'customer_name', o.customer_name, 'items', o.items, 'total_amount', o.total_amount,
    'verified_at', v_at, 'verified_via', p_via, 'verified_by_name', v_name,
    'verified_by_courier', coalesce(p_courier, false));
end $$;
revoke all on function app.handover_complete(text, text, text, boolean) from public, anon, authenticated;

-- The buyer's "ready" notification says the packing photo is in My purchases (when there is
-- one). Otherwise as before.
create or replace function app.order_track_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email  text;
  v_shop   text;
  v_method text;
  v_num    text := coalesce(new.order_number, '');
  v_title  text;
  v_msg    text;
begin
  -- Placing or updating an order never fails over this record (or the notification).
  if tg_op = 'INSERT' then
    begin
      insert into app.order_status_times (order_id, times)
      values (new.id, jsonb_build_object(new.status::text, coalesce(new.created_date, now())))
      on conflict (order_id) do nothing;
    exception when others then
      null;
    end;
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;

  begin
    insert into app.order_status_times as s (order_id, times)
    values (new.id, jsonb_build_object(new.status::text, now()))
    on conflict (order_id) do update set times = s.times || excluded.times;
  exception when others then
    null;
  end;

  -- The buyer, unless they made this change themselves.
  if new.buyer_id is null or coalesce(new.is_deleted, false)
     or new.buyer_id = coalesce(auth.uid()::text, '') then
    return null;
  end if;
  begin
    select lower(btrim(u.email)) into v_email from auth.users u where u.id::text = new.buyer_id;
    if v_email is null or v_email = '' then
      return null;
    end if;
    select nullif(btrim(t.name), '') into v_shop from public.tenants t where t.id = new.tenant_id;
    v_shop := coalesce(v_shop, 'The shop');
    v_method := coalesce(new.fulfilment ->> 'method', case when new.type = 'delivery' then 'delivery' end);
    case new.status::text
      when 'confirmed' then
        v_title := 'Order #' || v_num || ' accepted';
        v_msg := v_shop || ' accepted your order.';
      when 'ready' then
        if v_method = 'delivery' then
          v_title := 'Order #' || v_num || ' is out for delivery';
          v_msg := v_shop || ' has sent your order out for delivery.';
        elsif v_method = 'collection' then
          v_title := 'Order #' || v_num || ' is ready for collection';
          v_msg := v_shop || ' has your order ready for collection.';
        else
          v_title := 'Order #' || v_num || ' is ready';
          v_msg := v_shop || ' has your order ready.';
        end if;
        if exists (select 1 from app.order_packing_photos p where p.order_id = new.id) then
          v_msg := v_msg || ' See the packing photo in My purchases.';
        end if;
      when 'completed' then
        v_title := 'Order #' || v_num || ' completed';
        v_msg := 'How was it? Rate ' || v_shop || ' in My purchases.';
      when 'cancelled' then
        v_title := 'Order #' || v_num || ' cancelled';
        v_msg := v_shop || ' cancelled your order.';
      else
        return null;
    end case;
    insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
    values (null, v_email,
            case when new.status = 'cancelled' then 'order_cancelled' else 'order_status_changed' end,
            v_title, v_msg, '/explore/purchases/' || new.id,
            jsonb_build_object('order_id', new.id, 'status', new.status::text, 'shop_id', new.tenant_id),
            'normal');
  exception when others then
    null;  -- the shop's update goes through even if the buyer can't be told
  end;
  return null;
end $function$;
