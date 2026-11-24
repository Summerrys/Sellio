-- Sellio Coins and Refer & earn for every shop (24 Nov 2026,
-- supabase/migrations/20261124185818_coins_and_referral_coins.sql): street coins worth 1–2, the
-- day's 30-coin limit, a code for every shop, 50 coins for a free seller brought in and 100 for a
-- business, a free seller's code earning once, and Admin → Coins. One transaction that ends by
-- raising its results ("TEST RESULTS {passed, failed, failures}"), so nothing stays. Live: paste the
-- whole file into the Supabase SQL editor (or execute_sql).
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
create function pg_temp.as_user(p_email text, p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_email is null then ''
                         else json_build_object('email', p_email, 'sub', p_id, 'role', 'authenticated')::text end,
                    true)
$$;
create function pg_temp.balance(p_user uuid) returns integer language sql as $$
  select coalesce((select w.balance from app.world_wallets w where w.user_id = p_user), 0)
$$;
do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_day date := app.shop_today();
  -- people
  up uuid := gen_random_uuid(); uq uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  um uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  ut uuid := gen_random_uuid(); uz uuid := gen_random_uuid(); uadm uuid := gen_random_uuid();
  -- shops
  fa text := gen_random_uuid()::text; fb text := gen_random_uuid()::text; fc text := gen_random_uuid()::text;
  m text := gen_random_uuid()::text; fd text := gen_random_uuid()::text; fe text := gen_random_uuid()::text;
  t text := gen_random_uuid()::text; fz text := gen_random_uuid()::text; ta text := gen_random_uuid()::text;
  v jsonb; v2 jsonb; v_err text; v_n integer; v_id uuid; v_drop uuid;
  v_code_fa text; v_code_m text; v_code_fz text; v_code_fd text; v_terms text;
