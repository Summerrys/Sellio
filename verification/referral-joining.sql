-- Refer & earn is for paying shops (20 Nov 2026, supabase/migrations/20261120141926_referral_join_paying_shops.sql):
-- joining needs a payment recorded (by the shop, or by its Stripe subscription when it paid at
-- sign-up) and a plan past its free trial; the dashboard says why not. One transaction that ends by
-- raising its results ("TEST RESULTS {passed, failed, failures}"), so nothing stays (joining is
-- opened inside it). Live: paste the whole file into the Supabase SQL editor (or execute_sql).
-- verification/referral-programme.sql covers the same rule among the programme's other rules.
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
  a text := gen_random_uuid()::text;  -- on its trial
  b text := gen_random_uuid()::text;  -- active, nothing paid recorded
  c text := gen_random_uuid()::text;  -- active, paid
  d text := gen_random_uuid()::text;  -- active, paid at sign-up (payment found by its subscription)
  h text := gen_random_uuid()::text;  -- free home shop
  l text := gen_random_uuid()::text;  -- cancelled
  v jsonb;
  v_err text;
begin
  begin
    select terms_version into v_terms from app.referral_settings where id;
    update app.referral_settings set joining_open = true where id;  -- rolled back below
    insert into public.tenants (id, name, slug, owner_email, seller_type, status) values
      (a, 'zz Trial', 'zz-jr-a-' || left(a, 8), 'zz-jr-a@example.com', 'merchant', 'suspended'),
      (b, 'zz Unpaid', 'zz-jr-b-' || left(b, 8), 'zz-jr-b@example.com', 'merchant', 'suspended'),
      (c, 'zz Paid', 'zz-jr-c-' || left(c, 8), 'zz-jr-c@example.com', 'merchant', 'suspended'),
      (d, 'zz Paid First', 'zz-jr-d-' || left(d, 8), 'zz-jr-d@example.com', 'merchant', 'suspended'),
      (h, 'zz Home', 'zz-jr-h-' || left(h, 8), 'zz-jr-h@example.com', 'individual', 'suspended'),
      (l, 'zz Lapsed', 'zz-jr-l-' || left(l, 8), 'zz-jr-l@example.com', 'merchant', 'suspended');
    insert into public.tenant_users (tenant_id, user_email, is_owner, status) values
      (a, 'zz-jr-a@example.com', true, 'active'), (b, 'zz-jr-b@example.com', true, 'active'), (c, 'zz-jr-c@example.com', true, 'active'),
      (d, 'zz-jr-d@example.com', true, 'active'), (h, 'zz-jr-h@example.com', true, 'active'), (l, 'zz-jr-l@example.com', true, 'active');
    insert into public.subscriptions (tenant_id, tier, billing_cycle, status, current_period_end, stripe_subscription_id) values
      (a, 'starter', 'monthly', 'trial', now() + interval '5 days', 'sub_zz_jr_a'),
      (b, 'starter', 'monthly', 'active', now() + interval '20 days', 'sub_zz_jr_b'),
      (c, 'growth', 'monthly', 'active', now() + interval '20 days', 'sub_zz_jr_c'),
      (d, 'starter', 'yearly', 'active', now() + interval '300 days', 'sub_zz_jr_d'),
      (l, 'starter', 'monthly', 'cancelled', now() - interval '3 days', 'sub_zz_jr_l');
    insert into app.shop_payments (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid, commission_base, currency, billing_cycle, paid_at) values
      ('in_zz_jr_c', c, 'sub_zz_jr_c', 'cus_zz_jr_c', 79, 79, 'SGD', 'monthly', now() - interval '10 days'),
      ('in_zz_jr_d', null, 'sub_zz_jr_d', 'cus_zz_jr_d', 390, 390, 'SGD', 'yearly', now() - interval '10 days');

    perform pg_temp.as_user('zz-jr-a@example.com');
    v_err := null; begin v := public.referral_join(a, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('trial: refused, opens after the first payment', v_err = '42501 Refer & earn opens after your shop''s first payment.', v_err);
    v := public.referral_dashboard(a);
    v_res := v_res || pg_temp.r('trial: dashboard says trial', (v ->> 'canJoin')::boolean = false and v ->> 'joinBlock' = 'trial', v::text);

    perform pg_temp.as_user('zz-jr-b@example.com');
    v_err := null; begin v := public.referral_join(b, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('active but no payment recorded: refused the same way', v_err = '42501 Refer & earn opens after your shop''s first payment.', v_err);
    v := public.referral_dashboard(b);
    v_res := v_res || pg_temp.r('…dashboard says no payment', v ->> 'joinBlock' = 'no payment', v::text);

    perform pg_temp.as_user('zz-jr-c@example.com');
    v := public.referral_dashboard(c);
    v_res := v_res || pg_temp.r('paid: dashboard can join, no reason', (v ->> 'canJoin')::boolean and v -> 'joinBlock' = 'null'::jsonb, v::text);
    v := public.referral_join(c, v_terms);
    v_res := v_res || pg_temp.r('paid: joins with a code', v ->> 'code' ~ '^[A-HJ-NP-Z2-9]{6}$', v::text);

    perform pg_temp.as_user('zz-jr-d@example.com');
    v := public.referral_dashboard(d);
    v_res := v_res || pg_temp.r('paid at sign-up (found by its subscription): can join', (v ->> 'canJoin')::boolean, v::text);

    perform pg_temp.as_user('zz-jr-h@example.com');
    v_err := null; begin v := public.referral_join(h, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('home shop: refused, paid business plan', v_err = '42501 Refer & earn is for shops on a paid business plan.', v_err);
    v := public.referral_dashboard(h);
    v_res := v_res || pg_temp.r('home shop: dashboard says home shop', v ->> 'joinBlock' = 'home shop', v::text);

    perform pg_temp.as_user('zz-jr-l@example.com');
    v_err := null; begin v := public.referral_join(l, v_terms); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('cancelled plan: refused, paid business plan', v_err = '42501 Refer & earn is for shops on a paid business plan.', v_err);
    v := public.referral_dashboard(l);
    v_res := v_res || pg_temp.r('cancelled plan: dashboard says plan lapsed', v ->> 'joinBlock' = 'plan lapsed', v::text);

    v_res := v_res || pg_temp.r('the rule itself is not callable by app users',
      not has_function_privilege('authenticated', 'app.referral_join_block(text)', 'execute')
      and not has_function_privilege('anon', 'app.referral_join_block(text)', 'execute'), null);
  exception when others then
    get stacked diagnostics v_err = message_text;
    v_res := v_res || pg_temp.r('no error', false, v_err);
  end;
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) x where (x ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) x where not (x ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_res) x where not (x ->> 'ok')::boolean));
end
$test$;
