-- Handover QR (23 Nov 2026): every rule of supabase/migrations/20261123094152_handover_qr.sql, in one
-- transaction that ends by raising its results ("TEST RESULTS {passed, failed, failures}"), so
-- nothing stays. Its shops, buyers and orders are made here (zz-handover-…@example.com) and go with
-- everything else; nothing is pushed (the alerts' requests roll back too).
-- Live: paste the whole file into the Supabase SQL editor (or execute_sql). Locally:
-- node verification/handover-qr.test.mjs /tmp/sellio-verification (see that file).
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
-- Signed in as p_user, or signed out (null: an app's request with the public key), as Supabase
-- sets it for a request.
create function pg_temp.as_user(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_user is null then '{"role": "anon"}'
                         else json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text end,
                    true)
$$;
-- An order placed in p_shop by whoever is signed in (the orders trigger sets the buyer).
create function pg_temp.order_in(p_shop text, p_number text, p_method text) returns text language sql as $$
  insert into public.orders (tenant_id, order_number, status, type, total_amount, items, customer_name, fulfilment)
  values (p_shop, p_number, 'pending', case when p_method = 'delivery' then 'delivery' else 'takeaway' end, 12.5,
          '[{"name": "zz Kaya toast", "quantity": 2, "price": 5}, {"name": "zz Teh", "quantity": 1, "price": 2.5}]'::jsonb,
          'zz Buyer Cai', case when p_method is null then null else jsonb_build_object('method', p_method) end)
  returning id
$$;
create function pg_temp.token_of(p_order text) returns text language sql as $$
  select h.token from app.order_handovers h where h.order_id = p_order
$$;
create function pg_temp.pin_of(p_order text) returns text language sql as $$
  select h.pin from app.order_handovers h where h.order_id = p_order
$$;
-- A wrong code for p_order (its own code plus p_by, wrapped round).
create function pg_temp.wrong_pin(p_order text, p_by integer) returns text language sql as $$
  select lpad(((pg_temp.pin_of(p_order)::integer + p_by) % 1000000)::text, 6, '0')
$$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_owner uuid := gen_random_uuid();      -- shop A's owner
  v_owner_b uuid := gen_random_uuid();    -- shop B's owner
  v_merchant uuid := gen_random_uuid();   -- a business store's owner
  v_buyer uuid := gen_random_uuid();      -- a signed-in buyer
  v_other uuid := gen_random_uuid();      -- another signed-in person
  v_shop text := gen_random_uuid()::text;
  v_shop_b text := gen_random_uuid()::text;
  v_store text := gen_random_uuid()::text;
  v_o1 text;  -- the buyer's self-collect order: scanned
  v_o2 text;  -- the buyer's order: wrong codes, a wait, then the right code
  v_o3 text;  -- the buyer's order: the 6-digit code
  v_o4 text;  -- the buyer's delivery order: scanned at the door
  v_o5 text;  -- the buyer's order, cancelled
  v_o6 text;  -- the buyer's order: capitals and spaces around the token
  v_o7 text;  -- the buyer's order: its code waits, its QR still works
  v_c1 text;  -- the buyer's delivery order: the courier scans the QR through the link
  v_c2 text;  -- the buyer's delivery order: the courier types the code through the link
  v_c3 text;  -- the buyer's delivery order: links replaced, stopped, run out; then cancelled
  v_om text;  -- a business store's order
  v_og text;  -- a business store's order placed signed out
  v_ob text;  -- shop B's order
  v_os text;  -- an order shop A made itself (no buyer)
  v_ol text;  -- shop A's order without a QR (as if placed before)
  v_l1 text;
  v_l2 text;
  v_l3 text;
  v_l4 text;
  v_ans jsonb;
  v_n integer;
  v_s text;
  v_row record;
  v_at timestamptz;
  v_until timestamptz;
begin
  insert into auth.users (id, email) values
    (v_owner, 'zz-handover-owner@example.com'), (v_owner_b, 'zz-handover-owner-b@example.com'),
    (v_merchant, 'zz-handover-merchant@example.com'), (v_buyer, 'zz-handover-buyer@example.com'),
    (v_other, 'zz-handover-other@example.com');
  insert into public.tenants (id, name, slug, owner_email, seller_type, status, is_public) values
    (v_shop, 'zz Handover Shop', 'zz-handover-' || left(v_shop, 8), 'zz-handover-owner@example.com', 'individual', 'active', false),
    (v_shop_b, 'zz Handover Shop B', 'zz-handover-b-' || left(v_shop_b, 8), 'zz-handover-owner-b@example.com', 'individual', 'active', false),
    (v_store, 'zz Handover Store', 'zz-handover-m-' || left(v_store, 8), 'zz-handover-merchant@example.com', 'merchant', 'active', false);
  insert into public.tenant_users (tenant_id, user_email, status, is_owner, user_name) values
    (v_shop, 'zz-handover-owner@example.com', 'active', true, 'zz Owner Ann'),
    (v_shop_b, 'zz-handover-owner-b@example.com', 'active', true, 'zz Owner Bo'),
    (v_store, 'zz-handover-merchant@example.com', 'active', true, 'zz Merchant May');

  -- Live: a business store takes orders only on a plan (a trial here).
  if to_regclass('public.subscriptions') is not null then
    execute 'insert into public.subscriptions (tenant_id, tier, status, current_period_end) values ($1, ''starter'', ''trial'', now() + interval ''7 days'')'
      using v_store;
  end if;

  -- ── Issued with every home seller's order ───────────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  v_o1 := pg_temp.order_in(v_shop, 'ZZ-1', 'collection');
  v_o2 := pg_temp.order_in(v_shop, 'ZZ-2', 'collection');
  v_o3 := pg_temp.order_in(v_shop, 'ZZ-3', 'collection');
  v_o4 := pg_temp.order_in(v_shop, 'ZZ-4', 'delivery');
  v_o5 := pg_temp.order_in(v_shop, 'ZZ-5', 'collection');
  v_o6 := pg_temp.order_in(v_shop, 'ZZ-6', 'collection');
  v_o7 := pg_temp.order_in(v_shop, 'ZZ-7', 'collection');
  v_c1 := pg_temp.order_in(v_shop, 'ZZ-C1', 'delivery');
  v_c2 := pg_temp.order_in(v_shop, 'ZZ-C2', 'delivery');
  v_c3 := pg_temp.order_in(v_shop, 'ZZ-C3', 'delivery');
  -- As if placed before the QRs: made with no sign-in in play (no buyer, so no QR), the buyer added after.
  perform set_config('request.jwt.claims', '', true);
  v_ol := pg_temp.order_in(v_shop, 'ZZ-L1', 'collection');
  update public.orders set buyer_id = v_buyer::text where id = v_ol;
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  v_ob := pg_temp.order_in(v_shop_b, 'ZZ-B1', 'collection');
  v_om := pg_temp.order_in(v_store, 'ZZ-M1', null);
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_os := pg_temp.order_in(v_shop, 'ZZ-S1', 'collection');

  select count(*) into v_n from app.order_handovers h
   where h.order_id = v_o1 and h.tenant_id = v_shop and h.holder_uid = v_buyer::text
     and h.token ~ '^[0-9a-f]{32}$' and h.pin ~ '^[0-9]{6}$' and h.issued_at is not null and h.verified_at is null;
  v_res := v_res || pg_temp.r('a home seller''s order gets a QR and a 6-digit code, kept for the account that placed it', v_n = 1, v_n::text);
  select count(*) into v_n from app.order_handovers h where h.order_id = v_o4 and h.holder_uid = v_buyer::text;
  v_res := v_res || pg_temp.r('delivery orders too', v_n = 1, v_n::text);
  select count(*) into v_n from app.order_handovers h where h.order_id = v_os;
  v_res := v_res || pg_temp.r('an order the shop made itself (no buyer): none', v_n = 0, v_n::text);
  select count(*) into v_n from app.order_handovers h where h.order_id = v_om;
  v_res := v_res || pg_temp.r('a business store''s order: none', v_n = 0, v_n::text);
  select count(distinct h.token) into v_n from app.order_handovers h
   where h.order_id in (v_o1, v_o2, v_o3, v_o4, v_o5, v_o6, v_o7, v_c1, v_c2, v_c3);
  v_res := v_res || pg_temp.r('each order its own QR', v_n = 10, v_n::text);

  -- ── A home seller's order needs a signed-in buyer ────────────────────────────────────────
  perform pg_temp.as_user(null, null);
  begin
    v_s := pg_temp.order_in(v_shop, 'ZZ-G1', 'collection');
    v_res := v_res || pg_temp.r('signed out: a home seller''s order is refused', false, 'placed ' || v_s);
  exception when others then
    v_res := v_res || pg_temp.r('signed out: a home seller''s order is refused',
      sqlstate = '42501' and sqlerrm = 'Please sign in to order from this shop.', sqlstate || ' ' || sqlerrm);
  end;
  v_og := pg_temp.order_in(v_store, 'ZZ-G2', null);
  v_res := v_res || pg_temp.r('…a business store''s signed-out order as before', v_og is not null, coalesce(v_og, 'none'));

  -- The real checkout (live only: the local copy has no place_shop_order).
  if to_regprocedure('public.place_shop_order(text,jsonb,uuid,text,text,text,text,date,text,text)') is not null then
    declare
      v_product text;
      v_real jsonb;
    begin
      insert into public.products (tenant_id, name, price) values (v_shop, 'zz Ondeh', 6) returning id into v_product;
      perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
      v_real := public.place_shop_order(v_shop, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'options', '[]'::jsonb)),
                                        gen_random_uuid(), 'collection', 'zz Buyer Cai', '91234567');
      select count(*) into v_n from app.order_handovers h where h.order_id = v_real ->> 'id' and h.holder_uid = v_buyer::text;
      v_res := v_res || pg_temp.r('the real checkout (place_shop_order): QR issued for the buyer', v_n = 1, coalesce(v_real ->> 'id', 'no order'));
      v_res := v_res || pg_temp.r('…and its answer doesn''t carry the QR', v_real::text !~ pg_temp.token_of(v_real ->> 'id'), 'checked');
      perform pg_temp.as_user(null, null);
      begin
        v_real := public.place_shop_order(v_shop, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'options', '[]'::jsonb)),
                                          gen_random_uuid(), 'collection', 'zz Guest', '91234568');
        v_res := v_res || pg_temp.r('the real checkout signed out: refused', false, coalesce(v_real ->> 'id', 'placed'));
      exception when others then
        v_res := v_res || pg_temp.r('the real checkout signed out: refused', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
      end;
    end;
  end if;

  -- ── Nobody reads or writes the QRs directly ───────────────────────────────────────────────
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  execute 'set role authenticated';
  begin
    select count(*) into v_n from app.order_handovers;
    v_res := v_res || pg_temp.r('the shop can''t read the QRs', false, v_n::text);
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('the shop can''t read the QRs', true, sqlstate);
  end;
  begin
    update app.order_handovers set verified_at = now(), verified_via = 'qr' where order_id = v_o1;
    v_res := v_res || pg_temp.r('nor mark one verified itself', false, 'wrote');
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('nor mark one verified itself', true, sqlstate);
  end;

  -- ── Only a verified scan completes an order with a buyer's QR ─────────────────────────────
  begin
    update public.orders set status = 'completed' where id = v_o1;
    v_res := v_res || pg_temp.r('the shop can''t mark it collected without the scan', false, 'completed');
  exception when others then
    v_res := v_res || pg_temp.r('the shop can''t mark it collected without the scan', sqlerrm = 'Scan the buyer’s QR to hand over this order.', sqlerrm);
  end;
  begin
    update public.orders set status = 'completed' where id = v_c3;
    v_res := v_res || pg_temp.r('nor delivered', false, 'completed');
  exception when others then
    v_res := v_res || pg_temp.r('nor delivered', sqlstate = '42501', sqlstate);
  end;
  update public.orders set status = 'ready' where id in (v_o1, v_o2, v_o3, v_o4, v_o6, v_o7, v_c1, v_c2, v_c3);
  select count(*) into v_n from public.orders o where o.id in (v_o1, v_o2, v_o3, v_o4, v_o6, v_o7, v_c1, v_c2, v_c3) and o.status = 'ready';
  v_res := v_res || pg_temp.r('other steps as before (ready)', v_n = 9, v_n::text);
  update public.orders set status = 'cancelled' where id = v_o5;
  select count(*) into v_n from public.orders o where o.id = v_o5 and o.status = 'cancelled';
  v_res := v_res || pg_temp.r('cancelling as before', v_n = 1, v_n::text);
  update public.orders set status = 'completed' where id in (v_os, v_ol);
  select count(*) into v_n from public.orders o where o.id in (v_os, v_ol) and o.status = 'completed';
  v_res := v_res || pg_temp.r('an order with no QR (the shop''s own, from before) is marked collected as before', v_n = 2, v_n::text);
  execute 'reset role';

  v_res := v_res || pg_temp.r('signed out: only the courier link''s functions',
    not has_function_privilege('anon', 'public.my_handover(text)', 'execute')
      and not has_function_privilege('anon', 'public.shop_handovers(text,text[])', 'execute')
      and not has_function_privilege('anon', 'public.shop_handover_scan(text,text)', 'execute')
      and not has_function_privilege('anon', 'public.shop_handover_pin(text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.shop_courier_link(text,text,text,boolean)', 'execute')
      and has_function_privilege('anon', 'public.courier_handover(text)', 'execute')
      and has_function_privilege('anon', 'public.courier_handover_scan(text,text)', 'execute')
      and has_function_privilege('anon', 'public.courier_handover_pin(text,text)', 'execute')
      and has_function_privilege('authenticated', 'public.shop_handover_scan(text,text)', 'execute')
      and has_function_privilege('authenticated', 'public.shop_courier_link(text,text,text,boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.my_handover(text)', 'execute'), 'privileges');
  v_res := v_res || pg_temp.r('the QR makers, the checks and the recorder aren''t callable by apps',
    not has_function_privilege('authenticated', 'app.handover_token()', 'execute')
      and not has_function_privilege('authenticated', 'app.handover_pin()', 'execute')
      and not has_function_privilege('authenticated', 'app.handover_pin_check(text,text)', 'execute')
      and not has_function_privilege('authenticated', 'app.courier_answer(jsonb)', 'execute')
      and not has_function_privilege('anon', 'app.handover_complete(text,text,text,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'app.handover_complete(text,text,text,boolean)', 'execute'), 'privileges');

  -- ── The buyer sees their QR, from the server ──────────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  v_ans := public.my_handover(v_o1);
  v_res := v_res || pg_temp.r('the buyer gets their QR and code',
    v_ans ->> 'token' = pg_temp.token_of(v_o1) and v_ans ->> 'pin' = pg_temp.pin_of(v_o1)
      and v_ans ->> 'status' = 'ready', (v_ans - 'token' - 'pin')::text);
  select h.shown_count, h.first_shown_at into v_n, v_at from app.order_handovers h where h.order_id = v_o1;
  v_res := v_res || pg_temp.r('noted as shown on the buyer''s phone', v_n = 1 and v_at is not null, v_n::text);
  perform public.my_handover(v_o1);
  perform public.my_handover(v_o1);
  select h.shown_count into v_n from app.order_handovers h where h.order_id = v_o1;
  v_res := v_res || pg_temp.r('an open screen asking again doesn''t count again (at most once every 2 minutes)', v_n = 1, v_n::text);
  update app.order_handovers set last_shown_at = now() - interval '3 minutes' where order_id = v_o1;
  perform public.my_handover(v_o1);
  select h.shown_count, h.first_shown_at into v_n, v_s from app.order_handovers h where h.order_id = v_o1;
  v_res := v_res || pg_temp.r('…but later it does, keeping the first time', v_n = 2 and v_s::timestamptz = v_at, v_n::text);
  perform pg_temp.as_user(v_other, 'zz-handover-other@example.com');
  v_ans := public.my_handover(v_o1);
  v_res := v_res || pg_temp.r('another account: nothing', v_ans is null, coalesce(v_ans::text, 'null'));
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_ans := public.my_handover(v_o1);
  v_res := v_res || pg_temp.r('the shop asking as a buyer: nothing', v_ans is null, coalesce(v_ans::text, 'null'));
  perform pg_temp.as_user(null, null);
  v_ans := public.my_handover(v_o1);
  v_res := v_res || pg_temp.r('signed out: nothing', v_ans is null, coalesce(v_ans::text, 'null'));
  -- An order with no QR added to an account later (claim_my_orders sets the buyer): still nobody's.
  update public.orders set buyer_id = v_other::text where id = v_os;
  perform pg_temp.as_user(v_other, 'zz-handover-other@example.com');
  v_ans := public.my_handover(v_os);
  v_res := v_res || pg_temp.r('an order with no QR added to an account later: no QR appears (shops know buyers'' device ids)', v_ans is null, coalesce(v_ans::text, 'null'));

  -- ── The shop's view ───────────────────────────────────────────────────────────────────────
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  select * into v_row from public.shop_handovers(v_shop, array[v_o1, v_os, v_ol, v_ob]) s where s.order_id = v_o1;
  v_res := v_res || pg_temp.r('the shop sees: the buyer has a QR, issued, shown on their phone',
    v_row.has_qr and v_row.pin_paused_until is null and v_row.issued_at is not null and v_row.first_shown_at = v_at
      and v_row.verified_at is null and v_row.courier_link is null,
    coalesce(v_row.has_qr::text, 'none'));
  select string_agg(k, ',' order by k) into v_s
    from jsonb_object_keys((select to_jsonb(s) from public.shop_handovers(v_shop, array[v_o1]) s limit 1)) k;
  v_res := v_res || pg_temp.r('never the QR or the code', v_s !~ '(^|,)(token|pin)(,|$)', v_s);
  select count(*) filter (where s.has_qr), count(*) into v_n, v_s from public.shop_handovers(v_shop, array[v_o1, v_os, v_ol, v_ob]) s;
  v_res := v_res || pg_temp.r('its own orders with a QR only', v_n = 1 and v_s = '1', v_n || ' of ' || v_s);
  perform pg_temp.as_user(v_owner_b, 'zz-handover-owner-b@example.com');
  begin
    perform public.shop_handovers(v_shop, array[v_o1]);
    v_res := v_res || pg_temp.r('another shop can''t look', false, 'looked');
  exception when others then
    v_res := v_res || pg_temp.r('another shop can''t look', sqlstate = '42501', sqlstate);
  end;

  -- ── Scanning ──────────────────────────────────────────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  begin
    perform public.shop_handover_scan(v_shop, pg_temp.token_of(v_o1));
    v_res := v_res || pg_temp.r('a buyer can''t scan', false, 'scanned');
  exception when others then
    v_res := v_res || pg_temp.r('a buyer can''t scan', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_o1));
  v_res := v_res || pg_temp.r('the buyer''s QR scanned: verified and collected in one go',
    (v_ans ->> 'ok')::boolean and v_ans ->> 'order_id' = v_o1 and v_ans ->> 'method' = 'collection' and v_ans ->> 'verified_via' = 'qr'
      and v_ans ->> 'verified_by_name' = 'zz Owner Ann' and v_ans ->> 'customer_name' = 'zz Buyer Cai' and jsonb_array_length(v_ans -> 'items') = 2
      and not (v_ans ->> 'verified_by_courier')::boolean,
    (v_ans - 'items')::text);
  select count(*) into v_n from public.orders o where o.id = v_o1 and o.status = 'completed';
  select h.verified_at into v_at from app.order_handovers h
   where h.order_id = v_o1 and h.verified_via = 'qr' and h.verified_by = 'zz-handover-owner@example.com' and h.verified_by_name = 'zz Owner Ann'
     and not h.verified_by_courier;
  v_res := v_res || pg_temp.r('the order is completed; the record says when and who', v_n = 1 and v_at is not null, coalesce(v_at::text, 'none'));
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_o1));
  v_res := v_res || pg_temp.r('scanning it again: already collected, when and by whom (nothing changes)',
    v_ans ->> 'reason' = 'already' and (v_ans ->> 'verified_at')::timestamptz = v_at and v_ans ->> 'verified_by_name' = 'zz Owner Ann', v_ans::text);
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_ob));
  v_res := v_res || pg_temp.r('another shop''s QR', v_ans ->> 'reason' = 'other_shop' and not (v_ans ? 'order_id'), v_ans::text);
  select count(*) into v_n from public.orders o where o.id = v_ob and o.status = 'pending';
  v_res := v_res || pg_temp.r('…left as it was', v_n = 1, v_n::text);
  v_ans := public.shop_handover_scan(v_shop, 'https://wa.me/6591234567');
  v_res := v_res || pg_temp.r('something else', v_ans ->> 'reason' = 'unknown', v_ans::text);
  v_ans := public.shop_handover_scan(v_shop, replace(gen_random_uuid()::text, '-', ''));
  v_res := v_res || pg_temp.r('a QR nobody was issued', v_ans ->> 'reason' = 'unknown', v_ans::text);
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_o5));
  v_res := v_res || pg_temp.r('a cancelled order', v_ans ->> 'reason' = 'cancelled' and v_ans ->> 'order_id' = v_o5, v_ans::text);
  v_ans := public.shop_handover_scan(v_shop, upper(' ' || pg_temp.token_of(v_o6) || ' '));
  v_res := v_res || pg_temp.r('capitals and spaces around it don''t matter', (v_ans ->> 'ok')::boolean, v_ans::text);
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_o4));
  v_res := v_res || pg_temp.r('a delivery order scanned at the door: delivered', (v_ans ->> 'ok')::boolean and v_ans ->> 'method' = 'delivery', v_ans::text);
  perform pg_temp.as_user(v_owner_b, 'zz-handover-owner-b@example.com');
  v_ans := public.shop_handover_scan(v_shop_b, pg_temp.token_of(v_o2));
  v_res := v_res || pg_temp.r('a shop scanning another shop''s buyer''s QR in its own shop', v_ans ->> 'reason' = 'other_shop', v_ans::text);
  begin
    perform public.shop_handover_scan(v_shop, pg_temp.token_of(v_o2));
    v_res := v_res || pg_temp.r('nor in that shop', false, 'scanned');
  exception when others then
    v_res := v_res || pg_temp.r('nor in that shop', sqlstate = '42501', sqlstate);
  end;

  -- ── The 6-digit code: every 5th wrong one makes it wait 5 minutes (the QR still works) ─────
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  for i in 1 .. 4 loop
    v_ans := public.shop_handover_pin(v_shop, v_o2, pg_temp.wrong_pin(v_o2, i));
  end loop;
  v_res := v_res || pg_temp.r('a wrong code says how many tries are left before a wait', v_ans ->> 'reason' = 'wrong_pin' and (v_ans ->> 'tries_left')::integer = 1, v_ans::text);
  v_ans := public.shop_handover_pin(v_shop, v_o2, pg_temp.wrong_pin(v_o2, 5));
  v_res := v_res || pg_temp.r('the fifth wrong code: wait 5 minutes',
    v_ans ->> 'reason' = 'paused' and (v_ans ->> 'paused_until')::timestamptz between now() + interval '299 seconds' and now() + interval '301 seconds', v_ans::text);
  v_ans := public.shop_handover_pin(v_shop, v_o2, pg_temp.pin_of(v_o2));
  v_res := v_res || pg_temp.r('meanwhile even the right code is refused', v_ans ->> 'reason' = 'paused', v_ans::text);
  select count(*) into v_n from public.orders o where o.id = v_o2 and o.status = 'ready';
  select h.wrong_tries into v_s from app.order_handovers h where h.order_id = v_o2;
  v_res := v_res || pg_temp.r('…the order is as it was, the wrong tries kept (the refused right one isn''t one)', v_n = 1 and v_s = '5', v_s);
  select s.pin_paused_until into v_until from public.shop_handovers(v_shop, array[v_o2]) s;
  v_res := v_res || pg_temp.r('the shop sees until when it waits', v_until > now(), coalesce(v_until::text, 'none'));
  update app.order_handovers set pin_paused_until = now() - interval '1 second' where order_id = v_o2;
  v_ans := public.shop_handover_pin(v_shop, v_o2, pg_temp.wrong_pin(v_o2, 6));
  v_res := v_res || pg_temp.r('after the wait: 5 more tries (never locked for good)', v_ans ->> 'reason' = 'wrong_pin' and (v_ans ->> 'tries_left')::integer = 4, v_ans::text);
  v_ans := public.shop_handover_pin(v_shop, v_o2, pg_temp.pin_of(v_o2));
  v_res := v_res || pg_temp.r('…and the right code works', (v_ans ->> 'ok')::boolean and v_ans ->> 'verified_via' = 'pin', v_ans::text);
  select h.wrong_tries into v_s from app.order_handovers h where h.order_id = v_o2;
  v_res := v_res || pg_temp.r('every wrong code is on the record', v_s = '6', v_s);
  for i in 1 .. 5 loop
    v_ans := public.shop_handover_pin(v_shop, v_o7, pg_temp.wrong_pin(v_o7, i));
  end loop;
  v_ans := public.shop_handover_scan(v_shop, pg_temp.token_of(v_o7));
  v_res := v_res || pg_temp.r('while the code waits, the QR still works', (v_ans ->> 'ok')::boolean and v_ans ->> 'order_id' = v_o7, v_ans::text);
  v_ans := public.shop_handover_pin(v_shop, v_o3, substr(pg_temp.pin_of(v_o3), 1, 3) || ' ' || substr(pg_temp.pin_of(v_o3), 4));
  v_res := v_res || pg_temp.r('the right code (typed with a space): verified and collected',
    (v_ans ->> 'ok')::boolean and v_ans ->> 'verified_via' = 'pin', v_ans::text);
  select count(*) into v_n from public.orders o where o.id = v_o3 and o.status = 'completed';
  v_res := v_res || pg_temp.r('…the order completed', v_n = 1, v_n::text);
  v_ans := public.shop_handover_pin(v_shop, v_ob, '123456');
  v_res := v_res || pg_temp.r('a code for another shop''s order: none here', v_ans ->> 'reason' = 'no_qr', v_ans::text);

  -- ── The courier link ─────────────────────────────────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  begin
    perform public.shop_courier_link(v_shop, v_c1, null, false);
    v_res := v_res || pg_temp.r('a buyer can''t make a courier link', false, 'made');
  exception when others then
    v_res := v_res || pg_temp.r('a buyer can''t make a courier link', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_owner_b, 'zz-handover-owner-b@example.com');
  begin
    perform public.shop_courier_link(v_shop, v_c1, null, false);
    v_res := v_res || pg_temp.r('nor another shop', false, 'made');
  exception when others then
    v_res := v_res || pg_temp.r('nor another shop', sqlstate = '42501', sqlstate);
  end;
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_ans := public.shop_courier_link(v_shop, v_os, null, false);
  v_res := v_res || pg_temp.r('no link for an order without a buyer''s QR', v_ans ->> 'reason' = 'no_qr', v_ans::text);
  v_ans := public.shop_courier_link(v_shop, v_o1, null, false);
  v_res := v_res || pg_temp.r('…nor for one handed over', v_ans ->> 'reason' = 'already_completed', v_ans::text);
  v_ans := public.shop_courier_link(v_shop, v_o5, null, false);
  v_res := v_res || pg_temp.r('…nor for a cancelled one', v_ans ->> 'reason' = 'cancelled', v_ans::text);
  v_ans := public.shop_courier_link(v_shop, v_c1, E'  zz Rider\tAhmad  ', false);
  v_l1 := v_ans ->> 'link';
  v_res := v_res || pg_temp.r('the shop makes a courier link: one-time, for 24 hours, with the courier''s name',
    (v_ans ->> 'ok')::boolean and v_l1 ~ '^[0-9a-f]{32}$' and v_l1 <> pg_temp.token_of(v_c1) and v_ans ->> 'courier_name' = 'zz Rider Ahmad'
      and (v_ans ->> 'expires_at')::timestamptz between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute', v_ans::text);
  select * into v_row from public.shop_handovers(v_shop, array[v_c1]) s;
  v_res := v_res || pg_temp.r('the shop sees the link working, not opened yet',
    v_row.courier_link = v_l1 and v_row.courier_name = 'zz Rider Ahmad' and v_row.courier_link_expires_at > now() and v_row.courier_opened_at is null,
    coalesce(v_row.courier_link, 'none'));

  perform pg_temp.as_user(null, null);
  v_ans := public.courier_handover(v_l1);
  v_res := v_res || pg_temp.r('the courier (no account) opens it: the shop, the order number, delivery',
    (v_ans ->> 'ok')::boolean and v_ans ->> 'shop_name' = 'zz Handover Shop' and v_ans ->> 'order_number' = 'ZZ-C1' and v_ans ->> 'method' = 'delivery', v_ans::text);
  select string_agg(k, ',' order by k) into v_s from jsonb_object_keys(v_ans) k;
  v_res := v_res || pg_temp.r('…nothing about the buyer, never the QR or the code',
    v_s !~ '(customer|phone|address|items|token|pin|buyer|order_id)' and v_ans::text !~ pg_temp.token_of(v_c1) and v_ans::text !~ pg_temp.pin_of(v_c1), v_s);
  select count(*) into v_n from app.order_handovers h where h.order_id = v_c1 and h.courier_opened_at is not null;
  v_res := v_res || pg_temp.r('…noted as opened', v_n = 1, v_n::text);
  v_ans := public.courier_handover(upper(' ' || v_l1 || ' '));
  v_res := v_res || pg_temp.r('…capitals and spaces don''t matter', (v_ans ->> 'ok')::boolean, v_ans::text);
  v_ans := public.courier_handover(replace(gen_random_uuid()::text, '-', ''));
  v_res := v_res || pg_temp.r('a link nobody made', v_ans ->> 'reason' = 'invalid' and not (v_ans ? 'order_number'), v_ans::text);
  v_ans := public.courier_handover('not a link');
  v_res := v_res || pg_temp.r('…or not a link at all', v_ans ->> 'reason' = 'invalid', v_ans::text);
  v_ans := public.courier_handover(pg_temp.token_of(v_c1));
  v_res := v_res || pg_temp.r('the buyer''s QR token isn''t a courier link', v_ans ->> 'reason' = 'invalid', v_ans::text);
  v_ans := public.courier_handover_scan(v_l1, pg_temp.token_of(v_c2));
  v_res := v_res || pg_temp.r('the courier scans another order''s QR: not this order', v_ans ->> 'reason' = 'not_this_order', v_ans::text);
  select count(*) into v_n from public.orders o where o.id in (v_c1, v_c2) and o.status = 'ready';
  v_res := v_res || pg_temp.r('…both left as they were', v_n = 2, v_n::text);
  v_ans := public.courier_handover_scan(v_l1, 'https://sellio.sg/Orders?qr=' || pg_temp.token_of(v_c1));
  v_res := v_res || pg_temp.r('…a whole link isn''t a token (the page sends the token)', v_ans ->> 'reason' = 'not_this_order', v_ans::text);
  v_ans := public.courier_handover_scan(v_l1, upper(pg_temp.token_of(v_c1)));
  select string_agg(k, ',' order by k) into v_s from jsonb_object_keys(v_ans) k;
  v_res := v_res || pg_temp.r('the courier scans the buyer''s QR at the door: delivered',
    (v_ans ->> 'ok')::boolean and v_ans ->> 'order_number' = 'ZZ-C1' and v_ans ->> 'method' = 'delivery' and v_ans ->> 'verified_via' = 'qr'
      and v_s = 'method,ok,order_number,verified_at,verified_via', v_ans::text);
  select count(*) into v_n from public.orders o where o.id = v_c1 and o.status = 'completed';
  select count(*) into v_s from app.order_handovers h
   where h.order_id = v_c1 and h.verified_by_courier and h.verified_by is null and h.verified_by_name = 'zz Rider Ahmad'
     and h.verified_via = 'qr' and h.courier_link is null and h.courier_link_expires_at is null;
  v_res := v_res || pg_temp.r('…the order completed; the record: by the courier, named; the link gone', v_n = 1 and v_s = '1', v_n || '/' || v_s);
  v_ans := public.courier_handover(v_l1);
  v_res := v_res || pg_temp.r('the link no longer works', v_ans ->> 'reason' = 'invalid', v_ans::text);
  v_ans := public.courier_handover_scan(v_l1, pg_temp.token_of(v_c1));
  v_res := v_res || pg_temp.r('…not even to scan again', v_ans ->> 'reason' = 'invalid', v_ans::text);
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  select * into v_row from public.shop_handovers(v_shop, array[v_c1]) s;
  v_res := v_res || pg_temp.r('the shop sees it delivered by the courier',
    v_row.verified_at is not null and v_row.verified_by_courier and v_row.verified_by_name = 'zz Rider Ahmad' and v_row.courier_link is null,
    coalesce(v_row.verified_by_name, 'none'));
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  v_ans := public.my_handover(v_c1);
  v_res := v_res || pg_temp.r('…and the buyer sees it verified, the QR gone',
    not (v_ans ? 'token') and v_ans ->> 'status' = 'completed' and v_ans ->> 'verified_via' = 'qr', v_ans::text);

  -- The courier types the buyer's code (the same waits as the shop's: one count per order).
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_l2 := public.shop_courier_link(v_shop, v_c2, '', false) ->> 'link';
  perform pg_temp.as_user(null, null);
  for i in 1 .. 4 loop
    v_ans := public.courier_handover_pin(v_l2, pg_temp.wrong_pin(v_c2, i));
  end loop;
  v_res := v_res || pg_temp.r('the courier types wrong codes', v_ans ->> 'reason' = 'wrong_pin' and (v_ans ->> 'tries_left')::integer = 1 and not (v_ans ? 'order_id'), v_ans::text);
  v_ans := public.courier_handover_pin(v_l2, pg_temp.wrong_pin(v_c2, 5));
  v_res := v_res || pg_temp.r('…the fifth: wait', v_ans ->> 'reason' = 'paused' and v_ans ? 'paused_until', v_ans::text);
  v_ans := public.courier_handover(v_l2);
  v_res := v_res || pg_temp.r('…the courier''s page knows until when', (v_ans ->> 'ok')::boolean and (v_ans ->> 'paused_until')::timestamptz > now(), v_ans::text);
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_ans := public.shop_handover_pin(v_shop, v_c2, pg_temp.pin_of(v_c2));
  v_res := v_res || pg_temp.r('…the shop has to wait too (one count per order)', v_ans ->> 'reason' = 'paused', v_ans::text);
  update app.order_handovers set pin_paused_until = now() - interval '1 second' where order_id = v_c2;
  perform pg_temp.as_user(null, null);
  v_ans := public.courier_handover_pin(v_l2, substr(pg_temp.pin_of(v_c2), 1, 3) || ' ' || substr(pg_temp.pin_of(v_c2), 4));
  v_res := v_res || pg_temp.r('after the wait the right code: delivered', (v_ans ->> 'ok')::boolean and v_ans ->> 'verified_via' = 'pin' and not (v_ans ? 'customer_name'), v_ans::text);
  select count(*) into v_n from app.order_handovers h
   where h.order_id = v_c2 and h.verified_by_courier and h.verified_by_name is null and h.verified_via = 'pin' and h.courier_link is null;
  v_res := v_res || pg_temp.r('…by the courier (no name given)', v_n = 1, v_n::text);

  -- Links replaced, stopped and run out; a cancelled order's.
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_l3 := public.shop_courier_link(v_shop, v_c3, 'zz First rider', false) ->> 'link';
  v_l4 := public.shop_courier_link(v_shop, v_c3, 'zz Second rider', false) ->> 'link';
  perform pg_temp.as_user(null, null);
  v_ans := public.courier_handover(v_l3);
  v_s := public.courier_handover(v_l4) ->> 'courier_name';
  v_res := v_res || pg_temp.r('a new link replaces the last one', v_ans ->> 'reason' = 'invalid' and v_s = 'zz Second rider', v_ans::text || ' / ' || coalesce(v_s, 'none'));
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_ans := public.shop_courier_link(v_shop, v_c3, null, true);
  perform pg_temp.as_user(null, null);
  v_res := v_res || pg_temp.r('the shop stops it', (v_ans ->> 'stopped')::boolean and public.courier_handover(v_l4) ->> 'reason' = 'invalid', v_ans::text);
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_l3 := public.shop_courier_link(v_shop, v_c3, null, false) ->> 'link';
  update app.order_handovers set courier_link_expires_at = now() - interval '1 minute' where order_id = v_c3;
  select s.courier_link into v_s from public.shop_handovers(v_shop, array[v_c3]) s;
  perform pg_temp.as_user(null, null);
  v_ans := public.courier_handover_scan(v_l3, pg_temp.token_of(v_c3));
  v_res := v_res || pg_temp.r('after 24 hours it doesn''t work (and the shop doesn''t list it)', v_ans ->> 'reason' = 'invalid' and v_s is null, v_ans::text);
  perform pg_temp.as_user(v_owner, 'zz-handover-owner@example.com');
  v_l4 := public.shop_courier_link(v_shop, v_c3, null, false) ->> 'link';
  update public.orders set status = 'cancelled' where id = v_c3;
  perform pg_temp.as_user(null, null);
  v_ans := public.courier_handover(v_l4);
  v_res := v_res || pg_temp.r('a cancelled order''s link: the page says it doesn''t work', v_ans ->> 'reason' = 'invalid', v_ans::text);
  v_ans := public.courier_handover_scan(v_l4, pg_temp.token_of(v_c3));
  select count(*) into v_n from public.orders o where o.id = v_c3 and o.status = 'cancelled';
  v_res := v_res || pg_temp.r('…and its QR scanned through it: cancelled, left as it was', v_ans ->> 'reason' = 'cancelled' and v_n = 1, v_ans::text);

  -- ── What the buyer sees after ────────────────────────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-handover-buyer@example.com');
  v_ans := public.my_handover(v_o1);
  v_res := v_res || pg_temp.r('after the scan the QR is gone; the buyer sees when it was verified',
    not (v_ans ? 'token') and not (v_ans ? 'pin') and v_ans ->> 'status' = 'completed'
      and (v_ans ->> 'verified_at')::timestamptz = v_at and v_ans ->> 'verified_via' = 'qr', v_ans::text);
  v_ans := public.my_handover(v_o3);
  v_res := v_res || pg_temp.r('…or verified with their code', v_ans ->> 'verified_via' = 'pin', v_ans::text);
  v_ans := public.my_handover(v_o5);
  v_res := v_res || pg_temp.r('a cancelled order: no QR', not (v_ans ? 'token') and v_ans ->> 'status' = 'cancelled', v_ans::text);

  -- ── The codes themselves ─────────────────────────────────────────────────────────────────
  select count(*), count(distinct p) into v_n, v_s from (select app.handover_pin() p from generate_series(1, 300)) x
   where p ~ '^[0-9]{6}$';
  v_res := v_res || pg_temp.r('6-digit codes are always 6 digits and vary', v_n = 300 and v_s::integer > 290, v_n || ' / ' || v_s);
  select count(*) into v_n from (select app.handover_pin() p from generate_series(1, 2000)) x where p like '0%';
  v_res := v_res || pg_temp.r('…leading zeros included (about 1 in 10)', v_n between 100 and 320, v_n::text);
  select count(distinct t) into v_n from (select app.handover_token() t from generate_series(1, 300)) x where t ~ '^[0-9a-f]{32}$';
  v_res := v_res || pg_temp.r('QR tokens are 32 hex characters and never repeat', v_n = 300, v_n::text);

  perform pg_temp.as_user(null, null);
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) e where (e ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean));
end
$test$;
