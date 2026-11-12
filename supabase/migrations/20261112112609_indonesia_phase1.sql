-- Indonesia, Phase 1 (Alvin, 12 Nov 2026: "Proceed with this").
--
-- 1. Each shop keeps its own time zone, kept to its country's: Indonesia WIB (Jakarta), WITA
--    (Makassar) or WIT (Jayapura), Jakarta by default; Singapore and Malaysia Singapore time,
--    as before. A shop's "today" (home-shop pre-order dates) and its AI allowance month now
--    follow it; Sellio World and the referral cut-offs stay on Singapore time for now.
-- 2. +62 mobile numbers: account setup and a home shop's checkout accept Indonesian mobiles
--    (+62 8…, 9 to 12 digits after +62; a home shop's buyer may type 08… or 628…), and a home
--    shop opened with a +62 number is in Indonesia, in rupiah.
-- 3. Rupiah-sized amounts: a home shop's delivery charge and free-delivery amount scale with
--    its currency (rupiah: 10,000 times the dollar limits, in save_shop_selling and in
--    app.shop_selling's own checks), and customers.total_spent is wider (numeric(10,2)
--    stopped at about Rp100 million).
-- 4. New-order alerts write the shop's money as the app does: S$18.50, RM18.50, Rp38.000.
--
-- Existing functions are changed in place by replacing the exact text that changes (each must
-- be found exactly once, or nothing is applied), so the rest of each function stays as it is.

-- ── 1. Time zones ──────────────────────────────────────────────────────────────────────────

create or replace function app.tenant_timezone(p_tenant_id text)
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select case when t.timezone in ('Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Kuching',
                                     'Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura')
                 then t.timezone end
       from public.tenants t
      where t.id = p_tenant_id),
    'Asia/Singapore')
$$;

create or replace function app.shop_today(p_tenant_id text)
returns date
language sql
stable
set search_path to ''
as $$ select (now() at time zone app.tenant_timezone(p_tenant_id))::date $$;

create or replace function app.ai_month_start(p_tenant_id text)
returns date
language sql
stable
set search_path to ''
as $$ select (date_trunc('month', now() at time zone app.tenant_timezone(p_tenant_id)))::date $$;

create or replace function app.ai_month_resets_at(p_tenant_id text)
returns timestamp with time zone
language sql
stable
set search_path to ''
as $$ select ((app.ai_month_start(p_tenant_id) + interval '1 month')::timestamp at time zone app.tenant_timezone(p_tenant_id)) $$;

-- A shop's time zone stays one of its country's.
create or replace function app.tenant_zone_for_country()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.country = 'Indonesia' then
    if new.timezone is null or new.timezone not in ('Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura') then
      new.timezone := 'Asia/Jakarta';
    end if;
  elsif new.timezone is null or new.timezone not in ('Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Kuching') then
    new.timezone := 'Asia/Singapore';
  end if;
  return new;
end
$$;

drop trigger if exists tenants_zone_for_country on public.tenants;
create trigger tenants_zone_for_country
  before insert or update of country, timezone on public.tenants
  for each row execute function app.tenant_zone_for_country();

-- ── 3. Rupiah-sized amounts ────────────────────────────────────────────────────────────────

-- 10,000 for a shop in rupiah, else 1 (a home shop's selling limits are set in dollars).
create or replace function app.money_scale(p_tenant_id text)
returns numeric
language sql
stable
set search_path to ''
as $$
  select case when (select t.currency from public.tenants t where t.id = p_tenant_id) = 'IDR' then 10000 else 1 end::numeric
$$;

alter table public.customers alter column total_spent type numeric(16,2);

-- The table's own limits were S$500 and S$100,000 too; it now allows rupiah-sized amounts and
-- save_shop_selling keeps each shop to its currency's (S$500 or Rp5.000.000 a delivery; free
-- delivery from at most S$100,000 or Rp1.000.000.000).
alter table app.shop_selling
  drop constraint shop_selling_delivery_fee_check,
  drop constraint shop_selling_delivery_free_above_check,
  alter column delivery_free_above type numeric(14,2),
  add constraint shop_selling_delivery_fee_check check (delivery_fee >= 0 and delivery_fee <= 5000000),
  add constraint shop_selling_delivery_free_above_check
    check (delivery_free_above is null or (delivery_free_above > 0 and delivery_free_above <= 1000000000));

