-- Indonesia, Phase 1 in the database (supabase/migrations/20261112112609_indonesia_phase1.sql):
-- each shop's own time zone (Jakarta, Makassar, Jayapura in Indonesia; Singapore time for
-- Singapore and Malaysia, as before) for its day and AI month; +62 mobiles in account setup,
-- home shops and their checkout; rupiah-sized home-shop amounts; a wider customers.total_spent;
-- new-order alerts in the shop's money. Everything below is rolled back.
-- Run with execute_sql (or psql) once the migration is applied.
begin;
do $test$
declare
  shops_email text := 'sellio-id-shops-' || gen_random_uuid() || '@example.invalid';
  id_tenant text := gen_random_uuid()::text;
  sg_tenant text := gen_random_uuid()::text;
  sri uuid := gen_random_uuid();
  tan uuid := gen_random_uuid();
  sri_email text;
  tan_email text;
  r jsonb;
  v_shop text;
  v_sg_shop text;
  v_product text := gen_random_uuid()::text;
  v_msg text;
  v_def text;
  blocked boolean;
  -- Numbers no account has (random), so the checks never meet a real one.
  sri_phone text := '+62899' || lpad((floor(random() * 1e8))::bigint::text, 8, '0');
  tan_phone text := '+658' || lpad((floor(random() * 1e7))::bigint::text, 7, '0');