begin
  begin
    insert into auth.users (id, email) values
      (up, 'zz-cr-p@example.com'), (uq, 'zz-cr-q@example.com'), (ua, 'zz-cr-a@example.com'), (ub, 'zz-cr-b@example.com'),
      (uc, 'zz-cr-c@example.com'), (um, 'zz-cr-m@example.com'), (ud, 'zz-cr-d@example.com'), (ue, 'zz-cr-e@example.com'),
      (ut, 'zz-cr-t@example.com'), (uz, 'zz-cr-z@example.com'), (uadm, 'zz-cr-admin@example.com');
    insert into public.app_users (email, full_name, role) values ('zz-cr-a@example.com', 'Fiona Tan', 'staff'), ('zz-cr-m@example.com', 'Marcus Lim', 'staff');
    insert into public.tenants (id, name, slug, owner_email, seller_type, status) values
      (fa, 'zz Fiona Bakes', 'zz-cr-fa-' || left(fa, 8), 'zz-cr-a@example.com', 'individual', 'active'),
      (fb, 'zz B Home', 'zz-cr-fb-' || left(fb, 8), 'zz-cr-b@example.com', 'individual', 'active'),
      (fc, 'zz C Home', 'zz-cr-fc-' || left(fc, 8), 'zz-cr-c@example.com', 'individual', 'active'),
      (m, 'zz Marcus Cafe', 'zz-cr-m-' || left(m, 8), 'zz-cr-m@example.com', 'merchant', 'active'),
      (fd, 'zz D Home', 'zz-cr-fd-' || left(fd, 8), 'zz-cr-d@example.com', 'individual', 'active'),
      (fe, 'zz E Home', 'zz-cr-fe-' || left(fe, 8), 'zz-cr-e@example.com', 'individual', 'active'),
      (t, 'zz Trial Shop', 'zz-cr-t-' || left(t, 8), 'zz-cr-t@example.com', 'merchant', 'active'),
      (ta, 'zz Admin Cafe', 'zz-cr-ta-' || left(ta, 8), 'zz-cr-admin@example.com', 'merchant', 'active'),
      (fz, 'zz Z Home', 'zz-cr-fz-' || left(fz, 8), 'zz-cr-z@example.com', 'individual', 'active');
    insert into public.tenant_users (tenant_id, user_email, is_owner, status) values
      (fa, 'zz-cr-a@example.com', true, 'active'), (fb, 'zz-cr-b@example.com', true, 'active'), (fc, 'zz-cr-c@example.com', true, 'active'),
      (m, 'zz-cr-m@example.com', true, 'active'), (fd, 'zz-cr-d@example.com', true, 'active'), (fe, 'zz-cr-e@example.com', true, 'active'),
      (t, 'zz-cr-t@example.com', true, 'active'), (fz, 'zz-cr-z@example.com', true, 'active'),
      (ta, 'zz-cr-admin@example.com', true, 'active');
    insert into public.subscriptions (tenant_id, tier, billing_cycle, status, current_period_end, stripe_subscription_id) values
      (m, 'growth', 'monthly', 'active', now() + interval '20 days', 'sub_zz_cr_m'),
      (t, 'starter', 'monthly', 'trial', now() + interval '5 days', 'sub_zz_cr_t'),
      (ta, 'pro', 'monthly', 'active', now() + interval '25 days', 'sub_zz_cr_ta');

    -- ── The coin rules ──
    v_res := v_res || pg_temp.r('rules: coins worth up to 2, 30 a day, 50 and 100 for referrals, free codes earn once',
      app.world_cfg_int('drop_max_value', 0) = 2 and app.world_cfg_int('daily_cap', 0) = 30
      and app.world_cfg_int('referral_coins_free', 0) = 50 and app.world_cfg_int('referral_coins_merchant', 0) = 100
      and app.world_cfg_int('referral_free_code_uses', 0) = 1, null);
    perform app.world_seed_drops(up, v_day, 40, false);
    perform app.world_seed_drops(up, v_day, 20, true);
    select count(*) into v_n from app.world_drops d where d.user_id = up and (d.value < 1 or d.value > 2);
    v_res := v_res || pg_temp.r('street and night-market coins are worth 1 or 2', v_n = 0
      and (select count(*) from app.world_drops d where d.user_id = up) = 60, v_n::text);
    v_res := v_res || pg_temp.r('night-market coins are worth 2', (select bool_and(d.value = 2) from app.world_drops d where d.user_id = up and d.night), null);
    v_res := v_res || pg_temp.r('"Find a 5-coin" is off', not (select active from app.world_mission_defs where code = 'big_coin'), null);
    v_res := v_res || pg_temp.r('paid awnings are off sale, the starting one stays',
      not exists (select 1 from app.world_cosmetics where slot = 'awning' and price > 0 and active)
      and exists (select 1 from app.world_cosmetics where id = 'awning:sunset' and active), null);
    delete from app.world_drops where user_id = up;

    -- The day's limit: playing earns at most 30.
    v_res := v_res || pg_temp.r('limit: 25 street coins credited', app.world_credit(up, 25, 'drop', 'zz-1') = 25, null);
    v_n := app.world_credit(up, 10, 'drop', 'zz-2');
    v_res := v_res || pg_temp.r('limit: the next 10 pay the 5 left', v_n = 30
      and (select delta from app.world_ledger where user_id = up and ref = 'zz-2') = 5, v_n::text);
    v_res := v_res || pg_temp.r('limit: then a shop visit pays nothing', app.world_credit(up, 2, 'visit', 'zz-3') is null
      and not exists (select 1 from app.world_ledger where user_id = up and ref = 'zz-3'), null);
    v_res := v_res || pg_temp.r('limit: missions and the daily reward pay nothing either',
      app.world_credit(up, 6, 'mission', 'zz-3m') is null and app.world_credit(up, 5, 'daily', 'zz-3d') is null, null);
    v_res := v_res || pg_temp.r('limit: badges still pay', app.world_credit(up, 7, 'achievement', 'zz-4') = 37, null);
    v_res := v_res || pg_temp.r('limit: referral coins still pay (and the ledger takes them)', app.world_credit(up, 5, 'referral', 'zz-5') = 42, null);
    v_res := v_res || pg_temp.r('limit: today''s play is 30, none left', app.world_play_today(up) = 30 and app.world_play_left(up) = 0, null);

    insert into app.world_drops (id, user_id, day, x, z, value) values (gen_random_uuid(), up, v_day, 0, 0, 2) returning id into v_drop;
    perform pg_temp.as_user('zz-cr-p@example.com', up);
    v := public.world_claim_drop(v_drop);
    v_res := v_res || pg_temp.r('limit reached: a coin on the street says daily_limit and stays',
      v ->> 'reason' = 'daily_limit' and (select claimed_at is null from app.world_drops where id = v_drop), v::text);
    v := app.world_profile(up, v_day, null);
    v_res := v_res || pg_temp.r('limit reached: no coins on the street, 30 of 30',
      v -> 'drops' = '[]'::jsonb and (v ->> 'daily_cap')::int = 30 and (v ->> 'today_earned')::int = 30 and (v ->> 'cap_left')::int = 0
      and (v ->> 'drop_max')::int = 2, v::text);
    v := public.world_claim_visit(fa);
    v_res := v_res || pg_temp.r('limit reached: a shop visit says daily_limit', v ->> 'reason' = 'daily_limit', v::text);

    update app.world_config set value = '0' where key = 'daily_cap';
    v_res := v_res || pg_temp.r('limit 0 means no limit', app.world_play_left(up) is null and app.world_credit(up, 5, 'drop', 'zz-6') = 47, null);
    update app.world_config set value = '30' where key = 'daily_cap';

    -- A new player: a coin pays in full and says what's left.
    insert into app.world_drops (id, user_id, day, x, z, value) values (gen_random_uuid(), uq, v_day, 0, 0, 2) returning id into v_drop;
    perform pg_temp.as_user('zz-cr-q@example.com', uq);
    v := public.world_claim_drop(v_drop);
    v_res := v_res || pg_temp.r('a coin pays its value and says how many are left today',
      (v ->> 'ok')::boolean and (v ->> 'credited')::int = 2 and (v ->> 'cap_left')::int = 28 and (v ->> 'balance')::int >= 2, v::text);
    v := public.world_claim_visit(fa);
    v_res := v_res || pg_temp.r('a shop visit pays 2', (v ->> 'ok')::boolean and (v ->> 'value')::int = 2, v::text);

    -- ── A code for every shop ──
    perform pg_temp.as_user('zz-cr-a@example.com', ua);
    v := public.referral_overview(fa);
    v_code_fa := v ->> 'code';
    v_res := v_res || pg_temp.r('a free shop gets a code, earning once',
      v_code_fa ~ '^[A-HJ-NP-Z2-9]{6}$' and (v ->> 'homeShop')::boolean and (v -> 'uses' ->> 'left')::int = 1
      and (v -> 'uses' ->> 'limit')::int = 1 and (v ->> 'canShare')::boolean
      and v ->> 'link' = 'https://sellio.sg/r/' || v_code_fa
      and (v -> 'coins' ->> 'free')::int = 50 and (v -> 'coins' ->> 'merchant')::int = 100, v::text);
    v_res := v_res || pg_temp.r('the same code next time', public.referral_overview(fa) ->> 'code' = v_code_fa
      and (select count(*) from app.shop_codes where tenant_id = fa) = 1, null);
    v_err := null; begin v := public.referral_overview(m); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('only the shop''s owner sees its code', v_err = '42501 Only the shop''s owner can see this.', v_err);
    v := public.referral_code_info(v_code_fa);
    v_res := v_res || pg_temp.r('a free shop''s code is found, with its first name',
      (v ->> 'found')::boolean and (v ->> 'homeShop')::boolean and v ->> 'firstName' = 'Fiona' and v -> 'whatsapp' = 'null'::jsonb
      and not (v ->> 'distributor')::boolean, v::text);

    -- A new free shop with Fiona's code earns her 50 when it lists something.
    perform pg_temp.as_user('zz-cr-b@example.com', ub);
    v := public.referral_attach_free(fb, lower(v_code_fa), false);
    select id into v_id from app.coin_referrals where tenant_id = fb;
    v_res := v_res || pg_temp.r('a new free shop adds a code from a link',
      (v ->> 'ok')::boolean and v ->> 'shopName' = 'zz Fiona Bakes'
      and (select status = 'pending' and kind = 'free' and source = 'link' and referrer_id = fa from app.coin_referrals where id = v_id), v::text);
    v_err := null; begin v := public.referral_attach_free(fb, v_code_fa, true); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a shop counts once', v_err = '22023 This shop''s referral is settled already.', v_err);
    insert into public.products (tenant_id, name, is_active) values (fb, 'Kaya jar', false);
    v_res := v_res || pg_temp.r('a hidden listing doesn''t count yet', (select status from app.coin_referrals where id = v_id) = 'pending' and pg_temp.balance(ua) = 0, null);
    update public.products set is_active = true where tenant_id = fb;
    v_res := v_res || pg_temp.r('its first listing earns Fiona 50 coins',
      (select status = 'earned' and coins = 50 from app.coin_referrals where id = v_id) and pg_temp.balance(ua) = 50
      and exists (select 1 from app.world_ledger where user_id = ua and reason = 'referral' and ref = v_id::text || ':free' and delta = 50), null);
    v_res := v_res || pg_temp.r('Fiona is told', exists (select 1 from public.notifications where user_email = 'zz-cr-a@example.com'
      and type = 'referral' and title = 'You earned 50 coins' and link = '/refer'), null);
    insert into public.products (tenant_id, name) values (fb, 'Second jar');
    v_res := v_res || pg_temp.r('more listings pay nothing more', pg_temp.balance(ua) = 50, null);

    -- Fiona's code earned once: it's used.
    perform pg_temp.as_user('zz-cr-c@example.com', uc);
    v_err := null; begin v := public.referral_attach_free(fc, v_code_fa, true); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a free seller''s code earns once', v_err = '22023 This code has been used already.', v_err);
    v_res := v_res || pg_temp.r('a used free code is no longer found', not (public.referral_code_info(v_code_fa) ->> 'found')::boolean, null);
    perform pg_temp.as_user('zz-cr-a@example.com', ua);
    v := public.referral_overview(fa);
    v_res := v_res || pg_temp.r('Fiona sees it used, with one seller and 50 coins',
      (v -> 'uses' ->> 'left')::int = 0 and not (v ->> 'canShare')::boolean and (v -> 'invited' ->> 'sellers')::int = 1
      and (v -> 'invited' ->> 'coins')::int = 50 and (v ->> 'balance')::int = 50, v::text);

    -- Own code, and an old shop.
    perform pg_temp.as_user('zz-cr-z@example.com', uz);
    v_code_fz := public.referral_overview(fz) ->> 'code';
    v_err := null; begin v := public.referral_attach_free(fz, v_code_fz, true); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a shop can''t use its own code', v_err = '22023 That''s this shop''s own code.', v_err);
    update public.tenants set created_date = now() - interval '8 days' where id = fz;
    perform pg_temp.as_user('zz-cr-a@example.com', ua);
    perform pg_temp.as_user('zz-cr-m@example.com', um);
    v_code_m := public.referral_overview(m) ->> 'code';
    perform pg_temp.as_user('zz-cr-z@example.com', uz);
    v_err := null; begin v := public.referral_attach_free(fz, v_code_m, true); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('only a new free shop adds a code', v_err = '22023 A referral code can only be added when a shop is new.', v_err);

    -- A business's code has no limit.
    perform pg_temp.as_user('zz-cr-m@example.com', um);
    v := public.referral_overview(m);
    v_res := v_res || pg_temp.r('a business shop''s code has no limit', not (v ->> 'homeShop')::boolean and v -> 'uses' = 'null'::jsonb
      and (v ->> 'canShare')::boolean, v::text);
    perform pg_temp.as_user('zz-cr-d@example.com', ud);
    perform public.referral_attach_free(fd, v_code_m, true);
    perform pg_temp.as_user('zz-cr-e@example.com', ue);
    perform public.referral_attach_free(fe, v_code_m, false);
    insert into public.products (tenant_id, name) values (fd, 'Cookies'), (fe, 'Candles');
    v_res := v_res || pg_temp.r('two free sellers from a business earn it 100', pg_temp.balance(um) = 100
      and (select count(*) from app.coin_referrals where referrer_id = m and status = 'earned' and kind = 'free') = 2, null);

    -- A business signs up with Marcus's link (no distributor): 100 coins when it pays.
    perform pg_temp.as_user(null, null);
    v := public.referral_note_checkout('ref_' || v_code_m, 'cs_zz_cr_n', 'cus_zz_cr_n', 'sub_zz_cr_n', 'zz-cr-n@example.com', null, true);
    v2 := public.referral_note_checkout('ref_' || v_code_m, 'cs_zz_cr_n', 'cus_zz_cr_n', 'sub_zz_cr_n', 'zz-cr-n@example.com', null, true);
    v_res := v_res || pg_temp.r('a sign-up with any shop''s code is noted for coins, once',
      (v ->> 'ok')::boolean and (v ->> 'coinsOnly')::boolean and v ->> 'coinReferralId' = v2 ->> 'coinReferralId'
      and (select status = 'pending' and kind = 'merchant' and source = 'link' and stripe_subscription_id = 'sub_zz_cr_n'
             from app.coin_referrals where id = (v ->> 'coinReferralId')::uuid), v::text || ' ' || v2::text);
    v := public.referral_note_checkout('ref_ZZZZZZ', 'cs_zz_cr_unknown', null, null, null, null, true);
    v_res := v_res || pg_temp.r('an unknown code is still nothing', not (v ->> 'ok')::boolean and v ->> 'reason' = 'unknown code', v::text);
    v := public.referral_note_checkout('ref_' || v_code_fa, 'cs_zz_cr_used', null, 'sub_zz_cr_used', 'zz-cr-x@example.com', null, true);
    v_res := v_res || pg_temp.r('a sign-up with a used free code is kept, void',
      (select status = 'void' and void_reason = 'code used up' from app.coin_referrals where stripe_session_id = 'cs_zz_cr_used'), v::text);
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at)
    values ('in_zz_cr_n1', null, 'sub_zz_cr_n', 'cus_zz_cr_n', 39, 39, 'SGD', 'monthly', now());
    v_res := v_res || pg_temp.r('its first payment earns Marcus 100', pg_temp.balance(um) = 200
      and (select status = 'earned' and coins = 100 from app.coin_referrals where stripe_session_id = 'cs_zz_cr_n'), null);
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at)
    values ('in_zz_cr_n2', null, 'sub_zz_cr_n', 'cus_zz_cr_n', 39, 39, 'SGD', 'monthly', now());
    v_res := v_res || pg_temp.r('later payments pay nothing more', pg_temp.balance(um) = 200, null);

    -- Fiona's free seller pays for a plan: she's topped up to 100.
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at)
    values ('in_zz_cr_fb1', fb, 'sub_zz_cr_fb', 'cus_zz_cr_fb', 39, 39, 'SGD', 'monthly', now());
    v_res := v_res || pg_temp.r('a free seller who pays tops the referrer up to 100', pg_temp.balance(ua) = 100
      and (select kind = 'merchant' and coins = 100 from app.coin_referrals where tenant_id = fb), null);

    -- A trial shop types Marcus's code in Plans: 100 when it pays.
    perform pg_temp.as_user('zz-cr-t@example.com', ut);
    v_err := null; begin v := public.referral_attach(t, v_code_fa); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('Plans: a used free code is refused', v_err = '22023 This code has been used already.', v_err);
    v := public.referral_attach(t, v_code_m);
    v_res := v_res || pg_temp.r('Plans: any shop''s code is taken', (v ->> 'ok')::boolean and v ->> 'shopName' = 'zz Marcus Cafe'
      and (select status = 'pending' and kind = 'merchant' and source = 'code' from app.coin_referrals where tenant_id = t), v::text);
    perform pg_temp.as_user('zz-cr-d@example.com', ud);
    v_code_fd := public.referral_overview(fd) ->> 'code';
    perform pg_temp.as_user('zz-cr-t@example.com', ut);
    v := public.referral_attach(t, v_code_fd);
    v_res := v_res || pg_temp.r('Plans: another code before the first payment replaces it',
      (select referrer_id = fd from app.coin_referrals where tenant_id = t and status <> 'void')
      and (select count(*) from app.coin_referrals where tenant_id = t and status = 'void' and void_reason = 'replaced by a typed code') = 1, v::text);
    v := public.referral_attach(t, v_code_m);
    v_res := v_res || pg_temp.r('Plans: and back again', (select referrer_id = m from app.coin_referrals where tenant_id = t and status <> 'void'), v::text);
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at)
    values ('in_zz_cr_t1', t, 'sub_zz_cr_t', 'cus_zz_cr_t', 39, 39, 'SGD', 'monthly', now());
    v_res := v_res || pg_temp.r('Plans: its first payment earns Marcus 100', pg_temp.balance(um) = 300, null);

    -- A distributor keeps the shop's code.
    select terms_version into v_terms from app.referral_settings where id;
    update app.referral_settings set joining_open = true where id;
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at)
    values ('in_zz_cr_m1', m, 'sub_zz_cr_m', 'cus_zz_cr_m', 79, 79, 'SGD', 'monthly', now() - interval '3 days');
    perform pg_temp.as_user('zz-cr-m@example.com', um);
    v := public.referral_join(m, v_terms);
    v_res := v_res || pg_temp.r('a distributor''s code is its shop''s code', v ->> 'code' = v_code_m
      and (select code from app.referral_partners where tenant_id = m) = v_code_m, v::text);
    v := public.referral_code_info(v_code_m);
    v_res := v_res || pg_temp.r('a business code is found, not a home shop', (v ->> 'found')::boolean and not (v ->> 'homeShop')::boolean
      and v ->> 'firstName' = 'Marcus' and (v ->> 'distributor')::boolean, v::text);

    update app.referral_partners set status = 'paused' where tenant_id = m;
    v_res := v_res || pg_temp.r('a paused distributor''s code earns no coins either', not (public.referral_code_info(v_code_m) ->> 'found')::boolean
      and not (public.referral_overview(m) ->> 'canShare')::boolean
      and app.coin_referral_note_checkout(v_code_m, false, 'cs_zz_cr_paused', null, null, null, null) is null, null);
    update app.referral_partners set status = 'active' where tenant_id = m;

    -- ── Sellio's admins become distributors without a payment (a plan on a 100% coupon pays S$0) ──
    perform pg_temp.as_user('zz-cr-admin@example.com', uadm);
    v := public.referral_dashboard(ta);
    v_res := v_res || pg_temp.r('before: the admin''s shop with no payment can''t join', not (v ->> 'canJoin')::boolean and v ->> 'joinBlock' = 'no payment', v::text);
    v_err := null; begin v := public.referral_join(ta, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('before: joining is refused', v_err like '%first payment%', v_err);
    -- ── Admin → Coins ──
    perform pg_temp.as_user('zz-cr-m@example.com', um);
    v_err := null; begin v := public.coins_admin_overview(); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: refused for others', v_err = '42501 This is for Sellio''s admins.', v_err);
    insert into app.alert_recipients (email) values ('zz-cr-admin@example.com');
    perform pg_temp.as_user('zz-cr-admin@example.com', uadm);
    v := public.referral_dashboard(ta);
    v_res := v_res || pg_temp.r('an admin''s shop with no payment can join', (v ->> 'canJoin')::boolean and v -> 'joinBlock' = 'null'::jsonb, v::text);
    v := public.referral_join(ta, v_terms);
    v_res := v_res || pg_temp.r('an admin joins without a payment, under the shop''s code', (v ->> 'ok')::boolean
      and v ->> 'code' = (select code from app.shop_codes where tenant_id = ta)
      and exists (select 1 from app.referral_partners where tenant_id = ta and status = 'active'), v::text);
    perform pg_temp.as_user('zz-cr-t@example.com', ut);
    v := public.referral_dashboard(t);
    v_res := v_res || pg_temp.r('anyone else in a trial still waits', v ->> 'joinBlock' = 'trial', v::text);
    perform pg_temp.as_user('zz-cr-admin@example.com', uadm);
    v := public.coins_admin_overview();
    v_res := v_res || pg_temp.r('admin: the rules, the items (no awnings) and the totals',
      (v -> 'settings' ->> 'daily_cap')::int = 30 and (v -> 'settings' ->> 'referral_coins_merchant')::int = 100
      and jsonb_array_length(v -> 'items') = 12
      and not exists (select 1 from jsonb_array_elements(v -> 'items') e where e.value ->> 'slot' = 'awning')
      and (v -> 'referrals' ->> 'businesses')::int >= 3, v::text);
    v := public.coins_admin_save('{"daily_cap": 40, "referral_coins_free": 60}'::jsonb, '[{"id": "sign:neon", "price": 99}, {"id": "decor:balloons", "active": false}, {"id": "lights:fairy", "price": 20}]'::jsonb);
    v_res := v_res || pg_temp.r('admin: rules and prices saved',
      app.world_cfg_int('daily_cap', 0) = 40 and app.world_cfg_int('referral_coins_free', 0) = 60
      and (select price from app.world_cosmetics where id = 'sign:neon') = 99
      and not (select active from app.world_cosmetics where id = 'decor:balloons')
      and (v -> 'settings' ->> 'daily_cap')::int = 40, v::text);
    v_res := v_res || pg_temp.r('admin: every change logged, unchanged ones not',
      (select count(*) from app.coins_admin_log where admin_email = 'zz-cr-admin@example.com') = 4
      and not exists (select 1 from app.coins_admin_log where target = 'item:lights:fairy'), null);
    v_err := null; begin v := public.coins_admin_save('{"daily_cap": 2000}'::jsonb, '[]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: a rule out of range is refused', v_err = '22023 daily_cap must be a whole number from 0 to 1000.', v_err);
    v_err := null; begin v := public.coins_admin_save('{"daily_cap": 2.5}'::jsonb, '[]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: a rule must be whole', v_err like '22023 daily_cap must be a whole number%', v_err);
    v_err := null; begin v := public.coins_admin_save('{"street_public": 1}'::jsonb, '[]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: other settings can''t be changed here', v_err = '22023 That setting can''t be changed here.', v_err);
    v_err := null; begin v := public.coins_admin_save('{}'::jsonb, '[{"id": "sign:wood", "price": 5}]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: the starting look stays free', v_err = '22023 The starting look is free and always available.', v_err);
    v_err := null; begin v := public.coins_admin_save('{}'::jsonb, '[{"id": "awning:mint", "active": true}]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: awnings stay off sale', v_err = '22023 Awnings aren''t sold: every stall wears the same one.', v_err);
    v_err := null; begin v := public.coins_admin_save('{}'::jsonb, '[{"id": "sign:neon", "price": -1}]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: a price can''t be negative', v_err = '22023 A price must be a whole number of coins from 0 to 100000.', v_err);
    v_err := null; begin v := public.coins_admin_save('{}'::jsonb, '[{"id": "sign:nope", "price": 5}]'::jsonb); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('admin: an unknown item is refused', v_err = '22023 That item doesn''t exist.', v_err);
  exception when others then
    v_res := v_res || pg_temp.r('the test ran to the end', false, sqlstate || ' ' || sqlerrm);
  end;
  raise exception 'TEST RESULTS %', (
    select jsonb_build_object(
      'passed', count(*) filter (where (e.value ->> 'ok')::boolean),
      'failed', count(*) filter (where not (e.value ->> 'ok')::boolean),
      'failures', coalesce(jsonb_agg(e.value) filter (where not (e.value ->> 'ok')::boolean), '[]'::jsonb))
    from jsonb_array_elements(v_res) e);
end
$test$;
