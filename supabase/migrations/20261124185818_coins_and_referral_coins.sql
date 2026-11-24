-- Sellio Coins and Refer & earn for every shop (Alvin, 24 Nov 2026).
--
-- 1. Street coins are worth 1 or 2 ("coins worth 1-2 coins will do"), and what a player earns by
--    playing in a day stops at 30 ("Limit it to 30 coins per day"): street coins, shop visits,
--    missions and the daily reward all count toward it. Badges, sales milestones and referral
--    coins don't.
-- 2. Every shop owner, free or business, has one referral code (app.shop_codes; a distributor's
--    code is its shop's code). "Referral from free/merchant to free sellers, get 50coins. Referral
--    from free/merchant to merchants will get 100coins":
--      - a free home seller brought in earns the code's owner 50 coins, when their new shop puts
--        up its first listing;
--      - a business brought in earns 100, when its first payment after the trial goes through.
--        A free shop that later pays for a plan tops its referrer up to 100.
--    A free home seller's code earns once (20 Nov 2026: "the referral code can only be used once
--    for free sellers"). Every use of a code is kept in app.coin_referrals, earned or not. The
--    distributor programme (cash) is unchanged.
-- 3. Admin → Coins: Sellio's admins set item prices, turn items on and off, and change the coin
--    rules above (app.coins_setting_keys), every change logged in app.coins_admin_log.
-- 4. Every stall wears the same Sellio awning: the paid awnings come off sale.
--
-- Functions this replaces are checked first (md5 of the live definitions, 24 Nov 2026).

do $guard$
declare
  r record;
begin
  for r in select * from (values
    ('app.world_credit(uuid,integer,text,text)', '359a99615aa42f7791967b140755e68f'),
    ('app.world_pick_value(double precision)', 'dbc8e31089690c503fc7da50000481e4'),
    ('app.world_seed_drops(uuid,date,integer,boolean)', '61ef0be37ce47f7e210e3ddb94557bba'),
    ('app.world_profile(uuid,date,text)', '0ce35774e3e9c1d0a5e66eb96f311037'),
    ('public.world_claim_drop(uuid)', '13a47d2776ea77a29c595d0476c09bfd'),
    ('public.world_claim_visit(text)', '275e1a6a2542d8d6650d9b8b4ab39521'),
    ('app.referral_new_code()', '779e20511e074fae8e0ba75e3de3bdbe'),
    ('public.referral_join(text,text)', '9649087a6d79c070ce027847dbc0fda2'),
    ('public.referral_attach(text,text)', 'eb2b313fa655662da1e1227023855516'),
    ('public.referral_note_checkout(text,text,text,text,text,text,boolean)', '69863c956cd9a8ce1c0c0d60f1c9d4d9'),
    ('public.referral_code_info(text)', 'f2eca85724fdc089dc69911f8e169838'),
    ('app.referral_join_block(text)', '70e1d62df56201a0f21beeb63a985fab')
  ) as x(fn, expected) loop
    if md5(pg_get_functiondef(r.fn::regprocedure)) <> r.expected then
      raise exception '% is not the version this migration replaces (md5 %)', r.fn, md5(pg_get_functiondef(r.fn::regprocedure));
    end if;
  end loop;
end
$guard$;

-- ── 1. The coin rules

insert into app.world_config (key, value, note) values
  ('drop_max_value', '2', 'Street coins are worth 1 up to this (1 to 5). Alvin, 24 Nov 2026: 1 or 2.'),
  ('daily_cap', '30', 'The most coins a player earns by playing in a day (street coins, shop visits, missions, daily reward). 0 = no limit.'),
  ('referral_coins_free', '50', 'Coins for bringing in a free home seller, when their shop puts up its first listing.'),
  ('referral_coins_merchant', '100', 'Coins for bringing in a business, when its first payment after the trial goes through.'),
  ('referral_free_code_uses', '1', 'How many times a free home seller''s code earns. 0 = no limit.')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- "Find a 5-coin" can't happen any more.
update app.world_mission_defs set active = false where code = 'big_coin';
-- One awning for every stall (Alvin, 17 and 24 Nov 2026): the paid ones come off sale.
update app.world_cosmetics set active = false where slot = 'awning' and price > 0;
-- Coins still lying on the street keep to the new values.
update app.world_drops set value = least(value, 2) where claimed_at is null and value > 2;

-- Referral coins go in the coin ledger too: its reasons allow 'referral' (the migration before this,
-- coin_ledger_referral_reason).

create or replace function app.world_drop_max()
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select greatest(1, least(5, app.world_cfg_int('drop_max_value', 2)))
$function$;

-- Coins earned by playing today (Singapore's day): what the daily limit counts.
create or replace function app.world_play_today(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(sum(l.delta), 0)::integer
    from app.world_ledger l
   where l.user_id = p_user and l.delta > 0
     and l.reason in ('drop', 'visit', 'mission', 'missions_all', 'daily')
     and l.created_at >= (app.shop_today()::timestamp at time zone 'Asia/Singapore')
$function$;

-- How many more coins a player can earn by playing today; null when there's no limit.
create or replace function app.world_play_left(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select case when app.world_cfg_int('daily_cap', 30) <= 0 then null
              else greatest(0, app.world_cfg_int('daily_cap', 30) - app.world_play_today(p_user)) end
$function$;

create or replace function app.world_credit(p_user uuid, p_delta integer, p_reason text, p_ref text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_balance integer;
  v_left integer;
begin
  if p_delta = 0 then return null; end if;
  -- Coins from playing stop at the day's limit (24 Nov 2026): the last pickup pays what's left,
  -- and after that nothing is written.
  if p_delta > 0 and p_reason in ('drop', 'visit', 'mission', 'missions_all', 'daily') then
    v_left := app.world_play_left(p_user);
    if v_left is not null then
      if v_left <= 0 then return null; end if;
      p_delta := least(p_delta, v_left);
    end if;
  end if;
  insert into app.world_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from app.world_wallets w where w.user_id = p_user for update;
  if v_balance + p_delta < 0 then
    raise exception 'You need % more coins for this.', -(v_balance + p_delta) using errcode = 'P0001', hint = 'insufficient_coins';
  end if;
  begin
    insert into app.world_ledger (user_id, delta, reason, ref, balance_after)
    values (p_user, p_delta, p_reason, p_ref, v_balance + p_delta);
  exception when unique_violation then
    return null;
  end;
  update app.world_wallets w
     set balance = w.balance + p_delta,
         lifetime_earned = w.lifetime_earned
           + case when p_delta > 0 and p_reason not in ('purchase', 'admin', 'cosmetic') then p_delta else 0 end,
         updated_at = now()
   where w.user_id = p_user;
  return v_balance + p_delta;
end $function$;

create or replace function app.world_pick_value(p_roll double precision)
returns smallint
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_weights jsonb := coalesce(app.world_cfg('drop_weights'), '[36, 28, 18, 11, 7]'::jsonb);
  v_n integer;
  v_total numeric := 0; v_acc numeric := 0; i integer;
begin
  -- A coin is worth 1 up to drop_max_value, weighted as drop_weights.
  v_n := least(jsonb_array_length(v_weights), app.world_drop_max());
  for i in 0 .. v_n - 1 loop v_total := v_total + (v_weights ->> i)::numeric; end loop;
  for i in 0 .. v_n - 1 loop
    v_acc := v_acc + (v_weights ->> i)::numeric;
    if p_roll * v_total < v_acc then return (i + 1)::smallint; end if;
  end loop;
  return 1;
end $function$;

create or replace function app.world_seed_drops(p_user uuid, p_day date, p_count integer, p_night boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  b jsonb := app.world_street_layout();
  v_x real := (b ->> 'x')::real; v_zmin real := (b ->> 'zmin')::real; v_zmax real := (b ->> 'zmax')::real;
begin
  if p_count <= 0 then return; end if;
  -- Night-market coins are worth one more, up to the highest value.
  insert into app.world_drops (user_id, day, x, z, value, night)
  select p_user, p_day,
         round(((random() * 2 - 1) * v_x)::numeric, 2),
         round((v_zmin + (i + 0.15 + random() * 0.7) * (v_zmax - v_zmin) / p_count)::numeric, 2),
         case when p_night then least(app.world_drop_max(), app.world_pick_value(random()) + 1) else app.world_pick_value(random()) end,
         p_night
    from generate_series(0, p_count - 1) as i;
end $function$;

create or replace function public.world_claim_drop(p_drop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := app.world_require_user();
  v_day date := app.shop_today();
  v_drop app.world_drops;
  v_state app.world_days;
  v_dt double precision; v_dist double precision;
  v_before integer; v_balance integer; v_left integer;
  v_unlocked jsonb := '[]'::jsonb; v_a jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform app.world_require_open(app.world_my_shop());
  perform pg_advisory_xact_lock(hashtextextended('sellio-world:' || v_user::text, 0));
  select * into v_drop from app.world_drops d where d.id = p_drop_id and d.user_id = v_user for update;
  if not found or v_drop.day <> v_day then
    raise exception 'That coin has gone.' using errcode = '22023', hint = 'drop_gone';
  end if;
  if v_drop.claimed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already',
                              'balance', coalesce((select w.balance from app.world_wallets w where w.user_id = v_user), 0));
  end if;
  -- Today's coins are all collected (the daily limit): the coin stays where it is.
  v_left := app.world_play_left(v_user);
  if v_left is not null and v_left <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'cap_left', 0,
                              'balance', coalesce((select w.balance from app.world_wallets w where w.user_id = v_user), 0));
  end if;

  select * into v_state from app.world_days d where d.user_id = v_user and d.day = v_day for update;
  if v_state.last_claim_at is not null then
    v_dt := extract(epoch from (v_now - v_state.last_claim_at));
    if v_dt * 1000 < app.world_cfg_int('claim_min_interval_ms', 300) then
      raise exception 'Slow down a little.' using errcode = 'P0001', hint = 'too_fast';
    end if;
    v_dist := sqrt(power(v_drop.x - v_state.last_claim_x, 2) + power(v_drop.z - v_state.last_claim_z, 2));
    if v_dist > app.world_cfg_int('claim_max_speed', 7) * v_dt + app.world_cfg_int('claim_slack', 2) then
      raise exception 'Walk to the coin to pick it up.' using errcode = 'P0001', hint = 'too_far';
    end if;
  end if;

  update app.world_drops d set claimed_at = v_now where d.id = v_drop.id;
  update app.world_days d set last_claim_at = v_now, last_claim_x = v_drop.x, last_claim_z = v_drop.z
   where d.user_id = v_user and d.day = v_day;
  v_before := coalesce((select w.balance from app.world_wallets w where w.user_id = v_user), 0);
  v_balance := app.world_credit(v_user, v_drop.value, 'drop', v_drop.id::text);

  perform app.world_bump(v_user, v_day, 'drops', 1);
  perform app.world_bump(v_user, v_day, 'drop_value', v_drop.value);
  if v_drop.value >= app.world_drop_max() then perform app.world_bump(v_user, v_day, 'big_coin', 1); end if;

  v_a := app.world_award(v_user, 'first_steps'); if v_a is not null then v_unlocked := v_unlocked || v_a; end if;
  if v_drop.night then
    v_a := app.world_award(v_user, 'night_owl'); if v_a is not null then v_unlocked := v_unlocked || v_a; end if;
  end if;
  if (select coalesce(sum(l.delta), 0) from app.world_ledger l where l.user_id = v_user and l.reason = 'drop') >= 100 then
    v_a := app.world_award(v_user, 'collector'); if v_a is not null then v_unlocked := v_unlocked || v_a; end if;
  end if;

  return jsonb_build_object('ok', true, 'value', v_drop.value,
    'credited', coalesce(v_balance, v_before) - v_before,
    'cap_left', app.world_play_left(v_user),
    'balance', (select w.balance from app.world_wallets w where w.user_id = v_user),
    'missions', (select d.missions from app.world_days d where d.user_id = v_user and d.day = v_day),
    'unlocked', v_unlocked);
end $function$;

create or replace function public.world_claim_visit(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := app.world_require_user();
  v_day date := app.shop_today();
  v_state app.world_days;
  v_before integer;
  v_balance integer;
  v_left integer;
  v_unlocked jsonb := '[]'::jsonb; v_a jsonb;
  v_ref text := p_tenant_id || ':' || v_day::text;
  v_new_shop boolean;
begin
  perform app.world_require_open(app.world_my_shop());
  perform pg_advisory_xact_lock(hashtextextended('sellio-world:' || v_user::text, 0));
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.seller_type = 'individual'
                  and t.status = 'active' and app.can_sell(t.id))
     and not app.world_is_fnb_merchant(p_tenant_id) then
    raise exception 'This shop is not in Sellio World.' using errcode = '22023', hint = 'not_a_street_shop';
  end if;
  if app.is_member(p_tenant_id) then
    return jsonb_build_object('ok', false, 'reason', 'own_shop');
  end if;
  v_state := app.world_day_state(v_user, v_day, app.world_my_shop() is not null);
  if exists (select 1 from app.world_ledger l where l.user_id = v_user and l.reason = 'visit' and l.ref = v_ref) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if v_state.visits >= app.world_cfg_int('visit_max_per_day', 5) then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;
  -- The day's coin limit (24 Nov 2026): the shop still opens, without coins.
  v_left := app.world_play_left(v_user);
  if v_left is not null and v_left <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  v_new_shop := not exists (select 1 from app.world_ledger l where l.user_id = v_user and l.reason = 'visit'
                              and split_part(l.ref, ':', 1) = p_tenant_id);
  v_before := coalesce((select w.balance from app.world_wallets w where w.user_id = v_user), 0);
  v_balance := app.world_credit(v_user, app.world_cfg_int('visit_reward', 2), 'visit', v_ref);
  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  update app.world_days d set visits = d.visits + 1 where d.user_id = v_user and d.day = v_day;
  perform app.world_bump(v_user, v_day, 'visits', 1);
  if v_new_shop then perform app.world_bump(v_user, v_day, 'new_shop', 1); end if;

  v_a := app.world_award(v_user, 'window_shopper'); if v_a is not null then v_unlocked := v_unlocked || v_a; end if;
  if (select count(distinct split_part(l.ref, ':', 1)) from app.world_ledger l where l.user_id = v_user and l.reason = 'visit') >= 10 then
    v_a := app.world_award(v_user, 'regular'); if v_a is not null then v_unlocked := v_unlocked || v_a; end if;
  end if;

  return jsonb_build_object('ok', true, 'value', v_balance - v_before,
    'cap_left', app.world_play_left(v_user),
    'balance', (select w.balance from app.world_wallets w where w.user_id = v_user),
    'missions', (select d.missions from app.world_days d where d.user_id = v_user and d.day = v_day),
    'unlocked', v_unlocked);
end $function$;

create or replace function app.world_profile(p_user uuid, p_day date, p_shop text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_wallet app.world_wallets; v_streak app.world_streaks; v_state app.world_days;
  v_levels jsonb := coalesce(app.world_cfg('explorer_level_coins'), '[0]'::jsonb);
  v_rewards jsonb := coalesce(app.world_cfg('streak_rewards'), '[3, 4, 5, 6, 8, 10, 15]'::jsonb);
  v_night jsonb := coalesce(app.world_cfg('night_window'), '{"start": "19:00", "end": "21:00"}'::jsonb);
  v_now time := (now() at time zone 'Asia/Singapore')::time;
  v_level integer := 1; v_next integer; i integer;
  v_claimed boolean; v_next_streak integer; v_current integer;
  v_cap integer := app.world_cfg_int('daily_cap', 30);
  v_left integer := app.world_play_left(p_user);
begin
  select * into v_wallet from app.world_wallets w where w.user_id = p_user;
  select * into v_streak from app.world_streaks s where s.user_id = p_user;
  select * into v_state from app.world_days d where d.user_id = p_user and d.day = p_day;
  for i in 0 .. jsonb_array_length(v_levels) - 1 loop
    if coalesce(v_wallet.lifetime_earned, 0) >= (v_levels ->> i)::integer then v_level := i + 1;
    elsif v_next is null then v_next := (v_levels ->> i)::integer; end if;
  end loop;
  v_claimed := v_streak.last_day = p_day;
  v_current := case when v_streak.last_day >= p_day - 1 then coalesce(v_streak.current, 0) else 0 end;
  v_next_streak := case when v_claimed then v_current else v_current + 1 end;
  return jsonb_build_object(
    'day', p_day,
    'balance', coalesce(v_wallet.balance, 0),
    'lifetime', coalesce(v_wallet.lifetime_earned, 0),
    'level', v_level,
    'next_level_at', v_next,
    'my_shop', p_shop,
    'streak', jsonb_build_object(
      'current', v_current, 'best', coalesce(v_streak.best, 0), 'claimed_today', coalesce(v_claimed, false),
      'reward', (v_rewards ->> ((greatest(v_next_streak, 1) - 1) % jsonb_array_length(v_rewards)))::integer,
      'rewards', v_rewards),
    -- Today's coins are all collected: no more on the street until tomorrow.
    'drops', case when v_left is not null and v_left <= 0 then '[]'::jsonb
                  else coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'x', d.x, 'z', d.z, 'value', d.value, 'night', d.night) order by d.z desc)
                                   from app.world_drops d where d.user_id = p_user and d.day = p_day and d.claimed_at is null), '[]'::jsonb) end,
    'daily_cap', case when v_cap > 0 then v_cap end,
    'today_earned', app.world_play_today(p_user),
    'cap_left', v_left,
    'drop_max', app.world_drop_max(),
    'missions', coalesce(v_state.missions, '[]'::jsonb),
    'missions_bonus', app.world_cfg_int('missions_all_bonus', 10),
    'missions_all_claimed', coalesce(v_state.all_claimed, false),
    'visits_left', greatest(0, app.world_cfg_int('visit_max_per_day', 5) - coalesce(v_state.visits, 0)),
    'visited_today', coalesce((select jsonb_agg(left(l.ref, length(l.ref) - length(':' || p_day::text)))
                                 from app.world_ledger l
                                where l.user_id = p_user and l.reason = 'visit' and l.ref like '%:' || p_day::text), '[]'::jsonb),
    'visit_reward', app.world_cfg_int('visit_reward', 2),
    'night', jsonb_build_object('start', v_night ->> 'start', 'end', v_night ->> 'end',
                                'active', v_now >= (v_night ->> 'start')::time and v_now < (v_night ->> 'end')::time),
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'description', a.description,
                                       'reward', a.reward, 'unlocked', u.unlocked_at is not null) order by a.sort)
                                from app.world_achievement_defs a
                                left join app.world_achievements u on u.code = a.code and u.user_id = p_user), '[]'::jsonb),
    'server_time', now());
