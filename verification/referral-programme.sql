-- Referral programme, phase 1 (10 Nov 2026): every rule of
-- supabase/migrations/20261110090000_referral_programme.sql, in one transaction that ends by
-- raising its results ("TEST RESULTS {passed, failed, failures}"), so nothing stays. Test shops are
-- named "zz ..." with @example.com owners; their alerts roll back with everything else.
-- Live: paste the whole file into the Supabase SQL editor (or execute_sql). Locally:
-- node verification/referral-programme.test.mjs /tmp/sellio-verification (see that file).
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
create function pg_temp.as_user(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_email is null then '' else json_build_object('email', p_email, 'role', 'authenticated')::text end,
                    true)
$$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_run date;
  v_end timestamptz;
  v_terms text;
  v_p1 text := gen_random_uuid()::text;
  v_r0 text := gen_random_uuid()::text;
  v_h text := gen_random_uuid()::text;
  v_x text := gen_random_uuid()::text;
  v_y text := gen_random_uuid()::text;
  v_z text := gen_random_uuid()::text;
  v_s text[] := array[]::text[];
  v_c1 text;
  v_c0 text;
  v_err text;
  v jsonb;
  v_n integer;
  v_num numeric;
  v_bool boolean;
  v_txt text;
  v_ref uuid;
  v_admin text := 'zz-ref-admin@example.com';
  e_p1 text := 'zz-ref-p1@example.com';
  e_r0 text := 'zz-ref-r0@example.com';
  e_staff text := 'zz-ref-staff1@example.com';
  e_h text := 'zz-ref-h@example.com';
  e_y text := 'zz-ref-y@example.com';
  i integer;
  v_ctx text;
  v_step text := 'setup';
