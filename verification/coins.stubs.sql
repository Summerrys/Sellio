-- Local stand-ins for Sellio World's coin tables and functions, for verification/coins-referrals.test.mjs
-- (PGlite). Loaded after verification/referral-programme.stubs.sql and the referral migrations. The
-- tables, rules and functions are copied from production on 24 Nov 2026 (the World migrations were
-- applied from outside this repository); foreign keys to auth.users are left out. Not for Supabase.

create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function app.auth_identity_exists() returns boolean language sql stable security definer set search_path to '' as $$
  select auth.uid() is not null and exists (select 1 from auth.users where id = auth.uid())
$$;

alter table public.tenants add column industry text;
alter table public.tenant_users add column created_date timestamptz default now();
create table public.products (
  id text primary key default gen_random_uuid()::text, tenant_id text not null, name text not null default 'Item',
  is_active boolean default true);
create table public.orders (
  id text primary key default gen_random_uuid()::text, tenant_id text, payment_status text, is_deleted boolean default false,
  customer_id text, customer_phone text);
create table app.shop_selling (tenant_id text primary key, settings_saved boolean default true);

create table app.world_achievement_defs (code text not null primary key, name text not null, description text not null, reward integer not null check (reward >= 0), sort integer not null default 0);
create table app.world_achievements (user_id uuid not null, code text not null references app.world_achievement_defs(code), unlocked_at timestamp with time zone not null default now(), primary key (user_id, code));
create table app.world_config (key text not null primary key, value jsonb not null, note text);
create table app.world_cosmetics (
  id text not null primary key, slot text not null check (slot = any (array['awning', 'sign', 'lights', 'decor'])), code text not null,
  name text not null, rarity text not null default 'common' check (rarity = any (array['starter', 'common', 'rare', 'epic'])),
  price integer not null check (price >= 0), min_stall_level integer not null default 1 check (min_stall_level >= 1 and min_stall_level <= 10),
  sort integer not null default 0, active boolean not null default true,
  available_from timestamp with time zone, available_until timestamp with time zone,
  check (id = slot || ':' || code), unique (slot, code));
create table app.world_days (
  user_id uuid not null, day date not null, drops_seeded boolean not null default false, night_bonus boolean not null default false,
  missions jsonb not null default '[]'::jsonb, all_claimed boolean not null default false, visits integer not null default 0,
  last_claim_at timestamp with time zone, last_claim_x real, last_claim_z real, primary key (user_id, day));
create table app.world_drops (
  id uuid not null default gen_random_uuid() primary key, user_id uuid not null, day date not null, x real not null, z real not null,
  value smallint not null check (value >= 1 and value <= 5), night boolean not null default false, claimed_at timestamp with time zone);
create index world_drops_user_day on app.world_drops (user_id, day);
create table app.world_ledger (
  id bigint generated always as identity primary key, user_id uuid not null, delta integer not null check (delta <> 0),
  reason text not null, ref text not null, balance_after integer not null check (balance_after >= 0),
  created_at timestamp with time zone not null default now(), unique (user_id, reason, ref));
alter table app.world_ledger add constraint world_ledger_reason_check check (reason = any (array[
  'drop', 'visit', 'daily', 'mission', 'missions_all', 'achievement', 'milestone', 'purchase', 'cosmetic', 'admin']));
create index world_ledger_user_time on app.world_ledger (user_id, created_at desc);
create table app.world_milestones (tenant_id text not null, code text not null, reached_at timestamp with time zone not null default now(), primary key (tenant_id, code));
create table app.world_mission_defs (
  code text not null primary key, title text not null, metric text not null, target integer not null check (target > 0),
  reward integer not null check (reward > 0), weight integer not null default 1 check (weight > 0),
  sellers_only boolean not null default false, active boolean not null default true);
create table app.world_owned (tenant_id text not null, item_id text not null references app.world_cosmetics(id), coins_paid integer not null default 0 check (coins_paid >= 0), unlocked_by uuid, unlocked_at timestamp with time zone not null default now(), primary key (tenant_id, item_id));
create table app.world_stall_styles (tenant_id text not null primary key, awning text not null default 'sunset', sign text not null default 'wood', lights text not null default 'none', decor text not null default 'none', updated_at timestamp with time zone not null default now());
create table app.world_streaks (user_id uuid not null primary key, current integer not null default 0, best integer not null default 0, last_day date);
create table app.world_wallets (user_id uuid not null primary key, balance integer not null default 0 check (balance >= 0), lifetime_earned integer not null default 0 check (lifetime_earned >= 0), updated_at timestamp with time zone not null default now());

