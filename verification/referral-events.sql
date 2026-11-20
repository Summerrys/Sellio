-- Refer & earn: every referral's history (app.referral_events) and codes typed at sign-up
-- (reft_CODE) recorded as typed, 20 Nov 2026 (supabase/migrations/*_referral_events_and_typed_codes.sql).
-- One transaction that ends by raising its results ("TEST RESULTS {passed, failed, failures}"), so
-- nothing stays. Test shops are named "zz ..." with @example.com owners.
-- Live: paste the whole file into the Supabase SQL editor (or execute_sql).
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
  v_terms text;
  v_p text := gen_random_uuid()::text;   -- Kopi Corner, a distributor
  v_q text := gen_random_uuid()::text;   -- Laksa House, another distributor
  v_s text := gen_random_uuid()::text;   -- a home shop moving to a business plan
  e_p text := 'zz-ev-p@example.com';
  e_q text := 'zz-ev-q@example.com';
  e_s text := 'zz-ev-s@example.com';
  c_p text;
  c_q text;
  v jsonb;
  v_ref uuid;
  v_n integer;
  v_txt text;
  ev record;
  v_err text;
  v_step text := 'setup';
begin
  begin
    select terms_version into v_terms from app.referral_settings where id;
    insert into public.tenants (id, name, slug, owner_email, seller_type, status) values
      (v_p, 'zz Kopi Corner', 'zz-ev-p-' || left(v_p, 8), e_p, 'merchant', 'suspended'),
      (v_q, 'zz Laksa House', 'zz-ev-q-' || left(v_q, 8), e_q, 'merchant', 'suspended'),
      (v_s, 'zz Mei Bakes', 'zz-ev-s-' || left(v_s, 8), e_s, 'individual', 'suspended');
    insert into public.tenant_users (tenant_id, user_email, is_owner, status) values
      (v_p, e_p, true, 'active'), (v_q, e_q, true, 'active'), (v_s, e_s, true, 'active');
    insert into public.subscriptions (tenant_id, tier, billing_cycle, status, current_period_end, stripe_subscription_id) values
      (v_p, 'starter', 'monthly', 'active', now() + interval '20 days', 'sub_zz_ev_p'),
      (v_q, 'growth', 'monthly', 'active', now() + interval '20 days', 'sub_zz_ev_q');
    c_p := app.referral_new_code();
    insert into app.referral_partners (tenant_id, code, joined_by_email, terms_version) values (v_p, c_p, e_p, v_terms);
    c_q := app.referral_new_code();
    insert into app.referral_partners (tenant_id, code, joined_by_email, terms_version) values (v_q, c_q, e_q, v_terms);

    -- 1. A link's code (ref_CODE): source link, and its first line.
    v_step := 'link';
    perform pg_temp.as_user(null);
    v := public.referral_note_checkout('ref_' || c_p, 'cs_zz_ev_1', 'cus_zz_ev_1', 'sub_zz_ev_1', 'owner1@example.com', null, true);
    v_ref := (v ->> 'referralId')::uuid;
    select source into v_txt from app.referrals where id = v_ref;
    v_res := v_res || pg_temp.r('a link''s code is recorded as link', v_txt = 'link', v_txt);
    select * into ev from app.referral_events where referral_id = v_ref order by id limit 1;
    v_res := v_res || pg_temp.r('…with a line: linked, the distributor, the checkout',
      ev.event = 'linked' and ev.partner_id = v_p and ev.source = 'link' and ev.status = 'pending'
      and ev.details ->> 'stripe_session_id' = 'cs_zz_ev_1' and ev.details ->> 'customer_email' = 'owner1@example.com',
      row_to_json(ev)::text);

    -- 2. A code typed at sign-up (reft_CODE, any case or dashes): source code.
    v_step := 'typed';
    v := public.referral_note_checkout('reft_' || c_q, 'cs_zz_ev_2', 'cus_zz_ev_2', 'sub_zz_ev_2', 'owner2@example.com', null, true);
    select source, partner_id into ev from app.referrals where id = (v ->> 'referralId')::uuid;
    v_res := v_res || pg_temp.r('a typed code (reft_) is recorded as code, for its distributor', ev.source = 'code' and ev.partner_id = v_q, row_to_json(ev)::text);
    select event into v_txt from app.referral_events where referral_id = (v ->> 'referralId')::uuid;
    v_res := v_res || pg_temp.r('…with a line: typed', v_txt = 'typed', v_txt);
    v := public.referral_note_checkout('REFT-' || lower(c_q), 'cs_zz_ev_3', null, 'sub_zz_ev_3', 'owner3@example.com', null, true);
    select source into v_txt from app.referrals where id = (v ->> 'referralId')::uuid;
    v_res := v_res || pg_temp.r('reft_ in other cases and with a dash still reads as typed', v_txt = 'code', v::text || ' ' || coalesce(v_txt, ''));
    v := public.referral_note_checkout(c_p, 'cs_zz_ev_4', null, 'sub_zz_ev_4', 'owner4@example.com', null, true);
    select source into v_txt from app.referrals where id = (v ->> 'referralId')::uuid;
    v_res := v_res || pg_temp.r('a bare code still reads as a link''s, as before', v_txt = 'link', v::text);
    v := public.referral_note_checkout('reft_ZZZZZZ', 'cs_zz_ev_5', null, null, 'owner5@example.com', null, true);
    v_res := v_res || pg_temp.r('a typed code no distributor has: refused, as before', v ->> 'reason' = 'unknown code', v::text);
    v := public.referral_note_checkout('reft_' || c_q, 'cs_zz_ev_2', 'cus_zz_ev_2', 'sub_zz_ev_2', 'owner2@example.com', null, true);
    v_res := v_res || pg_temp.r('the same checkout twice: noted once', (v ->> 'repeat')::boolean
      and (select count(*) from app.referrals where stripe_session_id = 'cs_zz_ev_2') = 1, v::text);

    -- 3. A home shop names Kopi Corner in its plan window, then Laksa House: typed, then replaced.
    v_step := 'attach';
    perform pg_temp.as_user(e_s);
    v := public.referral_attach(v_s, c_p);
    select * into ev from app.referral_events where tenant_id = v_s order by id desc limit 1;
    v_res := v_res || pg_temp.r('a code typed in the plan window: a typed line, by the owner',
      ev.event = 'typed' and ev.partner_id = v_p and ev.source = 'code' and ev.actor = e_s, row_to_json(ev)::text);
    v_ref := ev.referral_id;
    v := public.referral_attach(v_s, c_q);
    select * into ev from app.referral_events where referral_id = v_ref order by id desc limit 1;
    v_res := v_res || pg_temp.r('another code before the first payment: replaced, with who had it before',
      ev.event = 'replaced' and ev.partner_id = v_q and ev.previous_partner_id = v_p and ev.actor = e_s
      and ev.details -> 'partner_id' ->> 'from' = v_p and ev.details -> 'partner_id' ->> 'to' = v_q, row_to_json(ev)::text);
    v := public.referral_attach(v_s, c_q);
    select count(*) into v_n from app.referral_events where referral_id = v_ref;
    v_res := v_res || pg_temp.r('the same code again changes nothing, so no line', v_n = 2, v_n::text);

    -- 4. Counted at the first payment, voided, reopened: each a line.
    v_step := 'status';
    perform pg_temp.as_user(null);
    update app.referrals set status = 'counted', counted_at = now(), counted_cycle = 'monthly', first_invoice_id = 'in_zz_ev_1' where id = v_ref;
    select * into ev from app.referral_events where referral_id = v_ref order by id desc limit 1;
    v_res := v_res || pg_temp.r('counted', ev.event = 'counted' and ev.details -> 'first_invoice_id' ->> 'to' = 'in_zz_ev_1', row_to_json(ev)::text);
    update app.referrals set status = 'void', void_reason = 'zz test', voided_at = now() where id = v_ref;
    select event into v_txt from app.referral_events where referral_id = v_ref order by id desc limit 1;
    v_res := v_res || pg_temp.r('voided', v_txt = 'voided', v_txt);
    update app.referrals set status = 'pending', void_reason = null, voided_at = null, counted_at = null, counted_cycle = null where id = v_ref;
    select event into v_txt from app.referral_events where referral_id = v_ref order by id desc limit 1;
    v_res := v_res || pg_temp.r('reopened', v_txt = 'reopened', v_txt);
    update app.referrals set updated_at = now() where id = v_ref;
    select count(*) into v_n from app.referral_events where referral_id = v_ref;
    v_res := v_res || pg_temp.r('a touch of updated_at alone is no line', v_n = 5, v_n::text);

    -- 5. Only Sellio's functions read it.
    v_step := 'privileges';
    v_res := v_res || pg_temp.r('signed-in people and visitors can''t read the history',
      not has_table_privilege('authenticated', 'app.referral_events', 'select') and not has_table_privilege('anon', 'app.referral_events', 'select'),
      null);
    v_res := v_res || pg_temp.r('row-level security is on', (select relrowsecurity from pg_class where oid = 'app.referral_events'::regclass), null);
  exception when others then
    get stacked diagnostics v_err = message_text;
    v_res := v_res || pg_temp.r('no error (step ' || v_step || ')', false, v_err);
  end;
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) x where (x ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) x where not (x ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_res) x where not (x ->> 'ok')::boolean));
end
$test$;