end $function$;

-- ── 2. A referral code for every shop

create table app.shop_codes (
  tenant_id text primary key,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table app.shop_codes enable row level security;
revoke all on table app.shop_codes from public, anon, authenticated;

-- A distributor's code stays theirs, now as its shop's code.
insert into app.shop_codes (tenant_id, code)
select p.tenant_id, p.code from app.referral_partners p
on conflict do nothing;

create or replace function app.referral_new_code()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  for i in 1..50 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for j in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) % 32) + 1, 1);
    end loop;
    if not exists (select 1 from app.referral_partners p where p.code = v_code)
       and not exists (select 1 from app.shop_codes s where s.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Could not make a referral code. Please try again.';
end $function$;

-- The shop whose code this is, when the code earns coins: not a distributor's code that Sellio has
-- paused or closed.
create or replace function app.shop_code_owner(p_code text)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select s.tenant_id from app.shop_codes s
   where s.code = p_code
     and not exists (select 1 from app.referral_partners p where p.tenant_id = s.tenant_id and p.status <> 'active')
$function$;

-- The shop's referral code, made the first time it's asked for.
create or replace function app.shop_code(p_tenant_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text;
begin
  select s.code into v_code from app.shop_codes s where s.tenant_id = p_tenant_id;
  if found then return v_code; end if;
  perform app.referral_lock();
  select s.code into v_code from app.shop_codes s where s.tenant_id = p_tenant_id;
  if found then return v_code; end if;
  select p.code into v_code from app.referral_partners p where p.tenant_id = p_tenant_id;
  if v_code is null then v_code := app.referral_new_code(); end if;
  insert into app.shop_codes (tenant_id, code) values (p_tenant_id, v_code);
  return v_code;
end $function$;

create or replace function public.referral_join(p_tenant_id text, p_terms_version text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s app.referral_settings%rowtype;
  t public.tenants%rowtype;
  p app.referral_partners%rowtype;
  v_block text;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can do this.' using errcode = '42501';
  end if;
  perform app.referral_lock();
  select * into s from app.referral_settings where id;
  select * into p from app.referral_partners where tenant_id = p_tenant_id;
  if found then
    if p.status = 'closed' then
      raise exception 'Refer & earn is closed for this shop.' using errcode = '42501';
    end if;
    return jsonb_build_object('ok', true, 'code', p.code, 'already', true);
  end if;
  if not s.joining_open and not app.is_sellio_admin() then
    raise exception 'Refer & earn isn''t open yet.' using errcode = '42501';
  end if;
  if p_terms_version is distinct from s.terms_version then
    raise exception 'The distributor terms have changed. Please read them again.' using errcode = '22023';
  end if;
  select * into t from public.tenants where id = p_tenant_id;
  -- Paying shops only (20 Nov 2026): a payment recorded, and a plan past its free trial.
  v_block := app.referral_join_block(p_tenant_id);
  if v_block in ('trial', 'no payment') then
    raise exception 'Refer & earn opens after your shop''s first payment.' using errcode = '42501';
  elsif v_block is not null then
    raise exception 'Refer & earn is for shops on a paid business plan.' using errcode = '42501';
  end if;
  -- A distributor keeps the code the shop already shares (24 Nov 2026).
  insert into app.referral_partners (tenant_id, code, joined_by_email, terms_version)
  values (p_tenant_id, app.shop_code(p_tenant_id), app.jwt_email(), s.terms_version)
  returning * into p;
  return jsonb_build_object('ok', true, 'code', p.code);
end $function$;

-- ── 3. Coins for bringing shops in

-- Every use of a shop's code for coins. kind: what the shop brought in is ('free' home shop, or
-- 'merchant' once it pays for a plan). tenant_id is null until a sign-up's shop is known.
create table app.coin_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null,
  code text not null,
  kind text not null check (kind in ('free', 'merchant')),
  tenant_id text,
  source text not null check (source in ('link', 'code')),
  status text not null default 'pending' check (status in ('pending', 'earned', 'void')),
  coins integer not null default 0 check (coins >= 0),
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  customer_email text,
  earned_at timestamptz,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coin_referrals_one_per_shop on app.coin_referrals (tenant_id) where tenant_id is not null and status <> 'void';
create index coin_referrals_referrer on app.coin_referrals (referrer_id, status);
create index coin_referrals_subscription on app.coin_referrals (stripe_subscription_id) where stripe_subscription_id is not null;
alter table app.coin_referrals enable row level security;
revoke all on table app.coin_referrals from public, anon, authenticated;

-- Whose wallet a shop's coins go to: its owner's Sellio login.
create or replace function app.shop_owner_user(p_tenant_id text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select u.id from public.tenants t
    join auth.users u on lower(u.email) = lower(btrim(t.owner_email))
   where t.id = p_tenant_id
   limit 1
$function$;

-- How many more times a shop's code can earn: a free home shop's code earns
-- referral_free_code_uses times; a business shop's code has no limit (null).
create or replace function app.coin_code_uses_left(p_referrer text)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not exists (select 1 from public.tenants t where t.id = p_referrer and t.seller_type = 'individual') then null
    when app.world_cfg_int('referral_free_code_uses', 1) <= 0 then null
    else greatest(0, app.world_cfg_int('referral_free_code_uses', 1)
                     - (select count(*)::integer from app.coin_referrals r where r.referrer_id = p_referrer and r.status = 'earned'))
  end
$function$;

-- Pays a referral up to the free-seller or business amount, once each. A free referral that
-- becomes a business is topped up to the business amount.
create or replace function app.coin_referral_pay(p_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r app.coin_referrals%rowtype;
  v_target integer;
  v_self text;
  v_left integer;
  v_add integer;
  v_user uuid;
begin
  select * into r from app.coin_referrals where id = p_id for update;
  if not found or r.status = 'void' then return; end if;
  if r.tenant_id is not null then
    v_self := app.referral_self_reason(r.referrer_id, r.tenant_id, null, null);
    if v_self is not null then
      update app.coin_referrals set status = 'void', void_reason = 'self-referral: ' || v_self, voided_at = now(), updated_at = now()
       where id = p_id;
      return;
    end if;
  end if;
  if r.status = 'pending' then
    v_left := app.coin_code_uses_left(r.referrer_id);
    if v_left is not null and v_left <= 0 then
      update app.coin_referrals set status = 'void', void_reason = 'code used up', voided_at = now(), updated_at = now()
       where id = p_id;
      return;
    end if;
  end if;
  v_target := case when p_kind = 'merchant' then app.world_cfg_int('referral_coins_merchant', 100)
                   else app.world_cfg_int('referral_coins_free', 50) end;
  v_add := greatest(0, v_target - r.coins);
  update app.coin_referrals
     set status = 'earned',
         kind = case when p_kind = 'merchant' then 'merchant' else r.kind end,
         coins = r.coins + v_add,
         earned_at = coalesce(r.earned_at, now()),
         updated_at = now()
   where id = p_id;
  if v_add > 0 then
    v_user := app.shop_owner_user(r.referrer_id);
    if v_user is not null then
      perform app.world_credit(v_user, v_add, 'referral', p_id::text || ':' || p_kind);
    end if;
    perform app.referral_notify(r.referrer_id, 'You earned ' || v_add || ' coins',
      case when p_kind = 'merchant' then 'A business you invited paid for its Sellio plan.'
           else 'A seller you invited opened their shop on Sellio.' end,
      jsonb_build_object('kind', 'coins', 'coins', v_add));
  end if;
end $function$;

-- A sign-up checkout with a shop's code (the webhook, through referral_note_checkout): the
-- business it brings in earns the code's owner coins once it pays. Safe to repeat.
create or replace function app.coin_referral_note_checkout(p_code text, p_typed boolean, p_session_id text, p_customer_id text,
                                                           p_subscription_id text, p_email text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_shop text;
  v_id uuid;
  v_self text;
  v_left integer;
  v_void text;
  v_sub text := nullif(btrim(coalesce(p_subscription_id, '')), '');
begin
  if p_code is null then return null; end if;
  v_shop := app.shop_code_owner(p_code);
  if v_shop is null then return null; end if;
  select x.id into v_id from app.coin_referrals x where x.stripe_session_id = p_session_id;
  if found then return v_id; end if;
  if v_sub is not null and exists (select 1 from app.coin_referrals x where x.stripe_subscription_id = v_sub and x.status <> 'void') then
    return null;
  end if;
  v_self := app.referral_self_reason(v_shop, null, p_email, p_phone);
  v_left := app.coin_code_uses_left(v_shop);
  v_void := case when v_self is not null then 'self-referral: ' || v_self
                 when v_left is not null and v_left <= 0 then 'code used up' end;
  insert into app.coin_referrals (referrer_id, code, kind, source, status, stripe_session_id, stripe_customer_id,
                                  stripe_subscription_id, customer_email, void_reason, voided_at)
  values (v_shop, p_code, 'merchant', case when p_typed then 'code' else 'link' end,
          case when v_void is null then 'pending' else 'void' end, p_session_id,
          nullif(btrim(coalesce(p_customer_id, '')), ''), v_sub, nullif(lower(btrim(coalesce(p_email, ''))), ''),
          v_void, case when v_void is not null then now() end)
  returning id into v_id;
  return v_id;
end $function$;

-- A free shop's first listing earns its referrer the free-seller coins. Never blocks the listing.
create or replace function app.coin_referral_on_listing()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if not coalesce(NEW.is_active, false) then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.is_active, false) then return NEW; end if;
  begin
    select r.id into v_id from app.coin_referrals r
     where r.tenant_id = NEW.tenant_id and r.status = 'pending' and r.kind = 'free';
    if v_id is not null then
      perform app.coin_referral_pay(v_id, 'free');
    end if;
  exception when others then
    raise warning 'Referral coins skipped for listing %: %', NEW.id, sqlerrm;
  end;
  return NEW;
end $function$;

create trigger products_coin_referral
  after insert or update of is_active on public.products
  for each row execute function app.coin_referral_on_listing();

-- A shop's payment of its plan (app.shop_payments, real money only) earns its referrer the
-- business coins, or tops a free referral up to them. Never blocks the payment's record.
create or replace function app.coin_referral_on_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r app.coin_referrals%rowtype;
  v_found boolean := false;
begin
  if NEW.tenant_id is null and NEW.stripe_subscription_id is null then return NEW; end if;
  begin
    if NEW.tenant_id is not null then
      select * into r from app.coin_referrals x where x.tenant_id = NEW.tenant_id and x.status <> 'void';
      v_found := found;
    end if;
    if not v_found and NEW.stripe_subscription_id is not null then
      select * into r from app.coin_referrals x
       where x.stripe_subscription_id = NEW.stripe_subscription_id and x.status <> 'void'
       order by x.created_at limit 1;
      v_found := found;
      if v_found and r.tenant_id is null and NEW.tenant_id is not null then
        update app.coin_referrals set tenant_id = NEW.tenant_id, updated_at = now() where id = r.id;
      end if;
    end if;
    if v_found and not (r.status = 'earned' and r.kind = 'merchant') then
      perform app.coin_referral_pay(r.id, 'merchant');
    end if;
  exception when others then
    raise warning 'Referral coins skipped for invoice %: %', NEW.stripe_invoice_id, sqlerrm;
  end;
  return NEW;
end $function$;

create trigger shop_payments_coin_referral
  after insert or update of tenant_id on app.shop_payments
  for each row execute function app.coin_referral_on_payment();

create or replace function public.referral_note_checkout(p_code text, p_session_id text, p_customer_id text, p_subscription_id text,
                                                         p_email text, p_phone text, p_trial boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p app.referral_partners%rowtype;
  r app.referrals%rowtype;
  v_self text;
  -- A link's code comes as ref_CODE, one typed at sign-up as reft_CODE (20 Nov 2026).
  v_ref text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_typed boolean := v_ref ~ '^REFT[A-HJ-NP-Z2-9]{6}$';
  v_code text := app.referral_normal_code(case when v_typed then right(v_ref, 6) else p_code end);
  v_coins uuid;
begin
  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'A checkout session id is needed.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  -- Coins for any shop's code, a distributor's or not (24 Nov 2026).
  v_coins := app.coin_referral_note_checkout(v_code, v_typed, p_session_id, p_customer_id, p_subscription_id, p_email, p_phone);
  select * into r from app.referrals where stripe_session_id = p_session_id;
  if found then
    return jsonb_build_object('ok', true, 'referralId', r.id, 'status', r.status, 'repeat', true, 'coinReferralId', v_coins);
  end if;
  select * into p from app.referral_partners where code = v_code and status = 'active';
  if not found or not exists (select 1 from public.tenants t where t.id = p.tenant_id) then
    if v_coins is not null then
      return jsonb_build_object('ok', true, 'coinsOnly', true, 'coinReferralId', v_coins);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'unknown code');
  end if;
  if p_subscription_id is not null and exists (select 1 from app.referrals x where x.stripe_subscription_id = p_subscription_id) then
    return jsonb_build_object('ok', false, 'reason', 'subscription has a referral already', 'coinReferralId', v_coins);
  end if;
  v_self := app.referral_self_reason(p.tenant_id, null, p_email, p_phone);
  insert into app.referrals (partner_id, source, status, stripe_session_id, stripe_customer_id, stripe_subscription_id,
                             customer_email, void_reason, voided_at)
  values (p.tenant_id, case when v_typed then 'code' else 'link' end, case when v_self is null then 'pending' else 'void' end, p_session_id,
          nullif(btrim(coalesce(p_customer_id, '')), ''), nullif(btrim(coalesce(p_subscription_id, '')), ''),
          nullif(lower(btrim(coalesce(p_email, ''))), ''),
          case when v_self is not null then 'self-referral: ' || v_self end,
          case when v_self is not null then now() end)
  returning * into r;
  if v_self is null then
    perform app.referral_notify(p.tenant_id, 'New sign-up with your code',
      case when coalesce(p_trial, true) then 'A shop started a 7-day free trial with your code.'
           else 'A shop signed up with your code.' end,
      jsonb_build_object('kind', 'signup'));
  end if;
  return jsonb_build_object('ok', true, 'referralId', r.id, 'status', r.status, 'reason', v_self, 'coinReferralId', v_coins);
end $function$;

-- A code typed by a shop's owner before its first payment (Plans): coins for any shop's code,
-- and the distributor's referral as before when it's a distributor's.
create or replace function public.referral_attach(p_tenant_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text := app.referral_normal_code(p_code);
  p app.referral_partners%rowtype;
  r app.referrals%rowtype;
  c app.coin_referrals%rowtype;
  v_partner boolean := false;
  v_shop text;
  v_left integer;
  v_id uuid;
  v_sub text;
  v_name text;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can do this.' using errcode = '42501';
  end if;
  perform app.referral_lock();
  select * into p from app.referral_partners where code = v_code and status = 'active';
  v_partner := found and exists (select 1 from public.tenants t where t.id = p.tenant_id and app.can_sell(t.id));
  v_shop := case when v_partner then p.tenant_id else app.shop_code_owner(v_code) end;
  if v_code is null or v_shop is null
     or not exists (select 1 from public.tenants t where t.id = v_shop and app.can_sell(t.id)) then
    raise exception 'That referral code isn''t valid.' using errcode = '22023';
  end if;
  if v_shop = p_tenant_id then
    raise exception 'That''s this shop''s own code.' using errcode = '22023';
  end if;
  if app.referral_self_reason(v_shop, p_tenant_id, null, null) is not null then
    raise exception 'That code belongs to someone at this shop, so it can''t be used here.' using errcode = '22023';
  end if;
  if exists (select 1 from app.shop_payments sp where sp.tenant_id = p_tenant_id)
     or exists (select 1 from public.subscriptions s where s.tenant_id = p_tenant_id and s.status = 'active') then
    raise exception 'A referral code can only be added before the shop''s first payment.' using errcode = '22023';
  end if;
  select s.stripe_subscription_id into v_sub from public.subscriptions s
   where s.tenant_id = p_tenant_id order by s.updated_date desc nulls last limit 1;

  -- Coins: one referral per shop. Like the distributor's, a typed code replaces one that hasn't
  -- earned yet (the sign-up link's is found through the shop's subscription); one that has earned stays.
  select * into c from app.coin_referrals x where x.tenant_id = p_tenant_id and x.status <> 'void';
  if c.id is null and v_sub is not null then
    select * into c from app.coin_referrals x
     where x.stripe_subscription_id = v_sub and x.tenant_id is null and x.status <> 'void'
     order by x.created_at limit 1;
    if c.id is not null then
      update app.coin_referrals set tenant_id = p_tenant_id, updated_at = now() where id = c.id;
    end if;
  end if;
  if c.id is null or (c.status = 'pending' and c.referrer_id <> v_shop) then
    v_left := app.coin_code_uses_left(v_shop);
    if v_left is not null and v_left <= 0 then
      raise exception 'This code has been used already.' using errcode = '22023';
    end if;
    if c.id is not null then
      update app.coin_referrals set status = 'void', void_reason = 'replaced by a typed code', voided_at = now(), updated_at = now()
       where id = c.id;
    end if;
    insert into app.coin_referrals (referrer_id, code, kind, tenant_id, source, stripe_subscription_id)
    values (v_shop, v_code, 'merchant', p_tenant_id, 'code', v_sub);
  end if;

  if v_partner then
    v_id := app.referral_for_shop(p_tenant_id);
    if v_id is not null then
      select * into r from app.referrals where id = v_id for update;
      if r.status <> 'pending' then
        raise exception 'This shop''s referral is settled already.' using errcode = '22023';
      end if;
      if r.partner_id <> p.tenant_id then
        update app.referrals
           set partner_id = p.tenant_id, source = 'code', tenant_id = p_tenant_id,
               stripe_subscription_id = coalesce(stripe_subscription_id,
                 case when v_sub is not null
                       and not exists (select 1 from app.referrals x where x.stripe_subscription_id = v_sub and x.id <> v_id)
                      then v_sub end),
               updated_at = now()
         where id = v_id;
        perform app.referral_notify(p.tenant_id, 'New sign-up with your code', 'A shop added your referral code.',
                                    jsonb_build_object('kind', 'signup'));
      elsif r.tenant_id is null then
        update app.referrals set tenant_id = p_tenant_id, updated_at = now() where id = v_id;
      end if;
    else
      insert into app.referrals (partner_id, tenant_id, source, stripe_subscription_id)
      values (p.tenant_id, p_tenant_id, 'code',
              case when v_sub is not null and not exists (select 1 from app.referrals x where x.stripe_subscription_id = v_sub)
                   then v_sub end);
      perform app.referral_notify(p.tenant_id, 'New sign-up with your code', 'A shop added your referral code.',
                                  jsonb_build_object('kind', 'signup'));
    end if;
  end if;
  select nullif(btrim(t.name), '') into v_name from public.tenants t where t.id = v_shop;
  return jsonb_build_object('ok', true, 'code', v_code, 'shopName', v_name);
end $function$;

-- Who a code belongs to, for its invite page and the "Have a referral code?" fields. Any shop's
-- code; a free seller's code that has been used is no longer found.
create or replace function public.referral_code_info(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_code text := app.referral_normal_code(p_code);
  p app.referral_partners%rowtype;
  t public.tenants%rowtype;
  v_shop text;
  v_left integer;
  v_name text;
  v_phone text;
begin
  if v_code is null then
    return jsonb_build_object('found', false);
  end if;
  select * into p from app.referral_partners where code = v_code and status = 'active';
  if found then
    v_shop := p.tenant_id;
  else
    v_shop := app.shop_code_owner(v_code);
    if v_shop is null then
      return jsonb_build_object('found', false);
    end if;
  end if;
  select * into t from public.tenants where id = v_shop;
  if not found or not app.can_sell(t.id) then
    return jsonb_build_object('found', false);
  end if;
  v_left := app.coin_code_uses_left(v_shop);
  if p.tenant_id is null and v_left is not null and v_left <= 0 then
    return jsonb_build_object('found', false);
  end if;
  select au.full_name, regexp_replace(coalesce(au.phone, ''), '\D', '', 'g') into v_name, v_phone
    from public.app_users au
   where lower(btrim(au.email)) = coalesce(p.joined_by_email, lower(btrim(t.owner_email)))
   order by au.updated_date desc nulls last limit 1;
  return jsonb_build_object(
    'found', true,
    'code', v_code,
    'shopName', nullif(btrim(t.name), ''),
    'logoUrl', t.logo_url,
    'firstName', nullif(split_part(btrim(coalesce(v_name, '')), ' ', 1), ''),
    'homeShop', coalesce(t.seller_type, 'merchant') = 'individual',
    -- An active distributor's code earns a commission; any other shop's code earns coins.
    'distributor', p.tenant_id is not null,
    'whatsapp', case when p.tenant_id is not null and p.show_whatsapp and length(v_phone) >= 8
                     then case when length(v_phone) = 8 then '65' || v_phone else v_phone end end);
end $function$;

-- A new free home shop's referral code (from the invite link, or typed when naming the shop).
create or replace function public.referral_attach_free(p_tenant_id text, p_code text, p_typed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text := app.referral_normal_code(p_code);
  v_email text := app.jwt_email();
  t public.tenants%rowtype;
  v_shop text;
  v_left integer;
  v_id uuid;
  v_name text;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can do this.' using errcode = '42501';
  end if;
  perform app.referral_lock();
  select * into t from public.tenants where id = p_tenant_id;
  v_shop := app.shop_code_owner(v_code);
  if v_code is null or v_shop is null
     or not exists (select 1 from public.tenants x where x.id = v_shop and app.can_sell(x.id)) then
    raise exception 'That referral code isn''t valid.' using errcode = '22023';
  end if;
  if v_shop = p_tenant_id then
    raise exception 'That''s this shop''s own code.' using errcode = '22023';
  end if;
  if app.referral_self_reason(v_shop, p_tenant_id, v_email, null) is not null then
    raise exception 'That code belongs to someone at this shop, so it can''t be used here.' using errcode = '22023';
  end if;
  -- New to Sellio: a free home shop opened in the last 7 days, and this person's only shop.
  if coalesce(t.seller_type, 'merchant') <> 'individual' or t.created_date < now() - interval '7 days'
     or exists (select 1 from public.tenant_users tu where lower(btrim(tu.user_email)) = v_email and tu.tenant_id <> p_tenant_id) then
    raise exception 'A referral code can only be added when a shop is new.' using errcode = '22023';
  end if;
  if exists (select 1 from app.coin_referrals x where x.tenant_id = p_tenant_id and x.status <> 'void') then
    raise exception 'This shop''s referral is settled already.' using errcode = '22023';
  end if;
  v_left := app.coin_code_uses_left(v_shop);
  if v_left is not null and v_left <= 0 then
    raise exception 'This code has been used already.' using errcode = '22023';
  end if;
  insert into app.coin_referrals (referrer_id, code, kind, tenant_id, source)
  values (v_shop, v_code, 'free', p_tenant_id, case when p_typed then 'code' else 'link' end)
  returning id into v_id;
  if exists (select 1 from public.products pr where pr.tenant_id = p_tenant_id and pr.is_active) then
    perform app.coin_referral_pay(v_id, 'free');
  end if;
  select nullif(btrim(x.name), '') into v_name from public.tenants x where x.id = v_shop;
  return jsonb_build_object('ok', true, 'code', v_code, 'shopName', v_name);
end $function$;

-- Refer & earn for any shop's owner: the shop's code (made on first visit), the coin rules,
-- and totals (never which shops: 10 Nov 2026).
create or replace function public.referral_overview(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t public.tenants%rowtype;
  v_code text;
  v_left integer;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can see this.' using errcode = '42501';
  end if;
  select * into t from public.tenants where id = p_tenant_id;
  v_code := app.shop_code(p_tenant_id);
  v_left := app.coin_code_uses_left(p_tenant_id);
  return jsonb_build_object(
    'code', v_code,
    'link', 'https://sellio.sg/r/' || v_code,
    'homeShop', coalesce(t.seller_type, 'merchant') = 'individual',
    'canShare', app.can_sell(p_tenant_id) and (v_left is null or v_left > 0) and app.shop_code_owner(v_code) is not null,
    'coins', jsonb_build_object('free', app.world_cfg_int('referral_coins_free', 50),
                                'merchant', app.world_cfg_int('referral_coins_merchant', 100)),
    'uses', case when v_left is null then null
                 else jsonb_build_object('limit', app.world_cfg_int('referral_free_code_uses', 1), 'left', v_left) end,
    'invited', (select jsonb_build_object(
                  'waiting', count(*) filter (where r.status = 'pending'),
                  'sellers', count(*) filter (where r.status = 'earned' and r.kind = 'free'),
                  'businesses', count(*) filter (where r.status = 'earned' and r.kind = 'merchant'),
                  'coins', coalesce(sum(r.coins) filter (where r.status = 'earned'), 0))
                  from app.coin_referrals r where r.referrer_id = p_tenant_id),
    'balance', coalesce((select w.balance from app.world_wallets w where w.user_id = auth.uid()), 0));
end $function$;

-- ── 3b. Sellio's admins can become distributors without a payment
-- Alvin, 25 Nov 2026: "Yes, I want the admins to be able to join without one." For one of Sellio's
-- admins (asking for their own shop), a business plan's free trial and no recorded payment don't
-- stop joining. Cafelicious's plan is on a 100% coupon, so its bills are S$0 and none is recorded.
-- Everyone else, and every other reason (a lapsed plan, a closed shop), is as before. Both joining
-- (referral_join) and the Refer page (referral_dashboard's canJoin and joinBlock) ask this.
create or replace function app.referral_join_block(p_tenant_id text) returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when t.id is null then 'no shop'
    when coalesce(t.seller_type, 'merchant') = 'individual' then 'home shop'
    when s.status = 'trial' and not app.is_sellio_admin() then 'trial'
    when coalesce(app.tenant_plan(t.id), 'lapsed') in ('lapsed', 'personal') then 'plan lapsed'
    when not app.can_sell(t.id) then 'shop closed'
    when not app.is_sellio_admin()
     and not exists (select 1 from app.shop_payments sp
                      where sp.tenant_id = t.id
                         or (s.stripe_subscription_id is not null and sp.stripe_subscription_id = s.stripe_subscription_id)) then 'no payment'
  end
  from (select p_tenant_id as id) x
  left join public.tenants t on t.id = x.id
  left join lateral (select s.status, s.stripe_subscription_id from public.subscriptions s
                      where s.tenant_id = t.id order by s.updated_date desc nulls last limit 1) s on true
$function$;

-- ── 4. Admin → Coins

create table app.coins_admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_email text,
  target text not null,
  old_value jsonb,
  new_value jsonb
);
alter table app.coins_admin_log enable row level security;
revoke all on table app.coins_admin_log from public, anon, authenticated;

create or replace function app.coins_require_admin()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not app.is_sellio_admin() then
    raise exception 'This is for Sellio''s admins.' using errcode = '42501';
  end if;
end $function$;

-- The coin rules Admin → Coins can change, and their limits.
create or replace function app.coins_setting_keys()
returns table (key text, min_value integer, max_value integer, default_value integer)
language sql
immutable
set search_path to ''
as $function$
  values ('drop_max_value', 1, 5, 2),
         ('daily_cap', 0, 1000, 30),
         ('referral_coins_free', 0, 100000, 50),
         ('referral_coins_merchant', 0, 100000, 100),
         ('referral_free_code_uses', 0, 1000, 1)
$function$;

create or replace function public.coins_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform app.coins_require_admin();
  return jsonb_build_object(
    'settings', (select jsonb_object_agg(k.key, app.world_cfg_int(k.key, k.default_value)) from app.coins_setting_keys() k),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'slot', c.slot, 'code', c.code, 'name', c.name, 'rarity', c.rarity, 'price', c.price,
                 'active', c.active, 'minStallLevel', c.min_stall_level, 'starter', c.rarity = 'starter',
                 'owners', (select count(*) from app.world_owned o where o.item_id = c.id)) order by c.slot, c.sort, c.price)
               from app.world_cosmetics c where c.slot <> 'awning'), '[]'::jsonb),
    'players', (select jsonb_build_object('wallets', count(*), 'coins', coalesce(sum(w.balance), 0)) from app.world_wallets w),
    'referrals', (select jsonb_build_object(
                    'waiting', count(*) filter (where r.status = 'pending'),
                    'sellers', count(*) filter (where r.status = 'earned' and r.kind = 'free'),
                    'businesses', count(*) filter (where r.status = 'earned' and r.kind = 'merchant'),
                    'coins', coalesce(sum(r.coins) filter (where r.status = 'earned'), 0))
                    from app.coin_referrals r));
end $function$;

-- Saves coin rules ({key: number}) and items ([{id, price?, active?}]); every change is logged.
create or replace function public.coins_admin_save(p_settings jsonb default '{}'::jsonb, p_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  k record;
  i jsonb;
  c app.world_cosmetics%rowtype;
  v_new jsonb;
  v_old jsonb;
  v_num numeric;
  v_price integer;
  v_active boolean;
  v_admin text := app.jwt_email();
begin
  perform app.coins_require_admin();
  p_settings := coalesce(p_settings, '{}'::jsonb);
  p_items := coalesce(p_items, '[]'::jsonb);
  if jsonb_typeof(p_settings) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Send the settings as an object and the items as a list.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_settings) x(key) where x.key not in (select s.key from app.coins_setting_keys() s)) then
    raise exception 'That setting can''t be changed here.' using errcode = '22023';
  end if;
  for k in select * from app.coins_setting_keys() loop
    v_new := p_settings -> k.key;
    continue when v_new is null;
    v_num := case when jsonb_typeof(v_new) = 'number' then (v_new #>> '{}')::numeric end;
    if v_num is null or v_num <> trunc(v_num) or v_num < k.min_value or v_num > k.max_value then
      raise exception '% must be a whole number from % to %.', k.key, k.min_value, k.max_value using errcode = '22023';
    end if;
    select w.value into v_old from app.world_config w where w.key = k.key;
    continue when v_old = to_jsonb(v_num::integer);
    insert into app.world_config (key, value) values (k.key, to_jsonb(v_num::integer))
    on conflict (key) do update set value = excluded.value;
    insert into app.coins_admin_log (admin_email, target, old_value, new_value)
    values (v_admin, 'setting:' || k.key, v_old, to_jsonb(v_num::integer));
  end loop;
  for i in select x.value from jsonb_array_elements(p_items) x loop
    select * into c from app.world_cosmetics where id = i ->> 'id' for update;
    if not found then
      raise exception 'That item doesn''t exist.' using errcode = '22023';
    end if;
    if c.slot = 'awning' then
      raise exception 'Awnings aren''t sold: every stall wears the same one.' using errcode = '22023';
    end if;
    v_price := c.price;
    v_active := c.active;
    if i ? 'price' then
      v_num := case when jsonb_typeof(i -> 'price') = 'number' then (i ->> 'price')::numeric end;
      if v_num is null or v_num <> trunc(v_num) or v_num < 0 or v_num > 100000 then
        raise exception 'A price must be a whole number of coins from 0 to 100000.' using errcode = '22023';
      end if;
      v_price := v_num::integer;
    end if;
    if i ? 'active' then
      if jsonb_typeof(i -> 'active') <> 'boolean' then
        raise exception 'On or off must be true or false.' using errcode = '22023';
      end if;
      v_active := (i ->> 'active')::boolean;
    end if;
    continue when v_price = c.price and v_active = c.active;
    if c.rarity = 'starter' then
      raise exception 'The starting look is free and always available.' using errcode = '22023';
    end if;
    update app.world_cosmetics set price = v_price, active = v_active where id = c.id;
    insert into app.coins_admin_log (admin_email, target, old_value, new_value)
    values (v_admin, 'item:' || c.id, jsonb_build_object('price', c.price, 'active', c.active),
            jsonb_build_object('price', v_price, 'active', v_active));
  end loop;
  return public.coins_admin_overview();
end $function$;

-- ── Grants

revoke all on function app.world_drop_max() from public, anon, authenticated;
revoke all on function app.world_play_today(uuid) from public, anon, authenticated;
revoke all on function app.world_play_left(uuid) from public, anon, authenticated;
revoke all on function app.shop_code(text) from public, anon, authenticated;
revoke all on function app.shop_code_owner(text) from public, anon, authenticated;
revoke all on function app.shop_owner_user(text) from public, anon, authenticated;
revoke all on function app.coin_code_uses_left(text) from public, anon, authenticated;
revoke all on function app.coin_referral_pay(uuid, text) from public, anon, authenticated;
revoke all on function app.coin_referral_note_checkout(text, boolean, text, text, text, text, text) from public, anon, authenticated;
revoke all on function app.coin_referral_on_listing() from public, anon, authenticated;
revoke all on function app.coin_referral_on_payment() from public, anon, authenticated;
revoke all on function app.coins_require_admin() from public, anon, authenticated;
revoke all on function app.coins_setting_keys() from public, anon, authenticated;

revoke all on function public.referral_overview(text) from public, anon, authenticated;
revoke all on function public.referral_attach_free(text, text, boolean) from public, anon, authenticated;
revoke all on function public.coins_admin_overview() from public, anon, authenticated;
revoke all on function public.coins_admin_save(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.referral_overview(text) to authenticated;
grant execute on function public.referral_attach_free(text, text, boolean) to authenticated;
grant execute on function public.coins_admin_overview() to authenticated;
grant execute on function public.coins_admin_save(jsonb, jsonb) to authenticated;
