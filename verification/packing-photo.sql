-- Packing photo (24 Nov 2026): every rule of supabase/migrations/20261123171724_packing_photo.sql,
-- in one transaction that ends by raising its results ("TEST RESULTS {passed, failed, failures}"),
-- so nothing stays: its shops, people, orders, uploads (rows in storage.objects only, no files)
-- and notifications (zz-packing-…@example.com) go with the rest. Live: paste the whole file into
-- the Supabase SQL editor (or execute_sql), after the migration or after its text in the same run.
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
create function pg_temp.as_user(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_user is null then '{"role": "anon"}'
                         else json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text end,
                    true)
$$;
create function pg_temp.order_in(p_shop text, p_number text, p_method text) returns text language sql as $$
  insert into public.orders (tenant_id, order_number, status, type, total_amount, items, customer_name, fulfilment)
  values (p_shop, p_number, 'pending', case when p_method = 'delivery' then 'delivery' else 'takeaway' end, 12,
          '[{"name": "zz Kaya jar", "quantity": 2, "price": 6}]'::jsonb, 'zz Buyer Bea',
          case when p_method is null then null else jsonb_build_object('method', p_method) end)
  returning id
$$;
create function pg_temp.path_for(p_shop text, p_order text) returns text language sql as $$
  select p_shop || '/' || p_order || '/' || gen_random_uuid() || '.jpg'
