-- Order stock (24 Nov 2026): every rule of supabase/migrations/20261123164134_order_stock.sql, in
-- one transaction that ends by raising its results ("TEST RESULTS {passed, failed, failures}"), so
-- nothing stays: its shops, people, items and orders (zz-stock-…@example.com) go with the rest.
-- Live: paste the whole file into the Supabase SQL editor (or execute_sql), after the migration or
-- after its text in the same run.
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
create function pg_temp.as_user(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_user is null then '{"role": "anon"}'
                         else json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text end,
                    true)
$$;
create function pg_temp.stock(p_product text) returns integer language sql as $$
  select stock_quantity from public.products where id = p_product
$$;
create function pg_temp.counted(p_product text) returns integer language sql as $$
  select current_stock from public.inventory_items where product_id = p_product
$$;
-- One line of p_product × p_qty, as the cart sends it.
create function pg_temp.line(p_product text, p_qty integer, p_notes text default null) returns jsonb language sql as $$
  select jsonb_build_object('product_id', p_product, 'quantity', p_qty, 'options', '[]'::jsonb, 'notes', p_notes)
$$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_seller uuid := gen_random_uuid();
  v_store text := gen_random_uuid()::text;
  v_shop text := gen_random_uuid()::text;
  v_cookies text;   -- counted: 3
  v_tart text;      -- counted: 0 (sold out)
  v_kopi text;      -- not counted
  v_nonum text;     -- counted, but no number set
  v_jar text;       -- the home seller's, counted: 2
  v_o1 jsonb;
  v_o2 jsonb;
  v_o3 jsonb;
  v_o4 jsonb;
  v_n integer;
  v_s text;
  v_d text;
  v_h text;
  v_item text;