-- ── 4. Money in alerts ─────────────────────────────────────────────────────────────────────

-- As src/lib/money.js formatMoney: S$1,234.50, RM5.00, Rp38.000 (no decimals, a dot between
-- thousands); any other currency as "XXX 1,234.50".
create or replace function app.money_text(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when upper(coalesce(p_currency, 'SGD')) = 'IDR' then
      case when round(coalesce(p_amount, 0)) < 0 then '-' else '' end
      || 'Rp' || replace(to_char(abs(round(coalesce(p_amount, 0))), 'FM999,999,999,999,990'), ',', '.')
    else
      case when coalesce(p_amount, 0) < 0 then '-' else '' end
      || case upper(coalesce(p_currency, 'SGD')) when 'SGD' then 'S$' when 'MYR' then 'RM' else upper(p_currency) || ' ' end
      || to_char(abs(coalesce(p_amount, 0)), 'FM999,999,999,990.00')
  end
$$;

revoke all on function app.tenant_timezone(text) from public, anon, authenticated;
revoke all on function app.shop_today(text) from public, anon, authenticated;
revoke all on function app.ai_month_start(text) from public, anon, authenticated;
revoke all on function app.ai_month_resets_at(text) from public, anon, authenticated;
revoke all on function app.tenant_zone_for_country() from public, anon, authenticated;
revoke all on function app.money_scale(text) from public, anon, authenticated;
revoke all on function app.money_text(numeric, text) from public, anon, authenticated;

-- ── Changes to existing functions ──────────────────────────────────────────────────────────

do $migration$
declare
  v_changes jsonb := jsonb_build_array(
    -- 1. The shop's own day and AI month.
    jsonb_build_array('public', 'get_shop_selling', 'app.shop_today()', 'app.shop_today(p_tenant_id)'),
    jsonb_build_array('public', 'place_shop_order', 'app.shop_today()', 'app.shop_today(p_tenant_id)'),
    jsonb_build_array('public', 'ai_monthly_refund', 'app.ai_month_start()', 'app.ai_month_start(p_tenant_id)'),
    jsonb_build_array('public', 'ai_monthly_take', 'app.ai_month_start()', 'app.ai_month_start(p_tenant_id)'),
    jsonb_build_array('public', 'my_ai_allowance', 'app.ai_month_start()', 'app.ai_month_start(p_tenant_id)'),
    -- 2. +62 numbers.
    jsonb_build_array('public', 'place_shop_order',
      E'  elsif v_phone ~ \'^601[0-9]{8,9}$\' then v_phone := \'+\' || v_phone;\n',
      E'  elsif v_phone ~ \'^601[0-9]{8,9}$\' then v_phone := \'+\' || v_phone;\n'
      || E'  elsif v_phone ~ \'^08[1-9][0-9]{7,10}$\' then v_phone := \'+62\' || substr(v_phone, 2);\n'
      || E'  elsif v_phone ~ \'^628[1-9][0-9]{7,10}$\' then v_phone := \'+\' || v_phone;\n'),
    jsonb_build_array('public', 'place_shop_order',
      E'if v_phone !~ \'^\\+65[89][0-9]{7}$\' and v_phone !~ \'^\\+601[0-9]{8,9}$\' then',
      E'if v_phone !~ \'^\\+65[89][0-9]{7}$\' and v_phone !~ \'^\\+601[0-9]{8,9}$\' and v_phone !~ \'^\\+628[1-9][0-9]{7,10}$\' then'),
    jsonb_build_array('public', 'place_shop_order',
      'Please enter a Singapore or Malaysia mobile number.', 'Please enter a valid mobile number.'),
    jsonb_build_array('public', 'complete_account_setup',
      E'if v_phone !~ \'^\\+65[89][0-9]{7}$\' and v_phone !~ \'^\\+601[0-9]{8,9}$\' then',
      E'if v_phone !~ \'^\\+65[89][0-9]{7}$\' and v_phone !~ \'^\\+601[0-9]{8,9}$\' and v_phone !~ \'^\\+628[1-9][0-9]{7,10}$\' then'),
    jsonb_build_array('public', 'complete_account_setup',
      'Please enter a valid Singapore or Malaysia mobile number.', 'Please enter a valid mobile number.'),
    jsonb_build_array('public', 'create_personal_store',
      E'  if v_phone like \'+60%\' then v_country := \'Malaysia\'; v_currency := \'MYR\';\n',
      E'  if v_phone like \'+60%\' then v_country := \'Malaysia\'; v_currency := \'MYR\';\n'
      || E'  elsif v_phone like \'+62%\' then v_country := \'Indonesia\'; v_currency := \'IDR\';\n'),
    -- 3. Rupiah-sized home-shop amounts.
    jsonb_build_array('app', 'shop_amount', '^[0-9]{1,6}(\.[0-9]{1,2})?$', '^[0-9]{1,10}(\.[0-9]{1,2})?$'),
    jsonb_build_array('public', 'save_shop_selling',
      E'    if v_fee is not null and v_fee > 500 then\n'
      || E'      raise exception \'The delivery charge can be at most 500.\' using',
      E'    if v_fee is not null and v_fee > 500 * app.money_scale(p_tenant_id) then\n'
      || E'      raise exception \'The delivery charge can be at most %.\', 500 * app.money_scale(p_tenant_id) using'),
    jsonb_build_array('public', 'save_shop_selling',
      E'    if v_free is not null and (v_free <= 0 or v_free > 100000) then\n'
      || E'      raise exception \'The free-delivery amount must be between 0.01 and 100000.\' using',
      E'    if v_free is not null and (v_free <= 0 or v_free > 100000 * app.money_scale(p_tenant_id)) then\n'
      || E'      raise exception \'The free-delivery amount must be between 0.01 and %.\', 100000 * app.money_scale(p_tenant_id) using'),
    -- 4. Alerts.
    jsonb_build_array('app', 'order_new_alert',
      E'coalesce(v_currency, \'SGD\') || \' \' || to_char(coalesce(o.total_amount, 0), \'FM999999990.00\')',
      E'app.money_text(coalesce(o.total_amount, 0), v_currency)'),
    jsonb_build_array('app', 'order_new_alert', '· 3 items · SGD 18.50', '· 3 items · S$18.50')
  );
  v_change jsonb;
  v_defs jsonb := '{}'::jsonb;
  v_key text;
  v_def text;
  v_oid oid;
  v_found int;
begin
  -- Each function's current text, once.
  for v_change in select * from jsonb_array_elements(v_changes) loop
    v_key := (v_change ->> 0) || '.' || (v_change ->> 1);
    if not v_defs ? v_key then
      select p.oid into v_oid
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = v_change ->> 0 and p.proname = v_change ->> 1 and p.prokind = 'f';
      if v_oid is null or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = v_change ->> 0 and p.proname = v_change ->> 1) <> 1 then
        raise exception 'Indonesia phase 1: % not found once', v_key;
      end if;
      v_defs := v_defs || jsonb_build_object(v_key, pg_get_functiondef(v_oid));
      v_oid := null;
    end if;
    v_def := v_defs ->> v_key;
    v_found := (length(v_def) - length(replace(v_def, v_change ->> 2, ''))) / length(v_change ->> 2);
    -- The day and month helpers may be used more than once in a function (all of them change).
    if v_found = 0 or (v_found > 1 and v_change ->> 2 not like 'app.%()') then
      raise exception 'Indonesia phase 1: % has % of %', v_key, v_found, v_change ->> 2;
    end if;
    v_defs := jsonb_set(v_defs, array[v_key], to_jsonb(replace(v_def, v_change ->> 2, v_change ->> 3)));
  end loop;
  -- ai_monthly_take and my_ai_allowance also say when the month resets.
  for v_key in select unnest(array['public.ai_monthly_take', 'public.my_ai_allowance']) loop
    v_def := v_defs ->> v_key;
    if position('app.ai_month_resets_at()' in v_def) = 0 then
      raise exception 'Indonesia phase 1: % has no app.ai_month_resets_at()', v_key;
    end if;
    v_defs := jsonb_set(v_defs, array[v_key], to_jsonb(replace(v_def, 'app.ai_month_resets_at()', 'app.ai_month_resets_at(p_tenant_id)')));
  end loop;
  for v_key in select jsonb_object_keys(v_defs) loop
    execute v_defs ->> v_key;
  end loop;
end
$migration$;
