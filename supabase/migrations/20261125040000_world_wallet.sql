-- Sellio Coins: the wallet (Alvin, 25 Nov 2026: "It should look like a wallet that belongs to the
-- users"). For the Wallet page, the Me tab's card and the World's wallet sheet: the signed-in
-- person's balance, what they have earned and spent, today's play against the day's limit, and
-- their coins in and out, newest first (p_limit, at most 100; p_before for older ones). Only ever
-- the caller's own wallet. A referral line says what kind of shop it was, never which one
-- (10 Nov 2026: totals only). Reads only.
create or replace function public.world_wallet(p_limit integer default 40, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_wallet app.world_wallets;
  v_since timestamptz := (app.shop_today()::timestamp at time zone 'Asia/Singapore');
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if v_user is null then
    raise exception 'Sign in to see your coins.' using errcode = '42501';
  end if;
  select * into v_wallet from app.world_wallets w where w.user_id = v_user;
  return jsonb_build_object(
    'balance', coalesce(v_wallet.balance, 0),
    'earned', coalesce(v_wallet.lifetime_earned, 0),
    'spent', coalesce((select -sum(l.delta) from app.world_ledger l
                        where l.user_id = v_user and l.delta < 0 and l.reason in ('cosmetic', 'purchase')), 0),
    'today', jsonb_build_object(
      'earned', app.world_play_today(v_user),
      'cap', case when app.world_cfg_int('daily_cap', 30) > 0 then app.world_cfg_int('daily_cap', 30) end,
      'left', app.world_play_left(v_user),
      'drops', coalesce((select sum(l.delta) from app.world_ledger l
                          where l.user_id = v_user and l.delta > 0 and l.reason = 'drop' and l.created_at >= v_since), 0),
      'visits', coalesce((select sum(l.delta) from app.world_ledger l
                           where l.user_id = v_user and l.delta > 0 and l.reason = 'visit' and l.created_at >= v_since), 0)),
    'dropMax', app.world_drop_max(),
    'visitReward', app.world_cfg_int('visit_reward', 2),
    'referralCoins', jsonb_build_object('free', app.world_cfg_int('referral_coins_free', 50),
                                        'merchant', app.world_cfg_int('referral_coins_merchant', 100)),
    'history', coalesce((
      select jsonb_agg(x.line order by x.at desc, x.id desc)
        from (select l.created_at as at, l.id,
                     jsonb_build_object(
                       'at', l.created_at, 'delta', l.delta, 'reason', l.reason,
                       -- a visit: the shop (ref is shop:day)
                       'shop', case when l.reason = 'visit' then
                                 (select nullif(btrim(t.name), '') from public.tenants t where t.id = split_part(l.ref, ':', 1)) end,
                       -- a stall item (ref is shop:item id)
                       'item', case when l.reason = 'cosmetic' then
                                 (select c.name from app.world_cosmetics c where c.id = substr(l.ref, length(split_part(l.ref, ':', 1)) + 2)) end,
                       -- a badge (ref is its code; @… marks one earned before a reset)
                       'badge', case when l.reason = 'achievement' then
                                  (select a.name from app.world_achievement_defs a where a.code = split_part(l.ref, '@', 1)) end,
                       -- a referral: free (a home seller) or merchant (a business)
                       'kind', case when l.reason = 'referral' then split_part(l.ref, ':', 2) end) as line
                from app.world_ledger l
               where l.user_id = v_user and (p_before is null or l.created_at < p_before)
               order by l.created_at desc, l.id desc
               limit v_limit) x), '[]'::jsonb));
end $function$;

revoke all on function public.world_wallet(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.world_wallet(integer, timestamptz) to authenticated;