insert into app.world_config (key, value) values
  ('claim_max_speed', '7'), ('claim_min_interval_ms', '300'), ('claim_slack', '2'), ('drop_weights', '[36, 28, 18, 11, 7]'),
  ('drops_per_day', '15'), ('explorer_level_coins', '[0, 25, 60, 120, 200, 320, 480, 700, 1000, 1400]'), ('fnb_capacity', '24'),
  ('milestone_buyers_reward', '30'), ('milestone_buyers_step', '10'), ('milestone_first_order', '20'), ('missions_all_bonus', '10'),
  ('missions_per_day', '3'), ('night_bonus_drops', '5'), ('night_window', '{"end": "21:00", "start": "19:00"}'),
  ('stall_level_buyers', '[0, 3, 10, 25, 50]'), ('stall_order', '"shuffle_daily"'), ('streak_rewards', '[3, 4, 5, 6, 8, 10, 15]'),
  ('street_capacity', '48'), ('street_layout', '{"x": 3.2, "zmax": 15, "row_gap": 7, "min_rows": 6, "end_margin": 8, "first_row_z": 2}'),
  ('street_min_shops', '30'), ('street_public', 'true'), ('visit_max_per_day', '5'), ('visit_reward', '2');
insert into app.world_cosmetics (id, slot, code, name, rarity, price, min_stall_level, sort) values
  ('awning:sunset', 'awning', 'sunset', 'Sunset Stripes', 'starter', 0, 1, 0), ('awning:mint', 'awning', 'mint', 'Mint Stripes', 'common', 12, 1, 1),
  ('awning:scallop', 'awning', 'scallop', 'Rose Scallop', 'common', 20, 1, 2), ('awning:pagoda', 'awning', 'pagoda', 'Lantern Roof', 'rare', 35, 1, 3),
  ('awning:glow', 'awning', 'glow', 'Sellio Glow', 'epic', 50, 2, 4),
  ('decor:none', 'decor', 'none', 'No decor', 'starter', 0, 1, 0), ('decor:plants', 'decor', 'plants', 'Potted Plants', 'common', 8, 1, 1),
  ('decor:bunting', 'decor', 'bunting', 'Bunting Flags', 'common', 12, 1, 2), ('decor:balloons', 'decor', 'balloons', 'Balloons', 'rare', 18, 1, 3),
  ('lights:none', 'lights', 'none', 'No lights', 'starter', 0, 1, 0), ('lights:bulbs', 'lights', 'bulbs', 'Festoon Bulbs', 'common', 15, 1, 1),
  ('lights:fairy', 'lights', 'fairy', 'Fairy Lights', 'common', 20, 1, 2), ('lights:lanterns', 'lights', 'lanterns', 'Paper Lanterns', 'rare', 25, 1, 3),
  ('sign:wood', 'sign', 'wood', 'Timber Board', 'starter', 0, 1, 0), ('sign:chalk', 'sign', 'chalk', 'Chalkboard', 'common', 10, 1, 1),
  ('sign:neon', 'sign', 'neon', 'Neon Tube', 'rare', 30, 1, 2), ('sign:gold', 'sign', 'gold', 'Gold Leaf', 'epic', 45, 2, 3);
insert into app.world_mission_defs (code, title, metric, target, reward, sellers_only) values
  ('big_coin', 'Find a 5-coin', 'big_coin', 1, 6, false), ('collect_20', 'Collect 20 coins from the street', 'drop_value', 20, 6, false),
  ('new_shop', 'Visit a shop you haven''t visited before', 'new_shop', 1, 8, false), ('pick_6', 'Pick up 6 coins', 'drops', 6, 5, false),
  ('restyle', 'Change something on your stall', 'style', 1, 5, true), ('visit_2', 'Visit 2 storefronts', 'visits', 2, 6, false);