$$;
-- An upload as the signed-in person (the storage API's insert, under its policies): null when
-- allowed, else the error.
create function pg_temp.upload(p_name text, p_owner uuid) returns text language plpgsql as $$
begin
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('order-photos', p_name, p_owner, p_owner::text, '{"size": 123456, "mimetype": "image/jpeg"}'::jsonb);
  execute 'reset role';
  return null;
exception when others then
  execute 'reset role';
  return sqlstate || ' ' || sqlerrm;
end $$;
-- How many of the bucket's objects named p_name the signed-in person can see.
create function pg_temp.sees(p_name text) returns integer language plpgsql as $$
declare v integer;
begin
  execute 'set local role authenticated';
  select count(*) into v from storage.objects where bucket_id = 'order-photos' and name = p_name;
  execute 'reset role';
  return v;
end $$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_owner uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();   -- on the team later, without orders.edit
  v_buyer uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_merchant uuid := gen_random_uuid();
  v_shop text := gen_random_uuid()::text;
  v_store text := gen_random_uuid()::text;
  v_role text;
  v_o1 text;  -- accepted, packed with a photo, then handed over
  v_o2 text;  -- pending (not accepted yet)
  v_o3 text;  -- accepted: the scan is refused until it's packed
  v_o4 text;  -- cancelled
  v_o5 text;  -- ready before the packing photo existed: handed over as before
  v_o6 text;  -- ready before the packing photo existed: can still get one
  v_os text;  -- the shop's own order (no buyer, no QR)
  v_om text;  -- a business store's order
  v_p1 text;
  v_p2 text;
  v_p3 text;
  v_a jsonb;
  v_e text;
  v_n integer;
  v_s text;
begin
  insert into auth.users (id, email) values
    (v_owner, 'zz-packing-owner@example.com'), (v_viewer, 'zz-packing-viewer@example.com'),
    (v_buyer, 'zz-packing-buyer@example.com'), (v_other, 'zz-packing-other@example.com'),
    (v_merchant, 'zz-packing-merchant@example.com');
  insert into public.tenants (id, name, slug, owner_email, seller_type, status, is_public) values
    (v_shop, 'zz Packing Shop', 'zz-packing-' || left(v_shop, 8), 'zz-packing-owner@example.com', 'individual', 'active', false),
    (v_store, 'zz Packing Store', 'zz-packing-m-' || left(v_store, 8), 'zz-packing-merchant@example.com', 'merchant', 'active', false);
  insert into public.roles (tenant_id, name, permissions) values (v_shop, 'zz Viewer', '["orders.view"]'::jsonb) returning id into v_role;
  insert into public.tenant_users (tenant_id, user_email, status, is_owner, user_name, role_id) values
    (v_shop, 'zz-packing-owner@example.com', 'active', true, 'zz Owner Ann', null),
    (v_store, 'zz-packing-merchant@example.com', 'active', true, 'zz Merchant May', null);
  insert into public.subscriptions (tenant_id, tier, status, current_period_end)
  values (v_store, 'starter', 'trial', now() + interval '7 days');

  perform pg_temp.as_user(v_buyer, 'zz-packing-buyer@example.com');
  v_o1 := pg_temp.order_in(v_shop, 'ZZ-P1', 'delivery');
  v_o2 := pg_temp.order_in(v_shop, 'ZZ-P2', 'collection');
  v_o3 := pg_temp.order_in(v_shop, 'ZZ-P3', 'collection');
  v_o4 := pg_temp.order_in(v_shop, 'ZZ-P4', 'collection');
  v_o5 := pg_temp.order_in(v_shop, 'ZZ-P5', 'collection');
  v_o6 := pg_temp.order_in(v_shop, 'ZZ-P6', 'collection');
  v_om := pg_temp.order_in(v_store, 'ZZ-PM', null);
  perform pg_temp.as_user(v_owner, 'zz-packing-owner@example.com');
  v_os := pg_temp.order_in(v_shop, 'ZZ-PS', 'collection');
  update public.orders set status = 'confirmed' where id in (v_o1, v_o3, v_o4);
  update public.orders set status = 'cancelled' where id = v_o4;
  -- Ready before this (Sellio's own fix may still move it): the service role isn't held back.
  execute 'set local role service_role';
  update public.orders set status = 'ready' where id in (v_o5, v_o6);
  execute 'reset role';

  select count(*) into v_n from app.order_handovers h where h.order_id in (v_o1, v_o2, v_o3, v_o4, v_o5, v_o6);
  v_res := v_res || pg_temp.r('the buyer''s orders have QRs (packing photos apply to them)', v_n = 6, v_n::text);

  -- ── The gate ────────────────────────────────────────────────────────────────────────────
  begin
    update public.orders set status = 'ready' where id = v_o1;
    v_res := v_res || pg_temp.r('accepted → ready without a photo: refused', false, 'moved');
  exception when others then
    get stacked diagnostics v_e = pg_exception_hint;
    v_res := v_res || pg_temp.r('accepted → ready without a photo: refused, packing_photo_required',
      sqlstate = '42501' and v_e = 'packing_photo_required' and sqlerrm = 'Take the packing photo to mark this order packed.', sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.orders set status = 'completed' where id = v_o3;
    v_res := v_res || pg_temp.r('accepted → completed without a photo: refused (any role but the service role)', false, 'moved');
  exception when others then
    v_res := v_res || pg_temp.r('accepted → completed without a photo: refused (any role but the service role)', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
  update public.orders set status = 'preparing' where id = v_o3;
  select status::text into v_s from public.orders where id = v_o3;
  v_res := v_res || pg_temp.r('accepted → preparing: as before', v_s = 'preparing', v_s);
  update public.orders set status = 'ready' where id = v_os;
  select status::text into v_s from public.orders where id = v_os;
  v_res := v_res || pg_temp.r('the shop''s own order (no QR): ready without a photo, as before', v_s = 'ready', v_s);
  perform pg_temp.as_user(v_merchant, 'zz-packing-merchant@example.com');
  update public.orders set status = 'ready' where id = v_om;
  select status::text into v_s from public.orders where id = v_om;
  v_res := v_res || pg_temp.r('a business store''s order: as before', v_s = 'ready', v_s);

  -- ── Uploading ───────────────────────────────────────────────────────────────────────────
  v_p1 := pg_temp.path_for(v_shop, v_o1);
  perform pg_temp.as_user(v_other, 'zz-packing-other@example.com');
  v_e := pg_temp.upload(v_p1, v_other);
  v_res := v_res || pg_temp.r('someone else can''t upload an order''s photo', v_e like '42501%', coalesce(v_e, 'uploaded'));
  perform pg_temp.as_user(v_buyer, 'zz-packing-buyer@example.com');
  v_e := pg_temp.upload(v_p1, v_buyer);
  v_res := v_res || pg_temp.r('…nor the buyer', v_e like '42501%', coalesce(v_e, 'uploaded'));
  perform pg_temp.as_user(v_owner, 'zz-packing-owner@example.com');
  v_e := pg_temp.upload(v_shop || '/' || v_o1 || '/photo.jpg', v_owner);
  v_res := v_res || pg_temp.r('…nor a name that isn''t <shop>/<order>/<uuid>.jpg', v_e like '42501%', coalesce(v_e, 'uploaded'));
  v_e := pg_temp.upload(pg_temp.path_for(v_shop, v_o2), v_owner);
  v_res := v_res || pg_temp.r('…nor for an order not accepted yet', v_e like '42501%', coalesce(v_e, 'uploaded'));
  v_e := pg_temp.upload(pg_temp.path_for(v_shop, v_os), v_owner);
  v_res := v_res || pg_temp.r('…nor for an order without a QR', v_e like '42501%', coalesce(v_e, 'uploaded'));
  v_e := pg_temp.upload(pg_temp.path_for(v_shop, v_o4), v_owner);
  v_res := v_res || pg_temp.r('…nor for a cancelled order', v_e like '42501%', coalesce(v_e, 'uploaded'));
  v_e := pg_temp.upload(v_p1, v_owner);
  v_res := v_res || pg_temp.r('the shop''s owner uploads an accepted order''s photo', v_e is null, coalesce(v_e, 'uploaded'));

  -- ── Recording it ────────────────────────────────────────────────────────────────────────
  perform pg_temp.as_user(v_other, 'zz-packing-other@example.com');
  begin
    v_a := public.shop_packing_photo(v_shop, v_o1, v_p1);
    v_res := v_res || pg_temp.r('recording needs the shop''s team', false, v_a::text);
  exception when others then
    v_res := v_res || pg_temp.r('recording needs the shop''s team', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_owner, 'zz-packing-owner@example.com');
  v_a := public.shop_packing_photo(v_shop, v_o2, v_p1);
  v_res := v_res || pg_temp.r('a pending order: not_accepted', v_a ->> 'reason' = 'not_accepted', v_a::text);
  v_a := public.shop_packing_photo(v_shop, v_o4, v_p1);
  v_res := v_res || pg_temp.r('a cancelled order: cancelled', v_a ->> 'reason' = 'cancelled', v_a::text);
  v_a := public.shop_packing_photo(v_shop, v_os, pg_temp.path_for(v_shop, v_os));
  v_res := v_res || pg_temp.r('an order without a QR: not_needed', v_a ->> 'reason' = 'not_needed', v_a::text);
  v_a := public.shop_packing_photo(v_shop, v_o3, v_p1);
  v_res := v_res || pg_temp.r('another order''s photo: bad_photo', v_a ->> 'reason' = 'bad_photo', v_a::text);
  v_a := public.shop_packing_photo(v_shop, v_o3, pg_temp.path_for(v_shop, v_o3));
  v_res := v_res || pg_temp.r('a photo never uploaded: photo_missing', v_a ->> 'reason' = 'photo_missing', v_a::text);
  -- Uploaded by someone else (not this person), or long ago.
  v_p2 := pg_temp.path_for(v_shop, v_o3);
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('order-photos', v_p2, v_viewer, v_viewer::text, '{"size": 1}'::jsonb);
  v_a := public.shop_packing_photo(v_shop, v_o3, v_p2);
  v_res := v_res || pg_temp.r('someone else''s upload: photo_missing', v_a ->> 'reason' = 'photo_missing', v_a::text);
  v_p3 := pg_temp.path_for(v_shop, v_o3);
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, created_at)
  values ('order-photos', v_p3, v_owner, v_owner::text, '{"size": 1}'::jsonb, now() - interval '40 minutes');
  v_a := public.shop_packing_photo(v_shop, v_o3, v_p3);
  v_res := v_res || pg_temp.r('an upload from over 30 minutes ago: photo_old', v_a ->> 'reason' = 'photo_old', v_a::text);
  select count(*) into v_n from app.order_packing_photos p where p.order_id in (v_o2, v_o3, v_o4, v_os);
  v_res := v_res || pg_temp.r('…none of those recorded', v_n = 0, v_n::text);

  v_a := public.shop_packing_photo(v_shop, v_o1, v_p1);
  v_res := v_res || pg_temp.r('the owner''s photo for the accepted order: recorded, the order ready',
    (v_a ->> 'ok')::boolean and v_a ->> 'status' = 'ready' and v_a ->> 'path' = v_p1 and v_a ->> 'taken_by_name' = 'zz Owner Ann', v_a::text);
  select count(*) into v_n from app.order_packing_photos p
   where p.order_id = v_o1 and p.path = v_p1 and p.taken_by = 'zz-packing-owner@example.com' and p.bytes = 123456;
  v_res := v_res || pg_temp.r('…kept with who took it and its size', v_n = 1, v_n::text);
  select status::text into v_s from public.orders where id = v_o1;
  v_res := v_res || pg_temp.r('…the order is ready', v_s = 'ready', v_s);
  select count(*) into v_n from public.notifications nt
   where nt.user_email = 'zz-packing-buyer@example.com' and nt.title = 'Order #ZZ-P1 is out for delivery'
     and nt.message = 'zz Packing Shop has sent your order out for delivery. See the packing photo in My purchases.';
  v_res := v_res || pg_temp.r('…the buyer is told, with the photo mentioned', v_n = 1, v_n::text);
  v_a := public.shop_packing_photo(v_shop, v_o1, v_p1);
  v_res := v_res || pg_temp.r('the same photo again (a retry): ok, already', (v_a ->> 'ok')::boolean and (v_a ->> 'already')::boolean, v_a::text);
  select count(*) into v_n from app.order_packing_photos p where p.order_id = v_o1;
  v_res := v_res || pg_temp.r('…recorded once', v_n = 1, v_n::text);

  -- A ready order can still get a photo (no step change).
  v_p2 := pg_temp.path_for(v_shop, v_o6);
  v_e := pg_temp.upload(v_p2, v_owner);
  v_a := public.shop_packing_photo(v_shop, v_o6, v_p2);
  v_res := v_res || pg_temp.r('a ready order can still get a photo (stays ready)', v_e is null and (v_a ->> 'ok')::boolean and v_a ->> 'status' = 'ready', coalesce(v_e, v_a::text));

  -- ── Who sees it ─────────────────────────────────────────────────────────────────────────
  v_p3 := pg_temp.path_for(v_shop, v_o1);   -- uploaded, never recorded
  v_e := pg_temp.upload(v_p3, v_owner);
  v_res := v_res || pg_temp.r('the shop sees its photos (recorded or not)', pg_temp.sees(v_p1) = 1 and pg_temp.sees(v_p3) = 1, pg_temp.sees(v_p1) || ' ' || pg_temp.sees(v_p3));
  perform pg_temp.as_user(v_buyer, 'zz-packing-buyer@example.com');
  v_res := v_res || pg_temp.r('the buyer sees the recorded photo, not the other upload', pg_temp.sees(v_p1) = 1 and pg_temp.sees(v_p3) = 0, pg_temp.sees(v_p1) || ' ' || pg_temp.sees(v_p3));
  v_a := public.my_packing_photo(v_o1);
  v_res := v_res || pg_temp.r('my_packing_photo: the buyer''s order''s photo and when', v_a ->> 'path' = v_p1 and v_a ->> 'taken_at' is not null, coalesce(v_a::text, 'null'));
  begin
    perform public.shop_packing_photos(v_shop, array[v_o1]);
    v_res := v_res || pg_temp.r('the buyer can''t list the shop''s photos', false, 'listed');
  exception when others then
    v_res := v_res || pg_temp.r('the buyer can''t list the shop''s photos', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_other, 'zz-packing-other@example.com');
  v_res := v_res || pg_temp.r('someone else sees nothing', pg_temp.sees(v_p1) = 0, pg_temp.sees(v_p1)::text);
  v_a := public.my_packing_photo(v_o1);
  v_res := v_res || pg_temp.r('…and my_packing_photo gives them nothing', v_a is null, coalesce(v_a::text, 'null'));
  perform pg_temp.as_user(null, null);
  v_a := public.my_packing_photo(v_o1);
  v_res := v_res || pg_temp.r('…nor someone signed out', v_a is null, coalesce(v_a::text, 'null'));
  perform pg_temp.as_user(v_owner, 'zz-packing-owner@example.com');
  select count(*), max(photos), max(taken_by_name) into v_n, v_e, v_s
    from public.shop_packing_photos(v_shop, array[v_o1, v_o2, v_o5, v_o6]);
  v_res := v_res || pg_temp.r('shop_packing_photos: the latest of each order', v_n = 2 and v_s = 'zz Owner Ann', v_n || ' ' || coalesce(v_s, ''));

  -- A photo stays: no one in the app can change it (deleting needs the storage API's own policy: none).
  execute 'set local role authenticated';
  update storage.objects set metadata = '{"size": 1}'::jsonb where bucket_id = 'order-photos' and name = v_p1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  v_res := v_res || pg_temp.r('the shop can''t change a photo', v_n = 0, v_n::text);

  -- ── The handover ────────────────────────────────────────────────────────────────────────
  select token into v_s from app.order_handovers where order_id = v_o3;
  v_a := public.shop_handover_scan(v_shop, v_s);
  v_res := v_res || pg_temp.r('scanning an order not packed yet: not_packed', v_a ->> 'reason' = 'not_packed', v_a::text);
  select status::text into v_s from public.orders where id = v_o3;
  v_res := v_res || pg_temp.r('…and it stays as it was', v_s = 'preparing', v_s);
  select token into v_s from app.order_handovers where order_id = v_o1;
  v_a := public.shop_handover_scan(v_shop, v_s);
  v_res := v_res || pg_temp.r('scanning a packed order: handed over', (v_a ->> 'ok')::boolean, v_a::text);
  v_e := pg_temp.upload(pg_temp.path_for(v_shop, v_o1), v_owner);
  v_res := v_res || pg_temp.r('…and no more photos for it', v_e like '42501%', coalesce(v_e, 'uploaded'));
  v_a := public.shop_packing_photo(v_shop, v_o1, v_p3);
  v_res := v_res || pg_temp.r('…nor recording one', v_a ->> 'reason' = 'already_completed', v_a::text);
  select token into v_s from app.order_handovers where order_id = v_o5;
  v_a := public.shop_handover_scan(v_shop, v_s);
  v_res := v_res || pg_temp.r('an order ready before this: handed over as before', (v_a ->> 'ok')::boolean, v_a::text);

  -- ── The shop's team without orders.edit ─────────────────────────────────────────────────
  -- A home seller's shop has one login (its owner). Once it's a business with staff, its open
  -- orders keep their QRs, and someone on the team who can only see orders can't take the photo.
  update public.tenants set seller_type = 'merchant' where id = v_shop;
  insert into public.subscriptions (tenant_id, tier, status, current_period_end)
  values (v_shop, 'starter', 'trial', now() + interval '7 days');
  insert into public.tenant_users (tenant_id, user_email, status, is_owner, user_name, role_id)
  values (v_shop, 'zz-packing-viewer@example.com', 'active', false, 'zz Viewer Vic', v_role);
  v_p2 := pg_temp.path_for(v_shop, v_o3);
  perform pg_temp.as_user(v_viewer, 'zz-packing-viewer@example.com');
  v_e := pg_temp.upload(v_p2, v_viewer);
  v_res := v_res || pg_temp.r('the shop''s team without orders.edit can''t upload', v_e like '42501%', coalesce(v_e, 'uploaded'));
  begin
    v_a := public.shop_packing_photo(v_shop, v_o3, v_p2);
    v_res := v_res || pg_temp.r('…nor record a photo', false, v_a::text);
  exception when others then
    v_res := v_res || pg_temp.r('…nor record a photo', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_owner, 'zz-packing-owner@example.com');
  v_e := pg_temp.upload(v_p2, v_owner);
  v_res := v_res || pg_temp.r('…while the owner still can', v_e is null, coalesce(v_e, 'uploaded'));

  -- ── Nobody reads or writes the record directly ──────────────────────────────────────────
  execute 'set local role authenticated';
  begin
    select count(*) into v_n from app.order_packing_photos;
    v_res := v_res || pg_temp.r('the app can''t read the record', false, v_n::text);
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('the app can''t read the record', true, sqlstate);
  end;
  execute 'reset role';

  perform pg_temp.as_user(null, null);
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) e where (e ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean));
end
$test$;
