-- The coins wallet (25 Nov 2026, supabase/migrations/…_world_wallet.sql): the caller's own
-- balance, earned and spent, today's play against the limit, and their coins in and out, newest
-- first, with the shop, item, badge or kind of referral each line is about. One transaction that
-- ends by raising its results, so nothing stays.
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
create function pg_temp.as_user(p_email text, p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_email is null then ''
                         else json_build_object('email', p_email, 'sub', p_id, 'role', 'authenticated')::text end, true)
$$;
do $test$
declare
  v_res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa text := gen_random_uuid()::text;
  v jsonb; v_err text; h jsonb;
begin
  begin
    insert into auth.users (id, email) values (ua, 'zz-w-a@example.com'), (ub, 'zz-w-b@example.com');
    insert into public.tenants (id, name, slug, owner_email, seller_type, status)
    values (fa, 'zz Wallet Bakes', 'zz-w-' || left(fa, 8), 'zz-w-b@example.com', 'individual', 'active');
    perform app.world_credit(ua, 2, 'drop', 'zz-w-drop');
    perform app.world_credit(ua, 2, 'visit', fa || ':' || app.shop_today()::text);
    perform app.world_credit(ua, 50, 'referral', gen_random_uuid()::text || ':free');
    perform app.world_credit(ua, -30, 'cosmetic', fa || ':sign:neon');
    perform app.world_award(ua, 'first_steps');
    perform app.world_credit(ub, 2, 'drop', 'zz-w-other');

    perform pg_temp.as_user('zz-w-a@example.com', ua);
    v := public.world_wallet();
    h := v -> 'history';
    v_res := v_res || pg_temp.r('balance, earned and spent', (v ->> 'balance')::int = 24 + (select reward from app.world_achievement_defs where code = 'first_steps')
      and (v ->> 'spent')::int = 30, v::text);
    v_res := v_res || pg_temp.r('today: 4 from playing (2 street, 2 visits), 26 left of 30',
      (v -> 'today' ->> 'earned')::int = 4 and (v -> 'today' ->> 'drops')::int = 2 and (v -> 'today' ->> 'visits')::int = 2
      and (v -> 'today' ->> 'cap')::int = 30 and (v -> 'today' ->> 'left')::int = 26, (v -> 'today')::text);
    v_res := v_res || pg_temp.r('the rules shown with it', (v ->> 'dropMax')::int = 2 and (v ->> 'visitReward')::int = 2
      and (v -> 'referralCoins' ->> 'free')::int = 50 and (v -> 'referralCoins' ->> 'merchant')::int = 100, v::text);
    v_res := v_res || pg_temp.r('history: newest first, own lines only', jsonb_array_length(h) = 5
      and h -> 0 ->> 'reason' = 'achievement' and h -> 4 ->> 'reason' = 'drop', h::text);
    v_res := v_res || pg_temp.r('a badge line names the badge', h -> 0 ->> 'badge' = (select name from app.world_achievement_defs where code = 'first_steps'), (h -> 0)::text);
    v_res := v_res || pg_temp.r('a stall item line names the item, with what it cost',
      h -> 1 ->> 'item' = (select name from app.world_cosmetics where id = 'sign:neon') and (h -> 1 ->> 'delta')::int = -30, (h -> 1)::text);
    v_res := v_res || pg_temp.r('a referral line says the kind, not the shop', h -> 2 ->> 'kind' = 'free' and h -> 2 -> 'shop' = 'null'::jsonb, (h -> 2)::text);
    v_res := v_res || pg_temp.r('a visit line names the shop', h -> 3 ->> 'shop' = 'zz Wallet Bakes', (h -> 3)::text);
    v_res := v_res || pg_temp.r('fewer lines when asked', jsonb_array_length(public.world_wallet(2) -> 'history') = 2, null);

    update app.world_ledger set ref = ref || '@before-reset-2026-11-25' where user_id = ua and reason = 'achievement';
    v_res := v_res || pg_temp.r('a badge earned before a reset still has its name',
      public.world_wallet() -> 'history' -> 0 ->> 'badge' = (select name from app.world_achievement_defs where code = 'first_steps'), null);

    perform pg_temp.as_user('zz-w-b@example.com', ub);
    v := public.world_wallet();
    v_res := v_res || pg_temp.r('someone else sees only their own', (v ->> 'balance')::int = 2 and jsonb_array_length(v -> 'history') = 1, v::text);

    perform pg_temp.as_user(null, null);
    v_err := null; begin v := public.world_wallet(); exception when others then v_err := sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || pg_temp.r('signed out: refused', v_err = '42501 Sign in to see your coins.', v_err);
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