begin
  begin
    v_run := v_today - ((extract(isodow from v_today)::integer - 5 + 7) % 7);
    v_end := ((v_run - 4)::timestamp at time zone 'Asia/Singapore');
    select terms_version into v_terms from app.referral_settings where id;

    insert into app.alert_recipients (email) values (v_admin);
    insert into public.tenants (id, name, slug, owner_email, seller_type, status) values
      (v_r0, 'zz Recruiter Shop', 'zz-ref-r0-' || left(v_r0, 8), e_r0, 'merchant', 'suspended'),
      (v_p1, 'zz Kopi Corner', 'zz-ref-p1-' || left(v_p1, 8), e_p1, 'merchant', 'suspended'),
      (v_h, 'zz Home Shop', 'zz-ref-h-' || left(v_h, 8), e_h, 'individual', 'suspended'),
      (v_x, 'zz Staff Own Shop', 'zz-ref-x-' || left(v_x, 8), e_staff, 'merchant', 'suspended'),
      (v_y, 'zz Same Phone Shop', 'zz-ref-y-' || left(v_y, 8), e_y, 'merchant', 'suspended'),
      (v_z, 'zz Forgot Code Shop', 'zz-ref-z-' || left(v_z, 8), 'zz-ref-z@example.com', 'merchant', 'suspended');
    insert into public.tenant_users (tenant_id, user_email, is_owner, status) values
      (v_r0, e_r0, true, 'active'), (v_p1, e_p1, true, 'active'), (v_p1, e_staff, false, 'active'),
      (v_h, e_h, true, 'active'), (v_x, e_staff, true, 'active'), (v_y, e_y, true, 'active'),
      (v_z, 'zz-ref-z@example.com', true, 'active');
    insert into public.app_users (email, full_name, phone, role) values
      (e_p1, 'Ah Hock Tan', '+65 3999 0001', 'admin'), (e_y, 'Yvonne Lim', '3999-0001', 'admin'),
      (e_r0, 'Rachel Ong', '+65 9222 2222', 'admin');
    insert into public.subscriptions (tenant_id, tier, billing_cycle, status, current_period_end, stripe_subscription_id) values
      (v_r0, 'starter', 'yearly', 'active', now() + interval '300 days', 'sub_zz_r0'),
      (v_p1, 'starter', 'monthly', 'active', now() + interval '20 days', 'sub_zz_p1'),
      (v_x, 'starter', 'monthly', 'trial', now() + interval '5 days', 'sub_zz_x'),
      (v_y, 'starter', 'monthly', 'trial', now() + interval '5 days', 'sub_zz_y'),
      (v_z, 'growth', 'monthly', 'active', now() + interval '20 days', 'sub_zz_z');
    for i in 1..14 loop
      v_s := v_s || gen_random_uuid()::text;
      insert into public.tenants (id, name, slug, owner_email, seller_type, status)
      values (v_s[i], 'zz Shop ' || i, 'zz-ref-s' || i || '-' || left(v_s[i], 8), 'zz-ref-s' || i || '@example.com', 'merchant', 'suspended');
      insert into public.tenant_users (tenant_id, user_email, is_owner, status)
      values (v_s[i], 'zz-ref-s' || i || '@example.com', true, 'active');
      insert into public.subscriptions (tenant_id, tier, billing_cycle, status, current_period_end, stripe_subscription_id)
      values (v_s[i], 'starter', case when i = 11 then 'yearly' else 'monthly' end, 'trial', now() + interval '5 days', 'sub_zz_s' || i);
    end loop;

    -- 0. Who may call what
    v_step := 'grants';
    v_err := null;
    begin
      execute 'set local role anon';
      v := public.referral_code_info('ABCDEF');
      execute 'reset role';
    exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('anon can look up a code', v_err is null and v ->> 'found' = 'false', coalesce(v_err, v::text));
    v_err := null;
    begin
      execute 'set local role anon';
      v := public.referral_dashboard(v_p1);
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('anon cannot open a dashboard', v_err = '42501', v_err);
    v_err := null;
    begin
      execute 'set local role authenticated';
      v := public.referral_record_payment('in_x', null, null, null, 100, 100, 'sgd', 'monthly', now(), null);
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('app users cannot record payments', v_err = '42501', v_err);
    v_err := null;
    begin
      execute 'set local role authenticated';
      v := public.referral_note_checkout('ABCDEF', 'cs_x', null, null, null, null, true);
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('app users cannot note checkouts', v_err = '42501', v_err);
    v_err := null;
    begin
      execute 'set local role authenticated';
      v := public.referral_record_reversal('in_x', 're_x', 'refund', 100, now());
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('app users cannot record refunds', v_err = '42501', v_err);
    v_err := null;
    begin
      execute 'set local role service_role';
      v := public.referral_record_payment('in_zz_none', null, null, null, 0, 0, 'sgd', 'monthly', now(), null);
      execute 'reset role';
    exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('the webhook (service role) can record payments', v_err is null and v ->> 'skipped' = 'nothing paid', coalesce(v_err, v::text));
    v_err := null;
    begin
      execute 'set local role authenticated';
      perform 1 from app.referral_ledger limit 1;
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('app users cannot read the ledger', v_err = '42501', v_err);
    v_err := null;
    perform pg_temp.as_user(e_p1);
    begin
      execute 'set local role authenticated';
      v := public.referral_admin_overview();
      execute 'reset role';
    exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('owners cannot use admin functions', v_err = '42501', v_err);
    begin
      execute 'set local role authenticated';
      v_bool := public.am_i_sellio_admin();
      execute 'reset role';
    exception when others then v_bool := null; end;
    v_res := v_res || pg_temp.r('am_i_sellio_admin is false for an owner', v_bool = false, coalesce(v_bool::text, 'error'));

    -- 1. Joining
    v_step := 'join';
    perform pg_temp.as_user(e_p1);
    v_err := null;
    begin v := public.referral_join(v_p1, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('joining is closed until an admin opens it', v_err like '42501%open yet%', v_err);
    v_err := null;
    begin v := public.referral_admin_settings(true, v_run, null, 'test'); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('owners cannot open joining', v_err = '42501', v_err);
    perform pg_temp.as_user(v_admin);
    v := public.referral_admin_settings(true, v_run, null, 'test');
    v_res := v_res || pg_temp.r('an admin opens joining and sets the first pay run',
                                (v ->> 'joiningOpen')::boolean and (v ->> 'firstRunDate')::date = v_run, v::text);
    v_err := null;
    begin v := public.referral_admin_settings(null, v_run + 1, null, 'test'); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('pay runs are on Fridays only', v_err like '22023%Fridays%', v_err);
    perform pg_temp.as_user(e_staff);
    v_err := null;
    begin v := public.referral_join(v_p1, v_terms); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('staff cannot join for the shop', v_err = '42501', v_err);
    perform pg_temp.as_user(e_p1);
    v_err := null;
    begin v := public.referral_join(v_p1, 'old'); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('old terms are refused', v_err = '22023', v_err);
    perform pg_temp.as_user(e_h);
    v_err := null;
    begin v := public.referral_join(v_h, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('free home shops cannot join', v_err like '42501%business plan%', v_err);
    perform pg_temp.as_user(e_r0);
    v := public.referral_join(v_r0, v_terms);
    v_c0 := v ->> 'code';
    v_res := v_res || pg_temp.r('a distributor joins', v_c0 ~ '^[A-HJ-NP-Z2-9]{6}$', v::text);

    -- P1's own shop joined Sellio with R0's code: R0 is P1's recruiter.
    v_step := 'recruiter';
    v := public.referral_note_checkout(v_c0, 'cs_zz_p1', 'cus_zz_p1', 'sub_zz_p1', e_p1, null, true);
    v_res := v_res || pg_temp.r('a sign-up checkout with a code is noted', v ->> 'status' = 'pending', v::text);
    v := public.referral_record_payment('in_zz_p1_1', v_p1, 'sub_zz_p1', 'cus_zz_p1', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days', 'fp_p1');
    v_res := v_res || pg_temp.r('the first real payment counts the shop and earns 3%',
                                v ->> 'referral' = 'counted' and (v ->> 'commission')::numeric = 1.17, v::text);

    perform pg_temp.as_user(e_p1);
    v := public.referral_join(v_p1, v_terms);
    v_c1 := v ->> 'code';
    v_res := v_res || pg_temp.r('an owner joins and gets a random code', v_c1 ~ '^[A-HJ-NP-Z2-9]{6}$' and v_c1 <> v_c0, v::text);
    v := public.referral_join(v_p1, v_terms);
    v_res := v_res || pg_temp.r('joining again returns the same code', v ->> 'code' = v_c1 and (v ->> 'already')::boolean, v::text);

    -- 2. The invite page
    v_step := 'code info';
    v := public.referral_code_info(lower(v_c1));
    v_res := v_res || pg_temp.r('a code in any case shows the shop and first name, no WhatsApp unless chosen',
                                v ->> 'found' = 'true' and v ->> 'shopName' = 'zz Kopi Corner' and v ->> 'firstName' = 'Ah'
                                and v -> 'whatsapp' = 'null'::jsonb, v::text);
    v := public.referral_set_whatsapp(v_p1, true);
    v := public.referral_code_info('ref_' || v_c1);
    v_res := v_res || pg_temp.r('WhatsApp when chosen, with 65 in front', v ->> 'whatsapp' = '6539990001', v::text);
    v := public.referral_code_info('O0O0O0');
    v_res := v_res || pg_temp.r('a code that can''t exist finds nothing', v ->> 'found' = 'false', v::text);

    -- 3. Sign-up checkouts
    v_step := 'checkouts';
    v := public.referral_note_checkout('ZZZZZZ', 'cs_zz_unknown', null, 'sub_zz_unknown', 'a@example.com', null, true);
    v_res := v_res || pg_temp.r('an unknown code: nothing noted', v ->> 'ok' = 'false', v::text);
    for i in 1..14 loop
      v := public.referral_note_checkout(v_c1, 'cs_zz_s' || i, 'cus_zz_s' || i, 'sub_zz_s' || i,
                                         'zz-ref-s' || i || '@example.com', null, true);
    end loop;
    select count(*) into v_n from app.referrals where partner_id = v_p1 and status = 'pending';
    v_res := v_res || pg_temp.r('14 sign-ups are pending', v_n = 14, v_n::text);
    v := public.referral_note_checkout(v_c1, 'cs_zz_s1', 'cus_zz_s1', 'sub_zz_s1', 'zz-ref-s1@example.com', null, true);
    v_res := v_res || pg_temp.r('the same checkout again changes nothing', (v ->> 'repeat')::boolean, v::text);
    v := public.referral_note_checkout(v_c1, 'cs_zz_self', 'cus_zz_self', 'sub_zz_self', e_staff, null, true);
    v_res := v_res || pg_temp.r('a checkout by the distributor''s staff is void', v ->> 'status' = 'void', v::text);
    v := public.referral_note_checkout(v_c1, 'cs_zz_self2', 'cus_zz_self2', 'sub_zz_self2', 'someone@example.com', '+65 3999 0001', true);
    v_res := v_res || pg_temp.r('a checkout with the distributor''s phone is void', v ->> 'status' = 'void', v::text);
    select count(*) into v_n from public.notifications where lower(user_email) = e_p1 and type = 'referral' and data ->> 'kind' = 'signup';
    v_res := v_res || pg_temp.r('one sign-up alert per real sign-up', v_n = 14, v_n::text);

    -- 4. Payments
    v_step := 'payments';
    for i in 1..10 loop
      v := public.referral_record_payment('in_zz_s' || i || '_1', v_s[i], 'sub_zz_s' || i, 'cus_zz_s' || i, 3900, 3900, 'SGD',
                                          'monthly', v_end - interval '20 days' + i * interval '1 hour', 'fp_s' || i);
    end loop;
    select count(*) into v_n from app.referrals where partner_id = v_p1 and status = 'counted';
    v_res := v_res || pg_temp.r('ten first payments count ten shops', v_n = 10, v_n::text);
    select sum(amount) into v_num from app.referral_ledger where partner_id = v_p1 and kind = 'commission';
    v_res := v_res || pg_temp.r('ten commissions of S$1.17', v_num = 11.70, v_num::text);
    select count(*) into v_n from public.notifications where lower(user_email) = e_p1 and title = '9 of 10'
       and message = 'One more paying monthly shop and S$39.00 of your plan fee comes back to your wallet.';
    v_res := v_res || pg_temp.r('an alert at 9 of 10', v_n = 1, v_n::text);
    select amount into v_num from app.referral_ledger where partner_id = v_p1 and kind = 'fee_back';
    v_res := v_res || pg_temp.r('plan fee back at 10 monthly shops: one month, S$39', v_num = 39.00, coalesce(v_num::text, 'none'));
    select count(*) into v_n from public.notifications where lower(user_email) = e_p1 and title = 'Your plan fee is coming back'
       and message = 'S$39.00, one month of your plan, will be added to your wallet on ' || to_char(v_run, 'Dy FMDD Mon') || '.';
    v_res := v_res || pg_temp.r('a fee-back alert with the credit day', v_n = 1,
                                (select string_agg(message, ' | ') from public.notifications where lower(user_email) = e_p1 and title = 'Your plan fee is coming back'));
    v_res := v_res || pg_temp.r('the monthly milestone is the 10th shop''s payment',
                                (select monthly_milestone_at from app.referral_partners where tenant_id = v_p1)
                                  = v_end - interval '20 days' + 10 * interval '1 hour', null);
    select count(*) into v_n from app.referral_ledger where kind = 'friend_bonus';
    v_res := v_res || pg_temp.r('no friend bonus on the 10th shop''s payment itself', v_n = 0, v_n::text);

    v := public.referral_record_payment('in_zz_s1_2', v_s[1], 'sub_zz_s1', 'cus_zz_s1', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 11 * interval '1 hour', 'fp_s1');
    select amount into v_num from app.referral_ledger where partner_id = v_r0 and kind = 'friend_bonus' and stripe_invoice_id = 'in_zz_s1_2';
    v_res := v_res || pg_temp.r('friend bonus: 1% to the recruiter on the friend''s later monthly payments', v_num = 0.39, coalesce(v_num::text, 'none'));
    v := public.referral_record_payment('in_zz_s1_2', v_s[1], 'sub_zz_s1', 'cus_zz_s1', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 11 * interval '1 hour', 'fp_s1');
    select count(*) into v_n from app.referral_ledger where stripe_invoice_id = 'in_zz_s1_2';
    v_res := v_res || pg_temp.r('the same invoice twice pays once', v_n = 2, v_n::text);
    v := public.referral_record_payment('in_zz_s10_1', v_s[10], 'sub_zz_s10', 'cus_zz_s10', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 10 * interval '1 hour', 'fp_s10');
    select count(*) into v_n from app.referral_ledger where stripe_invoice_id = 'in_zz_s10_1';
    v_res := v_res || pg_temp.r('a retried 10th payment still earns no friend bonus', v_n = 1, v_n::text);

    v := public.referral_record_payment('in_zz_s11_1', v_s[11], 'sub_zz_s11', 'cus_zz_s11', 79000, 79000, 'sgd', 'yearly',
                                        v_end - interval '20 days' + 12 * interval '1 hour', 'fp_s11');
    v_res := v_res || pg_temp.r('5% of a yearly payment', (v ->> 'commission')::numeric = 39.50, v::text);
    select count(*) into v_n from app.referral_ledger where stripe_invoice_id = 'in_zz_s11_1' and kind = 'friend_bonus';
    v_res := v_res || pg_temp.r('no yearly friend bonus before the friend has 10 yearly shops', v_n = 0, v_n::text);

    v := public.referral_record_payment('in_zz_s7_2', v_s[7], 'sub_zz_s7', 'cus_zz_s7', 18800, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 13 * interval '1 hour', 'fp_s7');
    v_res := v_res || pg_temp.r('commission on the subscription part only (not a setup fee)', (v ->> 'commission')::numeric = 1.17, v::text);

    v := public.referral_record_payment('in_zz_s2_0', v_s[2], 'sub_zz_s2', null, 0, 0, 'sgd', 'monthly', now(), null);
    v_res := v_res || pg_temp.r('a S$0 trial invoice is skipped', v ->> 'skipped' = 'nothing paid', v::text);
    v := public.referral_record_payment('in_zz_s2_myr', v_s[2], 'sub_zz_s2', null, 3900, 3900, 'myr', 'monthly', now(), null);
    v_res := v_res || pg_temp.r('a non-SGD invoice is skipped', v ->> 'skipped' = 'not SGD', v::text);

    v := public.referral_record_payment('in_zz_s12_1', v_s[12], 'sub_zz_s12', 'cus_zz_s12', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 14 * interval '1 hour', 'fp_p1');
    v_res := v_res || pg_temp.r('paid with the distributor''s own card: held', (v ->> 'hold')::boolean, v::text);
    select count(*) into v_n from public.notifications
     where type = 'referral_review' and data ->> 'referral_id' = (select id::text from app.referrals where tenant_id = v_s[12]);
    v_res := v_res || pg_temp.r('admins are alerted to check it', v_n >= 1, v_n::text);

    update public.subscriptions set status = 'cancelled' where tenant_id = v_p1;
    v := public.referral_record_payment('in_zz_s2_2', v_s[2], 'sub_zz_s2', 'cus_zz_s2', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '20 days' + 15 * interval '1 hour', 'fp_s2');
    v_res := v_res || pg_temp.r('own plan cancelled: recorded, not earned', (v ->> 'eligible')::boolean = false, v::text);
    select count(*) into v_n from app.referral_ledger where stripe_invoice_id = 'in_zz_s2_2' and kind = 'friend_bonus';
    v_res := v_res || pg_temp.r('no friend bonus on a payment the friend doesn''t earn on', v_n = 0, v_n::text);
    update public.subscriptions set status = 'active' where tenant_id = v_p1;

    -- 5. Refunds and disputes
    v_step := 'refunds';
    v := public.referral_record_reversal('in_zz_s3_1', 're_zz_1', 'refund', 1950, v_end - interval '20 days' + 16 * interval '1 hour');
    select amount into v_num from app.referral_ledger where stripe_ref = 're_zz_1';
    v_res := v_res || pg_temp.r('half refunded: half the commission back, rounded', v_num = -0.59, coalesce(v_num::text, 'none'));
    v := public.referral_record_reversal('in_zz_s3_1', 're_zz_1', 'refund', 1950, v_end - interval '20 days' + 16 * interval '1 hour');
    select count(*) into v_n from app.referral_ledger where stripe_ref = 're_zz_1';
    v_res := v_res || pg_temp.r('the same refund twice takes back once', v_n = 1, v_n::text);
    v := public.referral_record_reversal('in_zz_s3_1', 're_zz_2', 'refund', 1950, v_end - interval '20 days' + 17 * interval '1 hour');
    select amount into v_num from app.referral_ledger where stripe_ref = 're_zz_2';
    v_res := v_res || pg_temp.r('the second half takes only what is left', v_num = -0.58, coalesce(v_num::text, 'none'));
    v_res := v_res || pg_temp.r('a fully refunded first and only payment: the shop doesn''t count',
                                (select status from app.referrals where tenant_id = v_s[3]) = 'void', null);
    v := public.referral_record_reversal('in_zz_s4_1', 'dp_zz_1', 'dispute', 3900, v_end - interval '20 days' + 18 * interval '1 hour');
    select amount into v_num from app.referral_ledger where stripe_ref = 'dp_zz_1';
    v_res := v_res || pg_temp.r('a dispute takes the commission back', v_num = -1.17, coalesce(v_num::text, 'none'));
    v := public.referral_record_reversal('in_zz_s4_1', 'dp_zz_1', 'dispute_won', null, v_end - interval '20 days' + 19 * interval '1 hour');
    select amount into v_num from app.referral_ledger where stripe_ref = 'dp_zz_1:won';
    v_res := v_res || pg_temp.r('a dispute Sellio wins gives it back', v_num = 1.17, coalesce(v_num::text, 'none'));
    v_res := v_res || pg_temp.r('a dispute doesn''t uncount the shop', (select status from app.referrals where tenant_id = v_s[4]) = 'counted', null);
    v := public.referral_record_reversal('in_zz_s1_2', 're_zz_3', 'refund', 3900, v_end - interval '20 days' + 20 * interval '1 hour');
    v_res := v_res || pg_temp.r('a refund takes back the commission and the friend bonus', (v ->> 'lines')::integer = 2, v::text);
    v_res := v_res || pg_temp.r('refunding a later payment keeps the shop counted', (select status from app.referrals where tenant_id = v_s[1]) = 'counted', null);
    v := public.referral_record_reversal('in_zz_nope', 're_zz_4', 'refund', 100, now());
    v_res := v_res || pg_temp.r('a refund of an unknown invoice changes nothing', v ->> 'found' = 'false', v::text);

    -- 6. Typing a code
    v_step := 'attach';
    perform pg_temp.as_user(e_h);
    v := public.referral_attach(v_h, lower(v_c1));
    v_res := v_res || pg_temp.r('a home shop adds a code', v ->> 'shopName' = 'zz Kopi Corner', v::text);
    v := public.referral_attach(v_h, v_c0);
    v_res := v_res || pg_temp.r('a typed code replaces one that hasn''t counted', (select partner_id from app.referrals where tenant_id = v_h) = v_r0, v::text);
    v := public.referral_attach(v_h, v_c1);
    perform pg_temp.as_user(e_p1);
    v_err := null;
    begin v := public.referral_attach(v_p1, v_c1); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a shop''s own code is refused', v_err like '22023%own code%', v_err);
    perform pg_temp.as_user(e_staff);
    v_err := null;
    begin v := public.referral_attach(v_x, v_c1); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('the distributor''s staff can''t use it for their own shop', v_err like '22023%someone at this shop%', v_err);
    perform pg_temp.as_user(e_y);
    v_err := null;
    begin v := public.referral_attach(v_y, v_c1); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('the distributor''s phone number is refused', v_err like '22023%someone at this shop%', v_err);
    perform pg_temp.as_user('zz-ref-s5@example.com');
    v_err := null;
    begin v := public.referral_attach(v_s[5], v_c0); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('no code after the shop''s first payment', v_err like '22023%first payment%', v_err);
    perform pg_temp.as_user(e_h);
    v_err := null;
    begin v := public.referral_attach(v_s[6], v_c1); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('only the shop''s owner can add a code', v_err = '42501', v_err);
    perform pg_temp.as_user('zz-ref-s14@example.com');
    v := public.referral_attach(v_s[14], v_c0);
    v_res := v_res || pg_temp.r('a typed code replaces the sign-up link''s code (found through the subscription)',
                                (select partner_id = v_r0 and tenant_id = v_s[14] and source = 'code'
                                   from app.referrals where stripe_subscription_id = 'sub_zz_s14'), v::text);
    v := public.referral_note_checkout(v_c0, 'cs_zz_r0self', 'cus_zz_r0self', 'sub_zz_r0self', 'other@example.com', null, true);
    v := public.referral_record_payment('in_zz_r0self_1', v_r0, 'sub_zz_r0self', 'cus_zz_r0self', 3900, 3900, 'sgd', 'monthly',
                                        now() - interval '3 days', 'fp_r0');
    v_res := v_res || pg_temp.r('a distributor paying for its own shop through its own link: void, no error',
                                (select status = 'void' and tenant_id is null from app.referrals where stripe_session_id = 'cs_zz_r0self')
                                and not exists (select 1 from app.referral_ledger where stripe_invoice_id = 'in_zz_r0self_1'), v::text);

    -- 7. The pay run
    v_step := 'pay run';
    v := public.referral_record_payment('in_zz_s8_2', v_s[8], 'sub_zz_s8', 'cus_zz_s8', 3900, 3900, 'sgd', 'monthly',
                                        v_end - interval '1 second', 'fp_s8');
    v := public.referral_record_payment('in_zz_s9_2', v_s[9], 'sub_zz_s9', 'cus_zz_s9', 3900, 3900, 'sgd', 'monthly',
                                        v_end, 'fp_s9');
    perform pg_temp.as_user(v_admin);
    v := public.referral_admin_run(null);
    v_res := v_res || pg_temp.r('the due pay run is this week''s Friday', (v ->> 'runDate')::date = v_run and (v ->> 'canCredit')::boolean, v::text);
    v_res := v_res || pg_temp.r('pay run total: S$91.37 + S$1.95 to 2 wallets',
                                (v ->> 'toCredit')::numeric = 93.32 and (v ->> 'wallets')::integer = 2,
                                (v ->> 'toCredit') || ' / ' || (v ->> 'wallets'));
    v_res := v_res || pg_temp.r('held earnings are shown, not credited (commission and the friend bonus on it)',
                                (v ->> 'held')::numeric = 1.56 and (v ->> 'heldReferrals')::integer = 1,
                                (v ->> 'held') || ' / ' || (v ->> 'heldReferrals'));
    select (x ->> 'total')::numeric into v_num from jsonb_array_elements(v -> 'rows') x where x ->> 'partnerId' = v_p1;
    v_res := v_res || pg_temp.r('the distributor''s row', v_num = 91.37, v_num::text);
    v_err := null;
    begin v := public.referral_admin_credit(v_run, 93.31); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a total that changed is refused', v_err like '22023%changed%', v_err);
    v_err := null;
    begin v := public.referral_admin_credit(v_run + 14, 0); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a future pay run can''t be credited', v_err like '22023%', v_err);
    v := public.referral_admin_credit(v_run, 93.32);
    v_res := v_res || pg_temp.r('the pay run is credited', (v ->> 'wallets')::integer = 2 and (v ->> 'total')::numeric = 93.32, v::text);
    select coalesce(sum(amount), 0) into v_num from app.wallet_transactions where tenant_id = v_p1;
    v_res := v_res || pg_temp.r('the wallet has the run''s total', v_num = 91.37, v_num::text);
    select count(*) into v_n from public.notifications where lower(user_email) = e_p1 and title = 'S$91.37 added to your wallet';
    v_res := v_res || pg_temp.r('a credit alert with the total', v_n = 1, v_n::text);
    v_err := null;
    begin v := public.referral_admin_credit(v_run, 0); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('a pay run is credited once', v_err like '22023%credited already%', v_err);
    select count(*) into v_n from app.referral_ledger where pay_run_id is not null and earned_at >= v_end;
    v_res := v_res || pg_temp.r('nothing after the cutoff is credited', v_n = 0, v_n::text);
    v_res := v_res || pg_temp.r('a payment one second before the cutoff is in the run',
                                (select pay_run_id is not null from app.referral_ledger where stripe_invoice_id = 'in_zz_s8_2' and kind = 'commission'), null);
    v_res := v_res || pg_temp.r('a payment at Monday 00:00 waits for the next run',
                                (select pay_run_id is null from app.referral_ledger where stripe_invoice_id = 'in_zz_s9_2' and kind = 'commission'), null);

    -- 8. The dashboard after the run
    v_step := 'dashboard';
    v := public.referral_record_payment('in_zz_s5_2', v_s[5], 'sub_zz_s5', 'cus_zz_s5', 3900, 3900, 'sgd', 'monthly',
                                        now() - interval '1 minute', 'fp_s5');
    perform pg_temp.as_user(e_p1);
    v := public.referral_dashboard(v_p1);
    v_res := v_res || pg_temp.r('dashboard: wallet', (v ->> 'wallet')::numeric = 91.37, v ->> 'wallet');
    v_res := v_res || pg_temp.r('dashboard: pending (not held, not unearned)', (v ->> 'pending')::numeric = 2.34, v ->> 'pending');
    v_res := v_res || pg_temp.r('dashboard: earned in all', (v ->> 'earnedInAll')::numeric = 93.71, v ->> 'earnedInAll');
    v_res := v_res || pg_temp.r('dashboard: next credit in two weeks', (v ->> 'nextCredit')::date = v_run + 14, v ->> 'nextCredit');
    v_res := v_res || pg_temp.r('dashboard: plan fee back received',
                                (v -> 'feeBack' ->> 'receivedAmount')::numeric = 39.00 and v -> 'feeBack' ->> 'cycle' = 'monthly',
                                (v -> 'feeBack')::text);
    v_res := v_res || pg_temp.r('dashboard: monthly shops that have paid', (v -> 'feeBack' ->> 'shopsPaid')::integer = 9, (v -> 'feeBack')::text);
    v_res := v_res || pg_temp.r('dashboard: names no shop and no owner',
                                position('zz Shop' in v::text) = 0 and position('zz-ref-s' in v::text) = 0
                                and position('Recruiter' in v::text) = 0, null);
    v_res := v_res || pg_temp.r('dashboard: the credits list', jsonb_array_length(v -> 'credits') = 1, (v -> 'credits')::text);
    perform pg_temp.as_user(e_staff);
    v_err := null;
    begin v := public.referral_dashboard(v_p1); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('staff can''t see the dashboard', v_err = '42501', v_err);
    perform pg_temp.as_user(e_h);
    v := public.referral_dashboard(v_h);
    v_res := v_res || pg_temp.r('a home shop sees it can''t join', (v ->> 'joined')::boolean = false and (v ->> 'canJoin')::boolean = false, v::text);

    -- 9. Review
    v_step := 'review';
    perform pg_temp.as_user(v_admin);
    v := public.referral_admin_reviews();
    v_res := v_res || pg_temp.r('one referral to review', jsonb_array_length(v) = 1 and v -> 0 ->> 'shopName' = 'zz Shop 12', v::text);
    v_ref := (v -> 0 ->> 'referralId')::uuid;
    v_err := null;
    begin v := public.referral_admin_review(v_ref, 'release', ' '); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('a reason is needed', v_err = '22023', v_err);
    v := public.referral_admin_review(v_ref, 'release', 'separate businesses, checked');
    perform pg_temp.as_user(e_p1);
    v := public.referral_dashboard(v_p1);
    v_res := v_res || pg_temp.r('released: its earnings join pending', (v ->> 'pending')::numeric = 3.51, v ->> 'pending');
    v_res := v_res || pg_temp.r('released: it counts', (v -> 'feeBack' ->> 'shopsPaid')::integer = 10, (v -> 'feeBack')::text);

    v_step := 'void';
    perform app.referral_lock();
    perform app.referral_void((select id from app.referrals where tenant_id = v_s[4]), 'test void');
    select coalesce(sum(amount), 0) into v_num from app.referral_ledger
     where referral_id = (select id from app.referrals where tenant_id = v_s[4]) and pay_run_id is null and voided_at is null;
    v_res := v_res || pg_temp.r('voiding a credited referral takes it back in the next run', v_num = -1.17, v_num::text);

    -- 10. Assigning a shop
    v_step := 'assign';
    v := public.referral_record_payment('in_zz_z_1', v_z, 'sub_zz_z', 'cus_zz_z', 7900, 7900, 'sgd', 'monthly', now() - interval '2 days', 'fp_z');
    v_res := v_res || pg_temp.r('a shop with no referral: payment recorded, nothing earned',
                                not exists (select 1 from app.referral_ledger where stripe_invoice_id = 'in_zz_z_1')
                                and exists (select 1 from app.shop_payments where stripe_invoice_id = 'in_zz_z_1'), v::text);
    perform pg_temp.as_user(e_p1);
    v_err := null;
    begin v := public.referral_admin_assign(v_z, v_c1, 'x'); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('owners can''t assign shops', v_err = '42501', v_err);
    perform pg_temp.as_user(v_admin);
    v := public.referral_admin_assign(v_z, v_c1, 'owner forgot the code');
    select amount into v_num from app.referral_ledger where stripe_invoice_id = 'in_zz_z_1' and kind = 'commission' and voided_at is null;
    v_res := v_res || pg_temp.r('assigned: its earlier payment earns 3% of S$79',
                                v ->> 'status' = 'counted' and v_num = 2.37, v::text || ' ' || coalesce(v_num::text, 'none'));
    v_err := null;
    begin v := public.referral_admin_assign(v_s[1], v_c0, 'x'); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('no reassigning once its earnings are in a pay run', v_err like '22023%pay run%', v_err);
    v := public.referral_admin_assign(v_z, v_c0, 'wrong distributor');
    select count(*) into v_n from app.referral_ledger where stripe_invoice_id = 'in_zz_z_1' and voided_at is null;
    select partner_id into v_txt from app.referral_ledger where stripe_invoice_id = 'in_zz_z_1' and voided_at is null and kind = 'commission';
    v_res := v_res || pg_temp.r('reassigned before a pay run: the earnings move', v_n = 1 and v_txt = v_r0, v_n || ' ' || coalesce(v_txt, 'none'));

    -- 11. Pausing, adjusting, settings
    v_step := 'admin';
    v := public.referral_admin_set_status(v_p1, 'paused', 'checking');
    v := public.referral_code_info(v_c1);
    v_res := v_res || pg_temp.r('a paused distributor''s code finds nothing', v ->> 'found' = 'false', v::text);
    v := public.referral_record_payment('in_zz_s6_2', v_s[6], 'sub_zz_s6', 'cus_zz_s6', 3900, 3900, 'sgd', 'monthly',
                                        now() - interval '30 seconds', 'fp_s6');
    v_res := v_res || pg_temp.r('paused: payments recorded, not earned', (v ->> 'eligible')::boolean = false, v::text);
    v := public.referral_admin_run(v_run + 14);
    select (x ->> 'credits')::boolean into v_bool from jsonb_array_elements(v -> 'rows') x where x ->> 'partnerId' = v_p1;
    v_res := v_res || pg_temp.r('a paused distributor waits in pay runs', v_bool = false and (v ->> 'canCredit')::boolean = false, v::text);
    v := public.referral_admin_set_status(v_p1, 'active', 'all fine');
    v := public.referral_admin_adjust(v_p1, -5, 'typo correction');
    v_res := v_res || pg_temp.r('a wallet adjustment', (v ->> 'balance')::numeric = 86.37, v::text);
    v_err := null;
    begin v := public.referral_admin_adjust(v_p1, 0, 'x'); exception when others then v_err := sqlstate; end;
    v_res := v_res || pg_temp.r('a zero adjustment is refused', v_err = '22023', v_err);
    v_err := null;
    begin v := public.referral_admin_settings(null, v_run + 7, null, 'move'); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('pay run dates are fixed after the first run', v_err like '22023%first pay run%', v_err);
    select count(*) into v_n from app.referral_admin_log;
    v_res := v_res || pg_temp.r('every admin action is logged (8)', v_n = 8, v_n::text);
    v := public.referral_admin_overview();
    v_res := v_res || pg_temp.r('overview', (v ->> 'toReview')::integer = 0 and (v ->> 'distributors')::integer = 2, v::text);
    v := public.referral_admin_partners();
    select x -> 'recruitedBy' ->> 'partnerId' into v_txt from jsonb_array_elements(v) x where x ->> 'partnerId' = v_p1;
    v_res := v_res || pg_temp.r('admins see who recruited whom', v_txt = v_r0, coalesce(v_txt, 'none'));
    v := public.referral_admin_partner(v_p1);
    v_res := v_res || pg_temp.r('admins see every shop', jsonb_array_length(v -> 'shops') >= 14, jsonb_array_length(v -> 'shops')::text);

    -- 12. A payment before the shop exists (sign-up not finished)
    v_step := 'no shop yet';
    v := public.referral_record_payment('in_zz_s13_1', null, 'sub_zz_s13', 'cus_zz_s13', 3900, 3900, 'sgd', 'monthly',
                                        now() - interval '20 seconds', 'fp_s13');
    v_res := v_res || pg_temp.r('a payment before the shop exists counts through the subscription', v ->> 'referral' = 'counted', v::text);
    v := public.referral_record_payment('in_zz_s13_1', v_s[13], 'sub_zz_s13', 'cus_zz_s13', 3900, 3900, 'sgd', 'monthly',
                                        now() - interval '20 seconds', 'fp_s13');
    v_res := v_res || pg_temp.r('then the shop is filled in', (select tenant_id from app.referrals where stripe_subscription_id = 'sub_zz_s13') = v_s[13], null);

    -- 13. Alerts
    v_step := 'alerts';
    select count(*) into v_n from public.notifications where type = 'referral' and tenant_id is not null;
    v_res := v_res || pg_temp.r('referral alerts carry no shop id (staff can''t read them)', v_n = 0, v_n::text);
    select count(*) into v_n from public.notifications where type = 'referral' and (link is distinct from '/refer' or data ->> 'shop_id' is null);
    v_res := v_res || pg_temp.r('referral alerts open Refer & earn', v_n = 0, v_n::text);
    select count(*) into v_n from public.notifications n where n.type = 'referral' and (n.message like '%zz Shop%' or n.title like '%zz Shop%');
    v_res := v_res || pg_temp.r('referral alerts name no shop', v_n = 0, v_n::text);
  exception when others then
    get stacked diagnostics v_ctx = pg_exception_context;
    v_res := v_res || pg_temp.r('CRASH in ' || v_step, false, sqlstate || ' ' || sqlerrm || ' | ' || left(v_ctx, 600));
  end;

  select jsonb_build_object(
           'passed', count(*) filter (where (x ->> 'ok')::boolean),
           'failed', count(*) filter (where not (x ->> 'ok')::boolean),
           'failures', coalesce(jsonb_agg(x) filter (where not (x ->> 'ok')::boolean), '[]'::jsonb))
    into v from jsonb_array_elements(v_res) x;
  raise exception 'TEST RESULTS %', v;
end $test$;