begin
  sri_email := 'sellio-id-sri-' || sri || '@example.invalid';
  tan_email := 'sellio-id-tan-' || tan || '@example.invalid';

  -- 1. Each shop's time zone, kept to its country's.
  insert into public.tenants(id, name, slug, owner_email, status, plan, billing_status, country, currency, is_public)
  values (id_tenant, 'Temporary Indonesia test', 'id-test-' || id_tenant, shops_email, 'suspended', 'free', 'none', 'Indonesia', 'IDR', false),
         (sg_tenant, 'Temporary Singapore test', 'sg-test-' || sg_tenant, shops_email, 'suspended', 'free', 'none', 'Singapore', 'SGD', false);
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Jakarta', 'An Indonesian shop starts on Jakarta time';
  assert (select timezone from public.tenants where id = sg_tenant) = 'Asia/Singapore', 'A Singapore shop is on Singapore time';
  update public.tenants set timezone = 'Asia/Makassar' where id = id_tenant;
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Makassar', 'WITA can be chosen';
  update public.tenants set timezone = 'Europe/London' where id = id_tenant;
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Jakarta', 'A zone outside Indonesia goes back to Jakarta';
  update public.tenants set timezone = 'Asia/Jakarta' where id = sg_tenant;
  assert (select timezone from public.tenants where id = sg_tenant) = 'Asia/Singapore', 'A Singapore shop cannot be on Jakarta time';
  update public.tenants set timezone = 'Asia/Kuala_Lumpur' where id = sg_tenant;
  assert (select timezone from public.tenants where id = sg_tenant) = 'Asia/Kuala_Lumpur', 'Malaysia time (the same clock) is kept';
  update public.tenants set country = 'Singapore', currency = 'SGD' where id = id_tenant;
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Singapore', 'Moving to Singapore moves the clock';
  update public.tenants set country = 'Indonesia', currency = 'IDR', timezone = 'Asia/Jayapura' where id = id_tenant;
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Jayapura', 'WIT kept';
  update public.tenants set name = 'Renamed' where id = id_tenant;
  assert (select timezone from public.tenants where id = id_tenant) = 'Asia/Jayapura', 'Other changes leave the clock alone';
  update public.tenants set timezone = 'Asia/Singapore' where id = sg_tenant;

  assert app.tenant_timezone(id_tenant) = 'Asia/Jayapura';
  assert app.tenant_timezone(sg_tenant) = 'Asia/Singapore';
  assert app.tenant_timezone('no-such-shop') = 'Asia/Singapore', 'No shop: Singapore time';
  assert app.tenant_timezone(null) = 'Asia/Singapore';
  assert app.shop_today(id_tenant) = (now() at time zone 'Asia/Jayapura')::date;
  assert app.shop_today(sg_tenant) = app.shop_today(), 'A Singapore shop: the same day as before';
  assert app.ai_month_start(sg_tenant) = app.ai_month_start(), 'A Singapore shop: the same AI month as before';
  assert app.ai_month_resets_at(sg_tenant) = app.ai_month_resets_at();
  assert app.ai_month_start(id_tenant) = (date_trunc('month', now() at time zone 'Asia/Jayapura'))::date;
  assert app.ai_month_resets_at(id_tenant) = ((date_trunc('month', now() at time zone 'Asia/Jayapura') + interval '1 month')::timestamp at time zone 'Asia/Jayapura');

  -- The functions that changed use the shop's own clock (and no longer Singapore's).
  foreach v_msg in array array['get_shop_selling(text)', 'place_shop_order(text,jsonb,uuid,text,text,text,text,date,text,text)'] loop
    v_def := pg_get_functiondef(('public.' || v_msg)::regprocedure);
    assert position('app.shop_today(p_tenant_id)' in v_def) > 0 and position('app.shop_today()' in v_def) = 0, v_msg || ': the shop''s own day';
  end loop;
  foreach v_msg in array array['ai_monthly_take(text,text)', 'ai_monthly_refund(text,text)', 'my_ai_allowance(text)'] loop
    v_def := pg_get_functiondef(('public.' || v_msg)::regprocedure);
    assert position('app.ai_month_start(p_tenant_id)' in v_def) > 0 and position('app.ai_month_start()' in v_def) = 0, v_msg || ': the shop''s own month';
    assert position('app.ai_month_resets_at()' in v_def) = 0, v_msg || ': resets on the shop''s clock';
  end loop;

  -- 3 and 4. Rupiah-sized amounts, money in alerts.
  assert app.money_scale(id_tenant) = 10000 and app.money_scale(sg_tenant) = 1;
  assert app.money_text(38000, 'IDR') = 'Rp38.000';
  assert app.money_text(1234567.4, 'IDR') = 'Rp1.234.567';
  assert app.money_text(999.6, 'IDR') = 'Rp1.000';
  assert app.money_text(-5000, 'IDR') = '-Rp5.000';
  assert app.money_text(18.5, 'SGD') = 'S$18.50';
  assert app.money_text(1234.5, 'sgd') = 'S$1,234.50';
  assert app.money_text(5, 'MYR') = 'RM5.00';
  assert app.money_text(null, null) = 'S$0.00';
  assert app.money_text(9.99, 'USD') = 'USD 9.99';
  assert (select numeric_precision = 16 and numeric_scale = 2 from information_schema.columns
           where table_schema = 'public' and table_name = 'customers' and column_name = 'total_spent'), 'customers.total_spent is wider';
  assert app.shop_amount('"1500000"'::jsonb, 'x') = 1500000, 'Seven-digit amounts (rupiah)';
  assert app.shop_amount('"5.50"'::jsonb, 'x') = 5.50;
  blocked := false;
  begin perform app.shop_amount('"12345678901"'::jsonb, 'x'); exception when others then blocked := true; end;
  assert blocked, 'Eleven digits refused';

  -- 2. +62 in account setup; a +62 home shop is in Indonesia, in rupiah, on Jakarta time.
  insert into auth.users(id, email, aud, role) values (sri, sri_email, 'authenticated', 'authenticated'), (tan, tan_email, 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sri, 'email', sri_email, 'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp')))::text, true);
  blocked := false;
  begin perform public.complete_account_setup('Sri', '+62812345'); exception when others then blocked := sqlerrm = 'Please enter a valid mobile number.'; end;
  assert blocked, 'A short +62 number is refused, in neutral words';
  r := public.complete_account_setup('Sri Wahyuni', sri_phone);
  assert (r ->> 'ok')::boolean, '+62 accepted';
  assert (select phone from public.app_users where lower(email) = sri_email) = sri_phone;
  r := public.create_personal_store('Kue Bu Sri Test', true);
  v_shop := r ->> 'tenant_id';
  assert (select country = 'Indonesia' and currency = 'IDR' and timezone = 'Asia/Jakarta' and seller_type = 'individual'
            from public.tenants where id = v_shop), 'A +62 home shop: Indonesia, rupiah, Jakarta time';
  r := public.save_shop_selling(v_shop, jsonb_build_object(
    'collection', jsonb_build_object('enabled', true, 'area', 'Indramayu', 'address', 'Jl. Cilegeh 1', 'notes', null),
    'delivery', jsonb_build_object('enabled', true, 'fee_mode', 'extra', 'fee', '15000', 'free_above', '1500000', 'areas', null, 'notes', null),
    'preorder', jsonb_build_object('enabled', false, 'min_days', 0)));
  assert (select delivery_fee = 15000 and delivery_free_above = 1500000 from app.shop_selling where tenant_id = v_shop), 'Rupiah delivery charge and free-delivery amount saved';
  blocked := false;
  begin
    perform public.save_shop_selling(v_shop, jsonb_build_object(
      'collection', jsonb_build_object('enabled', true, 'area', 'Indramayu', 'address', 'Jl. Cilegeh 1', 'notes', null),
      'delivery', jsonb_build_object('enabled', true, 'fee_mode', 'extra', 'fee', '5000001', 'free_above', null, 'areas', null, 'notes', null),
      'preorder', jsonb_build_object('enabled', false, 'min_days', 0)));
  exception when others then blocked := sqlerrm = 'The delivery charge can be at most 5000000.'; end;
  assert blocked, 'A rupiah shop''s delivery charge stops at Rp5.000.000';
  -- The table's own limits allow rupiah-sized amounts, and no more.
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'shop_selling_delivery_fee_check' and conrelid = 'app.shop_selling'::regclass)
         like '%5000000%', 'app.shop_selling allows a Rp5.000.000 delivery charge';
  assert (select numeric_precision = 14 from information_schema.columns where table_schema = 'app' and table_name = 'shop_selling' and column_name = 'delivery_free_above'),
         'app.shop_selling.delivery_free_above is wide enough for rupiah';
  blocked := false;
  begin update app.shop_selling set delivery_fee = 5000001 where tenant_id = v_shop; exception when check_violation then blocked := true; end;
  assert blocked, 'The table refuses a delivery charge above Rp5.000.000';

  -- Singapore as before: +65 setup, a Singapore home shop, its S$500 limit.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', tan, 'email', tan_email, 'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object('method', 'otp')))::text, true);
  r := public.complete_account_setup('Tan', tan_phone);
  r := public.create_personal_store('Tan Bakes Test', true);
  v_sg_shop := r ->> 'tenant_id';
  assert (select country = 'Singapore' and currency = 'SGD' and timezone = 'Asia/Singapore' from public.tenants where id = v_sg_shop), 'A +65 home shop: Singapore as before';
  blocked := false;
  begin
    perform public.save_shop_selling(v_sg_shop, jsonb_build_object(
      'collection', jsonb_build_object('enabled', true, 'area', 'Tampines', 'address', 'Blk 1', 'notes', null),
      'delivery', jsonb_build_object('enabled', true, 'fee_mode', 'extra', 'fee', '501', 'free_above', null, 'areas', null, 'notes', null),
      'preorder', jsonb_build_object('enabled', false, 'min_days', 0)));
  exception when others then blocked := sqlerrm = 'The delivery charge can be at most 500.'; end;
  assert blocked, 'A dollar shop''s delivery charge still stops at 500';

  -- A buyer orders from the Indonesian home shop with 0812… (as typed in Indonesia).
  insert into public.products(id, tenant_id, name, price, is_active) values (v_product, v_shop, 'Kue lapis', 15000, true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  blocked := false;
  begin
    perform public.place_shop_order(v_shop, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'options', '[]'::jsonb)),
      gen_random_uuid(), 'collection', 'Budi', '0812', null, null, null, null);
  exception when others then blocked := sqlerrm = 'Please enter a valid mobile number.'; end;
  assert blocked, 'A short number is refused, in neutral words';
  r := public.place_shop_order(v_shop, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2, 'options', '[]'::jsonb)),
    gen_random_uuid(), 'delivery', 'Budi', '0812 3456 7890', 'Jl. Merdeka 10, Indramayu', null, null, null);
  assert r ->> 'customer_phone' = '+6281234567890', '0812… becomes +62812…: ' || coalesce(r ->> 'customer_phone', 'none');
  assert (r ->> 'total_amount')::numeric = 45000, 'Two at Rp15.000 plus the Rp15.000 delivery charge: ' || coalesce(r ->> 'total_amount', 'none');
  r := public.place_shop_order(v_shop, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1, 'options', '[]'::jsonb)),
    gen_random_uuid(), 'collection', 'Siti', substr(sri_phone, 2), null, null, null, null);
  assert r ->> 'customer_phone' = sri_phone, '62… becomes +62…';
  execute 'set constraints all immediate';
  assert exists (select 1 from public.notifications n where n.tenant_id = v_shop and n.type = 'new_order' and n.message like '%· Rp45.000'),
    'The new-order alert is in rupiah: ' || coalesce((select string_agg(message, ' | ') from public.notifications where tenant_id = v_shop), 'none');
end
$test$;
rollback;
select 'PASS: shop time zones and their day and AI month, +62 setup, home shops and checkout, rupiah amounts and alerts. All rolled back.' as verification;