insert into app.world_achievement_defs (code, name, description, reward, sort) values
  ('first_steps', 'First steps', 'Pick up your first coin.', 5, 1), ('window_shopper', 'Window shopper', 'Visit a shop.', 5, 2),
  ('regular', 'Regular', 'Visit 10 shops.', 15, 3), ('collector', 'Collector', 'Collect 100 street coins.', 10, 4),
  ('night_owl', 'Night owl', 'Pick up a night-market coin.', 5, 5), ('streak_7', 'Week streak', 'Collect 7 days in a row.', 25, 6),
  ('stylist', 'Stylist', 'Unlock a stall item.', 10, 7), ('full_house', 'Full house', 'Unlock an item in every slot.', 20, 8);

create or replace function app.is_member(p_tenant_id text) returns boolean language sql stable security definer set search_path to '' as $function$
  select exists (select 1 from public.tenant_users tu where tu.tenant_id = p_tenant_id and lower(tu.user_email) = app.jwt_email() and tu.status = 'active')
$function$;
create or replace function app.require_shop_owner(p_tenant_id text) returns void language plpgsql stable security definer set search_path to '' as $function$
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.seller_type = 'individual') then
    raise exception 'These settings are for free shops.' using errcode = '22023', hint = 'not_a_shop';
  end if;
  if not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop owner can change these settings.' using errcode = '42501', hint = 'not_owner';
  end if;
end $function$;
create or replace function app.shop_today() returns date language sql stable set search_path to '' as $function$ select (now() at time zone 'Asia/Singapore')::date $function$;
create or replace function app.world_is_fnb_industry(p_industry text) returns boolean language sql immutable set search_path to '' as $function$
  select coalesce(lower(p_industry), '') ~ '(f.?b|cafe|restaurant|food|beverage|bar)'
$function$;
create or replace function app.world_is_fnb_merchant(p_tenant_id text) returns boolean language sql stable security definer set search_path to '' as $function$
  select exists (
    select 1 from public.tenants t
     where t.id = p_tenant_id and t.seller_type = 'merchant' and t.status = 'active'
       and app.world_is_fnb_industry(t.industry) and app.can_sell(t.id)
       and exists (select 1 from public.products p where p.tenant_id = t.id and p.is_active))
$function$;
create or replace function app.world_my_shop() returns text language sql stable security definer set search_path to '' as $function$
  select tu.tenant_id from public.tenant_users tu join public.tenants t on t.id = tu.tenant_id
   where lower(tu.user_email) = app.jwt_email() and tu.status = 'active' and coalesce(tu.is_owner, false) and t.seller_type = 'individual'
   order by tu.created_date nulls last limit 1
$function$;
create or replace function app.world_cfg(p_key text) returns jsonb language sql stable security definer set search_path to '' as $function$
  select c.value from app.world_config c where c.key = p_key
$function$;
create or replace function app.world_cfg_int(p_key text, p_default integer) returns integer language sql stable security definer set search_path to '' as $function$
  select coalesce((select (c.value)::integer from app.world_config c where c.key = p_key and jsonb_typeof(c.value) = 'number'), p_default)
$function$;
create or replace function app.world_require_open(p_shop text) returns void language plpgsql stable security definer set search_path to '' as $function$
begin
  if not coalesce((app.world_cfg('street_public'))::text = 'true', false) and p_shop is null then
    raise exception 'Pop-up Street opens soon. Coins start when it does.' using errcode = '42501', hint = 'street_closed';
  end if;
end $function$;
create or replace function app.world_require_user() returns uuid language plpgsql stable security definer set search_path to '' as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not app.auth_identity_exists() then
    raise exception 'Sign in to collect Sellio Coins.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  return v_user;
end $function$;
create or replace function app.world_stall_level(p_tenant_id text) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  v_steps jsonb := coalesce(app.world_cfg('stall_level_buyers'), '[0, 3, 10, 25, 50]'::jsonb);
  v_buyers integer; v_level integer := 1; v_next integer; i integer;
begin
  select count(distinct coalesce(o.customer_id::text, nullif(o.customer_phone, ''))) into v_buyers
    from public.orders o where o.tenant_id = p_tenant_id and o.payment_status = 'paid' and not coalesce(o.is_deleted, false);
  for i in 0 .. jsonb_array_length(v_steps) - 1 loop
    if v_buyers >= (v_steps ->> i)::integer then v_level := i + 1;
    elsif v_next is null then v_next := (v_steps ->> i)::integer;
    end if;
  end loop;
  return jsonb_build_object('level', v_level, 'buyers', v_buyers, 'next_at', v_next);