begin
  insert into auth.users (id, email) values
    (v_owner, 'zz-stock-owner@example.com'), (v_staff, 'zz-stock-staff@example.com'),
    (v_buyer, 'zz-stock-buyer@example.com'), (v_seller, 'zz-stock-seller@example.com');
  insert into public.tenants (id, name, slug, owner_email, seller_type, status, is_public) values
    (v_store, 'zz Stock Store', 'zz-stock-' || left(v_store, 8), 'zz-stock-owner@example.com', 'merchant', 'active', false),
    (v_shop, 'zz Stock Shop', 'zz-stock-h-' || left(v_shop, 8), 'zz-stock-seller@example.com', 'individual', 'active', false);
  insert into public.tenant_users (tenant_id, user_email, status, is_owner, user_name) values
    (v_store, 'zz-stock-owner@example.com', 'active', true, 'zz Owner Ong'),
    (v_store, 'zz-stock-staff@example.com', 'active', false, 'zz Staff Siti'),
    (v_shop, 'zz-stock-seller@example.com', 'active', true, 'zz Seller Sam');
  insert into public.subscriptions (tenant_id, tier, status, current_period_end)
  values (v_store, 'starter', 'trial', now() + interval '7 days');
  insert into public.products (tenant_id, name, price, track_inventory, stock_quantity) values
    (v_store, 'zz Butter cookies', 6, true, 3) returning id into v_cookies;
  insert into public.products (tenant_id, name, price, track_inventory, stock_quantity) values
    (v_store, 'zz Tart tin', 18, true, 0) returning id into v_tart;
  insert into public.products (tenant_id, name, price, track_inventory, stock_quantity) values
    (v_store, 'zz Kopi', 2, false, 0) returning id into v_kopi;
  insert into public.products (tenant_id, name, price, track_inventory, stock_quantity) values
    (v_store, 'zz No number', 3, true, null) returning id into v_nonum;
  insert into public.products (tenant_id, name, price, track_inventory, stock_quantity) values
    (v_shop, 'zz Kaya jar', 7, true, 2) returning id into v_jar;
  insert into public.inventory_items (tenant_id, product_id, current_stock) values (v_store, v_cookies, 3);

  -- ── A buyer takes from the stock, and can't go past it ──────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-stock-buyer@example.com');
  v_o1 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 2)));
  v_res := v_res || pg_temp.r('a buyer''s order of 2 (3 left) goes through', v_o1 ->> 'id' is not null, coalesce(v_o1 ->> 'id', 'none'));
  v_res := v_res || pg_temp.r('…and the count is 1', pg_temp.stock(v_cookies) = 1, pg_temp.stock(v_cookies)::text);
  v_res := v_res || pg_temp.r('…and the inventory record follows', pg_temp.counted(v_cookies) = 1, pg_temp.counted(v_cookies)::text);
  select count(*) into v_n from app.order_stock_moves m where m.order_id = v_o1 ->> 'id' and m.quantity = 2 and m.returned_at is null;
  v_res := v_res || pg_temp.r('…and the order''s take is recorded', v_n = 1, v_n::text);

  begin
    v_o2 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 2)));
    v_res := v_res || pg_temp.r('2 more (1 left): refused', false, coalesce(v_o2 ->> 'id', 'placed'));
  exception when others then
    get stacked diagnostics v_d = pg_exception_detail, v_h = pg_exception_hint;
    v_res := v_res || pg_temp.r('2 more (1 left): refused, "Only 1 left of …", out_of_stock',
      sqlstate = '22023' and sqlerrm = 'Only 1 left of zz Butter cookies.' and v_h = 'out_of_stock'
        and (v_d::jsonb ->> 'left') = '1' and (v_d::jsonb ->> 'product_id') = v_cookies,
      sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_h, '') || ' ' || coalesce(v_d, ''));
  end;
  v_res := v_res || pg_temp.r('…and nothing changed', pg_temp.stock(v_cookies) = 1, pg_temp.stock(v_cookies)::text);
  select count(*) into v_n from public.orders o where o.tenant_id = v_store;
  v_res := v_res || pg_temp.r('…and no order was kept', v_n = 1, v_n::text);

  -- Two lines of the same item (other notes): counted together.
  begin
    v_o2 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 1), pg_temp.line(v_cookies, 1, 'zz gift wrap')));
    v_res := v_res || pg_temp.r('two lines of the item, 1 + 1 (1 left): refused', false, coalesce(v_o2 ->> 'id', 'placed'));
  exception when others then
    v_res := v_res || pg_temp.r('two lines of the item, 1 + 1 (1 left): refused', sqlstate = '22023' and sqlerrm = 'Only 0 left of zz Butter cookies.' or sqlerrm = 'zz Butter cookies is sold out.', sqlerrm);
  end;
  v_res := v_res || pg_temp.r('…and the first line''s take went back with it', pg_temp.stock(v_cookies) = 1, pg_temp.stock(v_cookies)::text);

  -- Signed out (a table's QR, a store page): the same.
  perform pg_temp.as_user(null, null);
  v_o2 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 1)));
  v_res := v_res || pg_temp.r('signed out, the last one: goes through, the count is 0', v_o2 ->> 'id' is not null and pg_temp.stock(v_cookies) = 0, pg_temp.stock(v_cookies)::text);
  begin
    v_o3 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 1)));
    v_res := v_res || pg_temp.r('signed out, none left: refused', false, 'placed');
  exception when others then
    get stacked diagnostics v_d = pg_exception_detail, v_h = pg_exception_hint;
    v_res := v_res || pg_temp.r('signed out, none left: "… is sold out."', sqlstate = '22023' and sqlerrm = 'zz Butter cookies is sold out.' and v_h = 'out_of_stock' and (v_d::jsonb ->> 'left') = '0', sqlerrm);
  end;
  begin
    v_o3 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_tart, 1)));
    v_res := v_res || pg_temp.r('an item at 0: refused', false, 'placed');
  exception when others then
    v_res := v_res || pg_temp.r('an item at 0: refused', sqlerrm = 'zz Tart tin is sold out.', sqlerrm);
  end;

  -- Not counted, or no number: left alone.
  v_o3 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_kopi, 5), pg_temp.line(v_nonum, 4)));
  v_res := v_res || pg_temp.r('items without a counted stock: any number, nothing changes',
    v_o3 ->> 'id' is not null and pg_temp.stock(v_kopi) = 0 and pg_temp.stock(v_nonum) is null,
    coalesce(pg_temp.stock(v_kopi)::text, 'null') || ' ' || coalesce(pg_temp.stock(v_nonum)::text, 'null'));
  select count(*) into v_n from app.order_stock_moves m where m.order_id = v_o3 ->> 'id';
  v_res := v_res || pg_temp.r('…and no take recorded', v_n = 0, v_n::text);

  -- ── The shop's own team: not refused, never below 0 ─────────────────────────────────────
  perform pg_temp.as_user(v_staff, 'zz-stock-staff@example.com');
  v_o3 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 2)));
  v_res := v_res || pg_temp.r('staff at the Counter, none left: not refused', v_o3 ->> 'id' is not null, coalesce(v_o3 ->> 'id', 'none'));
  v_res := v_res || pg_temp.r('…and the count stays 0', pg_temp.stock(v_cookies) = 0 and pg_temp.counted(v_cookies) = 0, pg_temp.stock(v_cookies)::text);
  select m.quantity into v_n from app.order_stock_moves m where m.order_id = v_o3 ->> 'id';
  v_res := v_res || pg_temp.r('…and it took 0 (nothing to give back later)', v_n = 0, coalesce(v_n::text, 'none'));

  -- ── Cancelled, deleted, a line taken off: it goes back ──────────────────────────────────
  update public.orders set status = 'cancelled' where id = v_o1 ->> 'id';
  v_res := v_res || pg_temp.r('the buyer''s order of 2 cancelled: the count is 2', pg_temp.stock(v_cookies) = 2 and pg_temp.counted(v_cookies) = 2, pg_temp.stock(v_cookies)::text);
  update public.orders set status = 'pending' where id = v_o1 ->> 'id';
  update public.orders set status = 'cancelled' where id = v_o1 ->> 'id';
  v_res := v_res || pg_temp.r('…cancelled again: not put back twice', pg_temp.stock(v_cookies) = 2, pg_temp.stock(v_cookies)::text);
  update public.orders set status = 'cancelled' where id = v_o3 ->> 'id';
  v_res := v_res || pg_temp.r('…the staff order (took 0) cancelled: no change', pg_temp.stock(v_cookies) = 2, pg_temp.stock(v_cookies)::text);

  update public.orders set is_deleted = true where id = v_o2 ->> 'id';
  v_res := v_res || pg_temp.r('the signed-out order (1) deleted: the count is 3', pg_temp.stock(v_cookies) = 3, pg_temp.stock(v_cookies)::text);

  -- Staff editing an order: its lines go and are added again (EditOrderModal deletes them; the
  -- delete trigger calls the same app.stock_return as marking one deleted, tried here, so this
  -- test has no DELETE for the SQL connector to stop for a confirmation).
  v_o4 := public.place_order(v_store, jsonb_build_array(pg_temp.line(v_cookies, 2)));
  v_res := v_res || pg_temp.r('staff order of 2: the count is 1', pg_temp.stock(v_cookies) = 1, pg_temp.stock(v_cookies)::text);
  select id into v_item from public.order_items where order_id = v_o4 ->> 'id';
  update public.order_items set is_deleted = true where id = v_item;
  v_res := v_res || pg_temp.r('its line marked deleted: back to 3', pg_temp.stock(v_cookies) = 3, pg_temp.stock(v_cookies)::text);
  update public.order_items set is_deleted = true where id = v_item;
  v_res := v_res || pg_temp.r('…marked again: not put back twice', pg_temp.stock(v_cookies) = 3, pg_temp.stock(v_cookies)::text);
  insert into public.order_items (tenant_id, order_id, product_id, product_name, quantity, unit_price, total_price)
  values (v_store, v_o4 ->> 'id', v_cookies, 'zz Butter cookies', 1, 6, 6) returning id into v_item;
  v_res := v_res || pg_temp.r('…a line of 1 added: the count is 2', pg_temp.stock(v_cookies) = 2, pg_temp.stock(v_cookies)::text);
  update public.orders set status = 'cancelled' where id = v_o4 ->> 'id';
  v_res := v_res || pg_temp.r('…the order cancelled: what''s left of its take goes back (3)', pg_temp.stock(v_cookies) = 3 and pg_temp.counted(v_cookies) = 3, pg_temp.stock(v_cookies)::text);

  -- ── A home seller's checkout (place_shop_order) ─────────────────────────────────────────
  perform pg_temp.as_user(v_buyer, 'zz-stock-buyer@example.com');
  v_o1 := public.place_shop_order(v_shop, jsonb_build_array(pg_temp.line(v_jar, 2)), gen_random_uuid(), 'collection', 'zz Buyer Bea', '91234567');
  v_res := v_res || pg_temp.r('a home seller''s checkout takes from the stock (2 of 2)', v_o1 ->> 'id' is not null and pg_temp.stock(v_jar) = 0, coalesce(pg_temp.stock(v_jar)::text, 'null'));
  begin
    v_o2 := public.place_shop_order(v_shop, jsonb_build_array(pg_temp.line(v_jar, 1)), gen_random_uuid(), 'collection', 'zz Buyer Bea', '91234567');
    v_res := v_res || pg_temp.r('…sold out: refused', false, 'placed');
  exception when others then
    v_res := v_res || pg_temp.r('…sold out: refused', sqlerrm = 'zz Kaya jar is sold out.', sqlerrm);
  end;

  -- ── Nobody reads or writes the record directly ──────────────────────────────────────────
  execute 'set role authenticated';
  begin
    select count(*) into v_n from app.order_stock_moves;
    v_res := v_res || pg_temp.r('the app can''t read the takes', false, v_n::text);
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('the app can''t read the takes', true, sqlstate);
  end;
  begin
    perform app.stock_return(v_o1 ->> 'id', null);
    v_res := v_res || pg_temp.r('the app can''t give stock back', false, 'ran');
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('the app can''t give stock back', true, sqlstate);
  end;
  execute 'reset role';

  perform pg_temp.as_user(null, null);
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) e where (e ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean));
end
$test$;
