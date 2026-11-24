-- Sellio Coins (Alvin, 24 Nov 2026): referral coins go in the coin ledger, so its reasons allow
-- 'referral'. Applied on its own, before coins_and_referral_coins.
alter table app.world_ledger drop constraint world_ledger_reason_check;
alter table app.world_ledger add constraint world_ledger_reason_check check (reason = any (array[
  'drop', 'visit', 'daily', 'mission', 'missions_all', 'achievement', 'milestone', 'purchase', 'cosmetic', 'admin', 'referral']));