end $function$;
create or replace function app.world_street_layout() returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  l jsonb := coalesce(app.world_cfg('street_layout'), '{"x": 3.2, "zmax": 15, "first_row_z": 2, "row_gap": 7, "min_rows": 6, "end_margin": 8}'::jsonb);
  v_live integer; v_rows integer;
begin
  select count(*) into v_live from public.tenants t join app.shop_selling s on s.tenant_id = t.id and s.settings_saved
   where t.seller_type = 'individual' and t.status = 'active' and app.can_sell(t.id)
     and exists (select 1 from public.products p where p.tenant_id = t.id and p.is_active);
  v_rows := greatest((l ->> 'min_rows')::integer, ceil(least(v_live, app.world_cfg_int('street_capacity', 48)) / 2.0)::integer);
  return l || jsonb_build_object('rows', v_rows,
    'zmin', (l ->> 'first_row_z')::numeric - (v_rows - 1) * (l ->> 'row_gap')::numeric - (l ->> 'end_margin')::numeric, 'live', v_live);
end $function$;
create or replace function app.world_bump(p_user uuid, p_day date, p_metric text, p_amount integer) returns void language sql security definer set search_path to '' as $function$
  update app.world_days d
     set missions = (
       select coalesce(jsonb_agg(
                case when m ->> 'metric' = p_metric and not (m ->> 'claimed')::boolean
                     then jsonb_set(m, '{progress}', to_jsonb(least((m ->> 'target')::integer, (m ->> 'progress')::integer + p_amount)))
                     else m end order by e.ord), '[]'::jsonb)
         from jsonb_array_elements(d.missions) with ordinality as e(m, ord))
   where d.user_id = p_user and d.day = p_day and p_amount > 0
$function$;
create or replace function app.world_award(p_user uuid, p_code text) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_def app.world_achievement_defs;
begin
  select * into v_def from app.world_achievement_defs a where a.code = p_code;
  if not found then return null; end if;
  insert into app.world_achievements (user_id, code) values (p_user, p_code) on conflict do nothing;
  if not found then return null; end if;
  if v_def.reward > 0 then perform app.world_credit(p_user, v_def.reward, 'achievement', p_code); end if;
  return jsonb_build_object('code', v_def.code, 'name', v_def.name, 'reward', v_def.reward);
end $function$;
create or replace function app.world_day_state(p_user uuid, p_day date, p_is_seller boolean) returns app.world_days language plpgsql security definer set search_path to '' as $function$
declare v_row app.world_days;
begin
  select * into v_row from app.world_days d where d.user_id = p_user and d.day = p_day;
  if found then return v_row; end if;
  insert into app.world_days (user_id, day, missions)
  select p_user, p_day, coalesce(jsonb_agg(jsonb_build_object(
           'code', m.code, 'title', m.title, 'metric', m.metric, 'target', m.target,
           'reward', m.reward, 'progress', 0, 'claimed', false) order by m.k desc), '[]'::jsonb)
    from (
      select d.*, power(((('x' || substr(md5(p_user::text || p_day::text || d.code), 1, 8))::bit(32)::bigint + 1)::numeric
                         / 4294967297), 1.0 / d.weight) as k
        from app.world_mission_defs d
       where d.active and (not d.sellers_only or p_is_seller)
       order by k desc
       limit app.world_cfg_int('missions_per_day', 3)
    ) m
  on conflict (user_id, day) do nothing;
  select * into v_row from app.world_days d where d.user_id = p_user and d.day = p_day;
  return v_row;
