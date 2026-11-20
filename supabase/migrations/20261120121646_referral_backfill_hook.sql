-- The referral programme's backfill (20 Nov 2026). The referral-backfill edge function records
-- every paid Stripe invoice above S$0 in app.shop_payments through referral_record_payment (the
-- webhook's own code): the payments made before the webhook started recording them, and later to
-- reconcile. The database starts a run (app.referral_backfill_call, by hand) with this Vault
-- secret; the function checks it with public.referral_backfill_allowed.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sellio_referral_backfill') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sellio_referral_backfill',
      'Sent by app.referral_backfill_call to the referral-backfill edge function, which checks it with public.referral_backfill_allowed.');
  end if;
end $$;

-- For referral-backfill (service role): is this the secret?
create or replace function public.referral_backfill_allowed(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret ~ '^[0-9a-f]{64}$', false) and exists (
    select 1 from vault.decrypted_secrets s
     where s.name = 'sellio_referral_backfill' and s.decrypted_secret = p_secret)
$$;
revoke all on function public.referral_backfill_allowed(text) from public, anon, authenticated;
grant execute on function public.referral_backfill_allowed(text) to service_role;

-- Starts a run and returns its pg_net request id; the answer comes back in net._http_response.
-- p_body: {"dryRun": true} reads Stripe and records nothing; "limit" invoices a run (default 40,
-- at most 100); "startingAfter": go on from that invoice (a run's answer gives nextStartingAfter
-- when there are more). By hand only (postgres).
create or replace function app.referral_backfill_call(p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'sellio_referral_backfill';
  if v_secret is null then
    raise exception 'The referral backfill secret is missing from Vault.';
  end if;
  return net.http_post(
    url := 'https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/referral-backfill',
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sellio-backfill', v_secret),
    timeout_milliseconds := 150000);
end $$;
revoke all on function app.referral_backfill_call(jsonb) from public, anon, authenticated, service_role;