end $function$;
create or replace function app.world_set_style(p_tenant_id text, p_slot text, p_code text) returns void language plpgsql security definer set search_path to '' as $function$
begin
  insert into app.world_stall_styles (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  execute format('update app.world_stall_styles set %I = $1, updated_at = now() where tenant_id = $2', p_slot) using p_code, p_tenant_id;
end $function$;

-- The production versions this repository's migration replaces (24 Nov 2026), as they were.
create or replace function app.world_credit(p_user uuid, p_delta integer, p_reason text, p_ref text) returns integer language plpgsql security definer set search_path to '' as $function$
declare v_balance integer;
begin
  if p_delta = 0 then return null; end if;
  insert into app.world_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance into v_balance from app.world_wallets w where w.user_id = p_user for update;
  if v_balance + p_delta < 0 then
    raise exception 'You need % more coins for this.', -(v_balance + p_delta) using errcode = 'P0001', hint = 'insufficient_coins';
  end if;
  begin
    insert into app.world_ledger (user_id, delta, reason, ref, balance_after) values (p_user, p_delta, p_reason, p_ref, v_balance + p_delta);
  exception when unique_violation then
    return null;
  end;
  update app.world_wallets w
     set balance = w.balance + p_delta,
         lifetime_earned = w.lifetime_earned + case when p_delta > 0 and p_reason not in ('purchase', 'admin', 'cosmetic') then p_delta else 0 end,
         updated_at = now()
   where w.user_id = p_user;
  return v_balance + p_delta;
end $function$;
create or replace function app.world_pick_value(p_roll double precision) returns smallint language plpgsql stable security definer set search_path to '' as $function$
declare
  v_weights jsonb := coalesce(app.world_cfg('drop_weights'), '[36, 28, 18, 11, 7]'::jsonb);
  v_total numeric := 0; v_acc numeric := 0; i integer;
begin
  for i in 0 .. least(jsonb_array_length(v_weights), 5) - 1 loop v_total := v_total + (v_weights ->> i)::numeric; end loop;
  for i in 0 .. least(jsonb_array_length(v_weights), 5) - 1 loop
    v_acc := v_acc + (v_weights ->> i)::numeric;
    if p_roll * v_total < v_acc then return (i + 1)::smallint; end if;
  end loop;
  return 1;
end $function$;
create or replace function app.world_seed_drops(p_user uuid, p_day date, p_count integer, p_night boolean) returns void language plpgsql security definer set search_path to '' as $function$
declare
  b jsonb := app.world_street_layout();
  v_x real := (b ->> 'x')::real; v_zmin real := (b ->> 'zmin')::real; v_zmax real := (b ->> 'zmax')::real;
begin
  if p_count <= 0 then return; end if;
  insert into app.world_drops (user_id, day, x, z, value, night)
  select p_user, p_day, round(((random() * 2 - 1) * v_x)::numeric, 2),
         round((v_zmin + (i + 0.15 + random() * 0.7) * (v_zmax - v_zmin) / p_count)::numeric, 2),
         case when p_night then least(5, app.world_pick_value(random()) + 1) else app.world_pick_value(random()) end, p_night
    from generate_series(0, p_count - 1) as i;
end $function$;
create or replace function app.world_profile(p_user uuid, p_day date, p_shop text) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  return jsonb_build_object('balance', coalesce((select w.balance from app.world_wallets w where w.user_id = p_user), 0),
    'drops', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'value', d.value)) from app.world_drops d
                        where d.user_id = p_user and d.day = p_day and d.claimed_at is null), '[]'::jsonb));
end $function$;
create or replace function public.world_claim_drop(p_drop_id uuid) returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  return jsonb_build_object('ok', false);
end $function$;
create or replace function public.world_claim_visit(p_tenant_id text) returns jsonb language plpgsql security definer set search_path to '' as $function$
begin
  return jsonb_build_object('ok', false);
end $function$;

create or replace function public.world_session() returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user uuid := app.world_require_user();
  v_day date := app.shop_today();
  v_shop text := app.world_my_shop();
  v_state app.world_days;
  v_night jsonb := coalesce(app.world_cfg('night_window'), '{"start": "19:00", "end": "21:00"}'::jsonb);
  v_now time := (now() at time zone 'Asia/Singapore')::time;
begin
  perform app.world_require_open(v_shop);
  perform pg_advisory_xact_lock(hashtextextended('sellio-world:' || v_user::text, 0));
  v_state := app.world_day_state(v_user, v_day, v_shop is not null);
  if not v_state.drops_seeded then
    perform app.world_seed_drops(v_user, v_day, app.world_cfg_int('drops_per_day', 15), false);
    update app.world_days d set drops_seeded = true where d.user_id = v_user and d.day = v_day;
  end if;
  if not v_state.night_bonus and v_now >= (v_night ->> 'start')::time and v_now < (v_night ->> 'end')::time then
    perform app.world_seed_drops(v_user, v_day, app.world_cfg_int('night_bonus_drops', 5), true);
    update app.world_days d set night_bonus = true where d.user_id = v_user and d.day = v_day;
  end if;
  return app.world_profile(v_user, v_day, v_shop);
end $function$;
