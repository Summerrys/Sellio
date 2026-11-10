-- The referral programme, phase 1: the database (Alvin, 9 and 10 Nov 2026).
--
-- A merchant on a business plan (or its free trial) can join as a distributor and gets a random
-- code (like 4PWJDZ) and a link (sellio.sg/r/4PWJDZ). A shop that joins Sellio with it is
-- "brought in" by that distributor from its first real payment. The distributor earns 3% of each
-- monthly and 5% of each yearly subscription payment from those shops, for as long as they pay.
-- Once 10 of them on the same billing as the distributor's own plan have paid, the distributor gets
-- their own plan fee back, once: one month's fee if they pay monthly, the year's fee if yearly.
-- A distributor whose own shop joined with another distributor's code is that distributor's
-- friend: once the friend has 10 monthly (or 10 yearly) shops, the other distributor also gets 1%
-- (or 3%) of the payments from the friend's monthly (or yearly) shops that come after.
--
-- Earnings go into the distributor's Sellio wallet every second Friday, when a Sellio admin
-- credits the pay run, for payments up to the Sunday before. Nothing leaves Sellio yet: payouts
-- come with a payment gateway. Distributors see totals only: no shop names, plans or tiers, and not
-- which shops became distributors (Alvin, 10 Nov 2026).
--
-- Nothing here runs by itself yet. stripe-webhook starts calling referral_note_checkout,
-- referral_record_payment and referral_record_reversal in phase 2, and the app's screens come in
-- phase 3. Joining stays closed (referral_settings.joining_open) until a Sellio admin opens it.
--
-- Every table is in the app schema with row-level security on and no policies: the app reaches
-- them only through the functions below, which check who is asking. Money is numeric(12,2) in SGD,
-- rounded half up per payment (3% of S$39 is S$1.17, 5% of S$790 is S$39.50). Every change to the
-- money takes one lock (app.referral_lock), so two Stripe events can't count the same thing twice.

-- ---------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------

-- The programme's settings: one row.
create table if not exists app.referral_settings (
  id boolean primary key default true check (id),
  joining_open boolean not null default false,
  monthly_rate numeric(6,4) not null default 0.03 check (monthly_rate between 0 and 0.5),
  yearly_rate numeric(6,4) not null default 0.05 check (yearly_rate between 0 and 0.5),
  friend_monthly_rate numeric(6,4) not null default 0.01 check (friend_monthly_rate between 0 and 0.5),
  friend_yearly_rate numeric(6,4) not null default 0.03 check (friend_yearly_rate between 0 and 0.5),
  milestone_shops integer not null default 10 check (milestone_shops between 2 and 1000),
  terms_version text not null default '2026-11-draft',
  first_run_date date check (first_run_date is null or extract(isodow from first_run_date) = 5),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into app.referral_settings (id) values (true) on conflict (id) do nothing;
comment on table app.referral_settings is
  'The referral programme''s settings (one row): whether owners can join, the rates, the 10-shop milestone, the terms version distributors accept, and the first pay run (every 14 days from it, on Fridays).';

-- A distributor: a business shop whose owner joined. The code belongs to the shop.
create table if not exists app.referral_partners (
  tenant_id text primary key,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  joined_at timestamptz not null default now(),
  joined_by_email text not null,
  terms_version text not null,
  show_whatsapp boolean not null default false,
  monthly_milestone_at timestamptz,
  yearly_milestone_at timestamptz,
  fee_back_at timestamptz,
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by text
);
comment on table app.referral_partners is
  'Distributors, one per shop (tenant_id). Codes are 6 random characters from A-Z and 2-9 without I and O. The milestone times are when the shop''s 10th monthly / yearly shop first paid; fee_back_at is when its plan fee back was added. No foreign key to tenants: these rows are money records and stay if a shop is removed.';

-- A shop brought in (or a checkout still waiting for its shop).
create table if not exists app.referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references app.referral_partners (tenant_id),
  tenant_id text unique,
  source text not null check (source in ('link', 'code', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'counted', 'void')),
  hold boolean not null default false,
  hold_reason text,
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  customer_email text,
  counted_at timestamptz,
  counted_cycle text check (counted_cycle in ('monthly', 'yearly')),
  first_invoice_id text,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'counted' or (counted_at is not null and counted_cycle is not null)),
  check (tenant_id is null or tenant_id <> partner_id)
);
create unique index if not exists referrals_subscription_key on app.referrals (stripe_subscription_id)
  where stripe_subscription_id is not null;
create index if not exists referrals_partner_idx on app.referrals (partner_id, status);
comment on table app.referrals is
  'One shop brought in by a distributor (tenant_id), or a sign-up checkout that carried a code and is waiting for its shop (stripe_session_id / stripe_subscription_id). pending until the shop''s first real payment, then counted (in counted_cycle); void for self-referrals, a fully refunded first payment, or an admin''s decision. hold: counted but held for an admin''s review (same card as the distributor''s own plan); its earnings wait.';

-- Every paid invoice of every shop (from stripe-webhook, phase 2): finds a shop's first payment,
-- the distributor's own plan fee and the card it was paid with.
create table if not exists app.shop_payments (
  stripe_invoice_id text primary key,
  tenant_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  amount_paid numeric(12,2) not null check (amount_paid > 0),
  commission_base numeric(12,2) not null check (commission_base >= 0 and commission_base <= amount_paid),
  currency text not null,
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  card_fingerprint text,
  paid_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index if not exists shop_payments_tenant_idx on app.shop_payments (tenant_id, paid_at desc);
create index if not exists shop_payments_card_idx on app.shop_payments (card_fingerprint)
  where card_fingerprint is not null;
comment on table app.shop_payments is
  'Paid Stripe invoices (above S$0, SGD) of every shop. commission_base is the subscription part (no setup fee); card_fingerprint is Stripe''s fingerprint of the card, not the card number. Written by referral_record_payment only.';

-- A pay run that a Sellio admin credited to the wallets.
create table if not exists app.referral_pay_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique check (extract(isodow from run_date) = 5),
  cutoff_date date not null,
  partners integer not null default 0,
  total numeric(12,2) not null default 0,
  credited_at timestamptz not null default now(),
  credited_by text not null,
  check (cutoff_date = run_date - 5)
);
comment on table app.referral_pay_runs is
  'Credited pay runs. A run on Friday run_date takes the earnings from payments made up to the end of the Sunday before (cutoff_date, Singapore time) that aren''t credited yet.';

-- Every amount a distributor earns or loses: one line each, never edited except to mark it
-- credited (pay_run_id) or cancelled before it was credited (voided_at).
create table if not exists app.referral_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references app.referral_partners (tenant_id),
  kind text not null check (kind in ('commission', 'friend_bonus', 'fee_back', 'reversal', 'reinstatement')),
  referral_id uuid references app.referrals (id),
  source_tenant_id text,
  stripe_invoice_id text,
  stripe_ref text,
  reverses_line_id uuid references app.referral_ledger (id),
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  base_amount numeric(12,2),
  rate numeric(6,4),
  amount numeric(12,2) not null,
  currency text not null default 'SGD' check (currency = 'SGD'),
  earned_at timestamptz not null,
  eligible boolean not null default true,
  note text,
  voided_at timestamptz,
  pay_run_id uuid references app.referral_pay_runs (id),
  created_at timestamptz not null default now(),
  check ((kind = 'reversal' and amount <= 0) or (kind <> 'reversal' and amount >= 0)),
  check (kind not in ('reversal', 'reinstatement') or reverses_line_id is not null),
  check (voided_at is null or pay_run_id is null)
);
-- No double pay: one commission and one friend bonus per distributor per invoice (Stripe's
-- retries and its twin invoice events), one plan fee back per distributor, one take-back per
-- refund or dispute per line.
create unique index if not exists referral_ledger_payment_once on app.referral_ledger (partner_id, kind, stripe_invoice_id)
  where kind in ('commission', 'friend_bonus') and voided_at is null;
create unique index if not exists referral_ledger_fee_back_once on app.referral_ledger (partner_id)
  where kind = 'fee_back' and voided_at is null;
create unique index if not exists referral_ledger_reversal_once on app.referral_ledger (reverses_line_id, stripe_ref)
  where reverses_line_id is not null and voided_at is null;
create index if not exists referral_ledger_partner_idx on app.referral_ledger (partner_id, pay_run_id);
create index if not exists referral_ledger_referral_idx on app.referral_ledger (referral_id);
create index if not exists referral_ledger_invoice_idx on app.referral_ledger (stripe_invoice_id);
create index if not exists referral_ledger_pay_run_idx on app.referral_ledger (pay_run_id);
create index if not exists referral_ledger_reverses_idx on app.referral_ledger (reverses_line_id);
comment on table app.referral_ledger is
  'Distributor earnings, one line per amount: commission (3% / 5% of a payment), friend_bonus (1% / 3% of a friend''s shop''s payment), fee_back (the plan fee, once), reversal (taken back after a refund, dispute or void) and reinstatement (given back when Sellio wins a dispute). eligible false: recorded but not earned (the distributor''s own plan wasn''t active, or the distributor was paused). pay_run_id: credited to the wallet in that run.';

-- The Sellio wallet: what each distributor's shop has been credited, minus any corrections.
create table if not exists app.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references app.referral_partners (tenant_id),
  kind text not null check (kind in ('referral_credit', 'adjustment', 'withdrawal')),
  amount numeric(12,2) not null check (amount <> 0),
  currency text not null default 'SGD' check (currency = 'SGD'),
  pay_run_id uuid references app.referral_pay_runs (id),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null,
  unique (tenant_id, pay_run_id),
  check ((kind = 'referral_credit') = (pay_run_id is not null))
);
create index if not exists wallet_transactions_tenant_idx on app.wallet_transactions (tenant_id, created_at desc);
create index if not exists wallet_transactions_pay_run_idx on app.wallet_transactions (pay_run_id);
comment on table app.wallet_transactions is
  'The Sellio wallet of a distributor''s shop. Its balance is the sum of amount. referral_credit: a pay run; adjustment: a Sellio admin''s correction (with the reason in note); withdrawal: kept for when payouts launch, nothing writes it yet.';

-- What Sellio admins did, with their reasons.
create table if not exists app.referral_admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_email text not null,
  action text not null,
  partner_id text,
  referral_id uuid,
  reason text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists referral_admin_log_partner_idx on app.referral_admin_log (partner_id, at desc);
comment on table app.referral_admin_log is
  'Every referral action a Sellio admin takes (credit a pay run, release or void a held referral, assign a shop, pause or close a distributor, adjust a wallet, change settings), with who, when and why.';

alter table app.referral_settings enable row level security;
alter table app.referral_partners enable row level security;
alter table app.referrals enable row level security;
alter table app.shop_payments enable row level security;
alter table app.referral_pay_runs enable row level security;
alter table app.referral_ledger enable row level security;
alter table app.wallet_transactions enable row level security;
alter table app.referral_admin_log enable row level security;
revoke all on table app.referral_settings, app.referral_partners, app.referrals, app.shop_payments,
  app.referral_pay_runs, app.referral_ledger, app.wallet_transactions, app.referral_admin_log
  from public, anon, authenticated;
revoke all on sequence app.referral_admin_log_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Helpers (not callable from the app)
-- ---------------------------------------------------------------------------------------------

-- One lock for every change to referral money.
create or replace function app.referral_lock()
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('sellio-referral-programme'))
$$;

-- The Singapore date of a moment.
create or replace function app.referral_sgt_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Singapore')::date
$$;

-- A pay run takes payments made before this moment: the end of the Sunday before it, Singapore time.
create or replace function app.referral_cutoff_end(p_run_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_run_date - 4)::timestamp at time zone 'Asia/Singapore')
$$;

-- Is this date a pay run? (Every 14 days from the first one.)
create or replace function app.referral_is_run_date(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.first_run_date is not null and p_date >= s.first_run_date
                          and (p_date - s.first_run_date) % 14 = 0
                     from app.referral_settings s where s.id), false)
$$;

-- The first pay run on or after a date, and the last one on or before it (null until the first
-- pay run is set).
create or replace function app.referral_run_on_or_after(p_date date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.first_run_date is null or p_date is null then null
              when p_date <= s.first_run_date then s.first_run_date
              else s.first_run_date + 14 * ((p_date - s.first_run_date + 13) / 14) end
    from app.referral_settings s where s.id
$$;

create or replace function app.referral_run_on_or_before(p_date date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.first_run_date is null or p_date is null or p_date < s.first_run_date then null
              else s.first_run_date + 14 * ((p_date - s.first_run_date) / 14) end
    from app.referral_settings s where s.id
$$;

-- The next pay run that will credit wallets, from a date: a run that is due and not credited yet,
-- else the first one after it that isn't credited.
create or replace function app.referral_next_credit(p_from date)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last date;
  v date;
begin
  select max(pr.run_date) into v_last from app.referral_pay_runs pr;
  v := app.referral_run_on_or_before(p_from);
  if v is not null and (v_last is null or v > v_last) then
    return v;
  end if;
  v := app.referral_run_on_or_after(p_from);
  while v is not null and v_last is not null and v <= v_last loop
    v := v + 14;
  end loop;
  return v;
end $$;

-- The pay run that will credit an amount earned at a moment.
create or replace function app.referral_credit_date(p_earned_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app.referral_next_credit(greatest(app.referral_sgt_date(now()), app.referral_sgt_date(p_earned_at) + 5))
$$;

create or replace function app.referral_money(p_amount numeric)
returns text
language sql
stable
set search_path = ''
as $$
  select 'S$' || to_char(abs(coalesce(p_amount, 0)), 'FM999,999,990.00')
$$;

create or replace function app.referral_day(p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_date, 'Dy FMDD Mon')
$$;

-- Sellio admins: app.sellio_admin_emails() (app.alert_recipients and active super_admins).
create or replace function app.is_sellio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.jwt_email() is not null
     and exists (select 1 from app.sellio_admin_emails() a(email) where lower(btrim(a.email)) = app.jwt_email())
$$;

create or replace function app.referral_admin_guard(p_reason text default null, p_reason_needed boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_sellio_admin() then
    raise exception 'Only Sellio admins can do this.' using errcode = '42501';
  end if;
  if p_reason_needed and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Please give a reason.' using errcode = '22023';
  end if;
  return app.jwt_email();
end $$;

create or replace function app.referral_log(p_action text, p_partner_id text, p_referral_id uuid, p_reason text, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.referral_admin_log (admin_email, action, partner_id, referral_id, reason, details)
  values (coalesce(app.jwt_email(), 'system'), p_action, p_partner_id, p_referral_id,
          nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_details, '{}'::jsonb))
$$;

-- A code as typed: case, spaces and dashes don't matter, and "ref_4PWJDZ" (a checkout's
-- client_reference_id) gives 4PWJDZ. Null if it can't be a code.
create or replace function app.referral_normal_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.c ~ '^[A-HJ-NP-Z2-9]{6}$' then x.c
              when x.c ~ '^REF[A-HJ-NP-Z2-9]{6}$' then right(x.c, 6) end
    from (select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as c) x
$$;

-- A new random code: 6 of the 32 characters A-Z and 2-9 without I and O (a byte modulo 32 is
-- unbiased), not taken yet.
create or replace function app.referral_new_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
    if not exists (select 1 from app.referral_partners p where p.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Could not make a referral code. Please try again.';
end $$;

-- The owners of a shop (its owner email and active owners on its team), everyone on its team
-- (any role or status), and the owners' phone numbers (last 8 digits).
create or replace function app.referral_owner_emails(p_tenant_id text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct x.e from (
    select lower(btrim(t.owner_email)) as e from public.tenants t where t.id = p_tenant_id
    union all
    select lower(btrim(tu.user_email)) from public.tenant_users tu
     where tu.tenant_id = p_tenant_id and coalesce(tu.is_owner, false) and coalesce(tu.status, 'active') = 'active'
  ) x
  where x.e is not null and x.e <> ''
$$;

create or replace function app.referral_member_emails(p_tenant_id text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct x.e from (
    select lower(btrim(t.owner_email)) as e from public.tenants t where t.id = p_tenant_id
    union all
    select lower(btrim(tu.user_email)) from public.tenant_users tu where tu.tenant_id = p_tenant_id
  ) x
  where x.e is not null and x.e <> ''
$$;

create or replace function app.referral_owner_phones(p_tenant_id text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct right(x.d, 8) from (
    select regexp_replace(coalesce(au.phone, ''), '\D', '', 'g') as d
      from public.app_users au
     where lower(btrim(au.email)) in (select app.referral_owner_emails(p_tenant_id))
    union all
    select regexp_replace(coalesce(tu.user_phone, ''), '\D', '', 'g')
      from public.tenant_users tu
     where tu.tenant_id = p_tenant_id and coalesce(tu.is_owner, false) and coalesce(tu.status, 'active') = 'active'
  ) x
  where length(x.d) >= 8
$$;

-- Why a shop (or a checkout's email or phone, before its shop exists) can't count for a
-- distributor; null if it can. Own shop; its owner is on the distributor's team or is the
-- distributor; the distributor is on its team; the same owner phone.
create or replace function app.referral_self_reason(p_partner_id text, p_tenant_id text, p_email text, p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
begin
  if p_tenant_id is not null and p_tenant_id = p_partner_id then
    return 'own shop';
  end if;
  if exists (select 1 from app.referral_member_emails(p_partner_id) m(e)
              where m.e = v_email
                 or (p_tenant_id is not null and m.e in (select app.referral_owner_emails(p_tenant_id)))) then
    return 'same person or staff';
  end if;
  if p_tenant_id is not null and exists (
       select 1 from app.referral_owner_emails(p_partner_id) o(e)
        where o.e in (select app.referral_member_emails(p_tenant_id))) then
    return 'distributor works at the shop';
  end if;
  if exists (select 1 from app.referral_owner_phones(p_partner_id) a(ph)
              where (length(v_phone) = 8 and a.ph = v_phone)
                 or (p_tenant_id is not null and a.ph in (select app.referral_owner_phones(p_tenant_id)))) then
    return 'same phone';
  end if;
  return null;
end $$;

-- Why a distributor doesn't earn on a payment right now; null if they do. Their own plan must be a
-- business plan that is paid, in its free trial, or in the grace days after a failed payment.
create or replace function app.referral_not_earning(p_partner_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.tenant_id is null then 'not a distributor'
           when p.status <> 'active' then 'distributor ' || p.status
           when t.id is null then 'shop removed'
           when not app.can_sell(t.id) then 'shop closed'
           when coalesce(app.tenant_plan(t.id), 'lapsed') in ('lapsed', 'personal') then 'own plan not active'
         end
    from (select p_partner_id as id) x
    left join app.referral_partners p on p.tenant_id = x.id
    left join public.tenants t on t.id = p.tenant_id
$$;

-- An alert to a distributor's owners (it goes to their phones through notifications_push). No
-- tenant_id, so the shop's staff don't see it, and nothing in it names a shop or a plan.
create or replace function app.referral_notify(p_partner_id text, p_title text, p_message text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_email, type, title, message, data, link, priority)
  select o.e, 'referral', left(p_title, 200), left(p_message, 2000),
         coalesce(p_data, '{}'::jsonb) || jsonb_build_object('shop_id', p_partner_id), '/refer', 'normal'
    from app.referral_owner_emails(p_partner_id) o(e);
exception when others then
  raise warning 'referral alert not saved: %', sqlerrm;
end $$;

create or replace function app.referral_alert_admins(p_title text, p_message text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.alert_sellio_admins('referral_review', p_title, p_message, coalesce(p_data, '{}'::jsonb));
exception when others then
  raise warning 'referral admin alert not saved: %', sqlerrm;
end $$;

-- How many shops a distributor has brought in that have paid, on one billing (not held, not void).
create or replace function app.referral_shops_paid(p_partner_id text, p_cycle text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from app.referrals r
   where r.partner_id = p_partner_id and r.status = 'counted' and not r.hold and r.counted_cycle = p_cycle
$$;

-- The billing a distributor's own plan is on: its latest payment, else its subscription.
create or replace function app.referral_own_cycle(p_partner_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select sp.billing_cycle from app.shop_payments sp
      where sp.tenant_id = p_partner_id and sp.billing_cycle is not null
      order by sp.paid_at desc, sp.recorded_at desc limit 1),
    (select s.billing_cycle from public.subscriptions s
      where s.tenant_id = p_partner_id and s.billing_cycle in ('monthly', 'yearly')
      order by s.updated_date desc nulls last limit 1))
$$;

-- A shop's referral: by the shop, else a sign-up checkout's referral waiting for this shop's
-- subscription.
create or replace function app.referral_for_shop(p_tenant_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.id from app.referrals r where r.tenant_id = p_tenant_id),
    (select r.id from app.referrals r
       join public.subscriptions s on s.stripe_subscription_id = r.stripe_subscription_id
      where s.tenant_id = p_tenant_id and r.tenant_id is null
      order by r.created_at desc limit 1))
$$;

-- Earnings that the next pay runs will credit: earned before a moment, eligible, not voided, not
-- credited, and not from a referral on hold.
create or replace function app.referral_open_lines(p_before timestamptz)
returns setof app.referral_ledger
language sql
stable
security definer
set search_path = ''
as $$
  select l.* from app.referral_ledger l
   where l.pay_run_id is null and l.voided_at is null and l.eligible and l.earned_at < p_before
     and not exists (select 1 from app.referrals r where r.id = l.referral_id and r.hold)
$$;

-- Milestones and the plan fee back. A milestone is reached when the 10th shop on one billing has
-- paid. The plan fee back is added once, when the distributor's own billing (its latest payment)
-- has reached its milestone and the distributor may earn: the subscription part of that payment.
create or replace function app.referral_check_milestones(p_partner_id text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  p app.referral_partners%rowtype;
  v_own app.shop_payments%rowtype;
  v_date date;
begin
  select * into s from app.referral_settings where id;
  select * into p from app.referral_partners where tenant_id = p_partner_id for update;
  if not found then
    return;
  end if;
  if p.monthly_milestone_at is null and app.referral_shops_paid(p_partner_id, 'monthly') >= s.milestone_shops then
    update app.referral_partners set monthly_milestone_at = p_at where tenant_id = p_partner_id;
    p.monthly_milestone_at := p_at;
  end if;
  if p.yearly_milestone_at is null and app.referral_shops_paid(p_partner_id, 'yearly') >= s.milestone_shops then
    update app.referral_partners set yearly_milestone_at = p_at where tenant_id = p_partner_id;
    p.yearly_milestone_at := p_at;
  end if;

  if p.fee_back_at is not null or app.referral_not_earning(p_partner_id) is not null then
    return;
  end if;
  select * into v_own from app.shop_payments sp
   where sp.tenant_id = p_partner_id and sp.billing_cycle is not null
   order by sp.paid_at desc, sp.recorded_at desc limit 1;
  if not found or v_own.commission_base <= 0
     or (v_own.billing_cycle = 'monthly' and p.monthly_milestone_at is null)
     or (v_own.billing_cycle = 'yearly' and p.yearly_milestone_at is null) then
    return;
  end if;
  insert into app.referral_ledger (partner_id, kind, stripe_invoice_id, billing_cycle, base_amount, rate, amount, earned_at, note)
  values (p_partner_id, 'fee_back', v_own.stripe_invoice_id, v_own.billing_cycle, v_own.commission_base, 1,
          v_own.commission_base, p_at, 'plan fee back')
  on conflict do nothing;
  if not found then
    return;
  end if;
  update app.referral_partners set fee_back_at = p_at where tenant_id = p_partner_id;
  v_date := app.referral_credit_date(p_at);
  perform app.referral_notify(p_partner_id, 'Your plan fee is coming back',
    app.referral_money(v_own.commission_base) || ', '
      || case v_own.billing_cycle when 'yearly' then 'one year' else 'one month' end || ' of your plan, '
      || case when v_date is null then 'will be added to your wallet with your next credit.'
              else 'will be added to your wallet on ' || app.referral_day(v_date) || '.' end,
    jsonb_build_object('kind', 'fee_back'));
end $$;

-- After a shop of a distributor's is counted: the "one more shop" alert on the distributor's own
-- billing, then the milestones.
create or replace function app.referral_after_count(p_partner_id text, p_cycle text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  p app.referral_partners%rowtype;
  v_n integer;
  v_amount numeric(12,2);
begin
  select * into s from app.referral_settings where id;
  select * into p from app.referral_partners where tenant_id = p_partner_id;
  if not found then
    return;
  end if;
  v_n := app.referral_shops_paid(p_partner_id, p_cycle);
  if p.fee_back_at is null and v_n = s.milestone_shops - 1 and app.referral_own_cycle(p_partner_id) = p_cycle then
    select sp.commission_base into v_amount from app.shop_payments sp
     where sp.tenant_id = p_partner_id and sp.billing_cycle = p_cycle
     order by sp.paid_at desc, sp.recorded_at desc limit 1;
    perform app.referral_notify(p_partner_id, v_n || ' of ' || s.milestone_shops,
      'One more paying ' || p_cycle || ' shop and '
        || coalesce(app.referral_money(v_amount) || ' of your plan fee',
                    case p_cycle when 'yearly' then 'a year' else 'a month' end || ' of your plan fee')
        || ' comes back to your wallet.',
      jsonb_build_object('kind', 'milestone_near'));
  end if;
  perform app.referral_check_milestones(p_partner_id, p_at);
end $$;

-- One paid invoice for a referral: counts the shop at its first real payment (unless it is the
-- distributor's own, or held for the same card), writes the commission, the friend bonus and the
-- milestones. Safe to run again for the same invoice. The caller holds app.referral_lock().
create or replace function app.referral_apply_payment(p_referral_id uuid, p_invoice_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  r app.referrals%rowtype;
  pay app.shop_payments%rowtype;
  v_line app.referral_ledger%rowtype;
  v_self text;
  v_why text;
  v_rate numeric(6,4);
  v_recruiter text;
  v_milestone timestamptz;
  v_counted boolean := false;
  v_partner_name text;
  v_shop_name text;
begin
  select * into s from app.referral_settings where id;
  select * into r from app.referrals where id = p_referral_id for update;
  if not found then
    return jsonb_build_object('referral', 'not found');
  end if;
  select * into pay from app.shop_payments where stripe_invoice_id = p_invoice_id;
  if not found or pay.billing_cycle is null then
    return jsonb_build_object('referral', r.status, 'skipped', 'no payment');
  end if;
  if r.status = 'void' then
    return jsonb_build_object('referral', 'void');
  end if;

  if r.status = 'pending' then
    if r.source <> 'admin' then
      v_self := app.referral_self_reason(r.partner_id, r.tenant_id, r.customer_email, null);
      if v_self is not null then
        update app.referrals
           set status = 'void', void_reason = 'self-referral: ' || v_self, voided_at = now(), updated_at = now()
         where id = r.id;
        return jsonb_build_object('referral', 'void', 'reason', v_self);
      end if;
      if pay.card_fingerprint is not null and exists (
           select 1 from app.shop_payments o
            where o.tenant_id = r.partner_id and o.card_fingerprint = pay.card_fingerprint) then
        r.hold := true;
        r.hold_reason := 'same card as the distributor''s own plan';
      end if;
    end if;
    r.status := 'counted';
    r.counted_at := pay.paid_at;
    r.counted_cycle := pay.billing_cycle;
    r.first_invoice_id := pay.stripe_invoice_id;
    update app.referrals
       set status = r.status, counted_at = r.counted_at, counted_cycle = r.counted_cycle,
           first_invoice_id = r.first_invoice_id, hold = r.hold, hold_reason = r.hold_reason, updated_at = now()
     where id = r.id;
    v_counted := true;
    if r.hold then
      select nullif(btrim(t.name), '') into v_partner_name from public.tenants t where t.id = r.partner_id;
      select nullif(btrim(t.name), '') into v_shop_name from public.tenants t where t.id = r.tenant_id;
      perform app.referral_alert_admins('A referral to check',
        coalesce(v_shop_name, 'A shop') || '''s first payment (' || app.referral_money(pay.amount_paid) || ' '
          || pay.billing_cycle || ') used the same card as ' || coalesce(v_partner_name, 'its distributor')
          || '''s own plan. Release it or void it in Sellio admin, Review.',
        jsonb_build_object('referral_id', r.id, 'partner_id', r.partner_id, 'shop_id', r.tenant_id));
    end if;
  end if;

  -- The distributor's commission.
  v_rate := case pay.billing_cycle when 'yearly' then s.yearly_rate else s.monthly_rate end;
  v_why := app.referral_not_earning(r.partner_id);
  insert into app.referral_ledger (partner_id, kind, referral_id, source_tenant_id, stripe_invoice_id, billing_cycle,
                                   base_amount, rate, amount, earned_at, eligible, note)
  values (r.partner_id, 'commission', r.id, r.tenant_id, pay.stripe_invoice_id, pay.billing_cycle,
          pay.commission_base, v_rate, round(pay.commission_base * v_rate, 2), pay.paid_at, v_why is null, v_why)
  on conflict do nothing;
  select * into v_line from app.referral_ledger l
   where l.partner_id = r.partner_id and l.kind = 'commission'
     and l.stripe_invoice_id = pay.stripe_invoice_id and l.voided_at is null;

  -- The friend bonus, for whoever brought in this distributor's own shop: on payments made after
  -- the distributor's 10th shop on that billing paid, while the distributor earns on them.
  select fr.partner_id into v_recruiter from app.referrals fr
   where fr.tenant_id = r.partner_id and fr.status = 'counted' and not fr.hold;
  if v_recruiter is not null and v_recruiter <> r.partner_id and coalesce(v_line.eligible, false) then
    select case pay.billing_cycle when 'yearly' then p.yearly_milestone_at else p.monthly_milestone_at end
      into v_milestone
      from app.referral_partners p where p.tenant_id = r.partner_id;
    if v_milestone is not null and pay.paid_at > v_milestone then
      v_rate := case pay.billing_cycle when 'yearly' then s.friend_yearly_rate else s.friend_monthly_rate end;
      v_why := app.referral_not_earning(v_recruiter);
      insert into app.referral_ledger (partner_id, kind, referral_id, source_tenant_id, stripe_invoice_id, billing_cycle,
                                       base_amount, rate, amount, earned_at, eligible, note)
      values (v_recruiter, 'friend_bonus', r.id, r.tenant_id, pay.stripe_invoice_id, pay.billing_cycle,
              pay.commission_base, v_rate, round(pay.commission_base * v_rate, 2), pay.paid_at, v_why is null, v_why)
      on conflict do nothing;
    end if;
  end if;

  if v_counted and not r.hold then
    perform app.referral_after_count(r.partner_id, pay.billing_cycle, pay.paid_at);
  end if;
  return jsonb_build_object('referral', r.status, 'hold', r.hold, 'counted', v_counted,
                            'commission', v_line.amount, 'eligible', v_line.eligible);
end $$;

-- Void a referral: its earnings not credited yet are cancelled, and what was credited is taken
-- back in the next pay run. The caller holds app.referral_lock().
create or replace function app.referral_void(p_referral_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l app.referral_ledger%rowtype;
  v_net numeric(12,2);
begin
  update app.referrals
     set status = 'void', hold = false, void_reason = p_reason, voided_at = now(), updated_at = now()
   where id = p_referral_id;
  for l in
    select * from app.referral_ledger x
     where x.referral_id = p_referral_id and x.kind in ('commission', 'friend_bonus') and x.voided_at is null
  loop
    select coalesce(sum(y.amount), 0) into v_net from app.referral_ledger y
     where (y.id = l.id or y.reverses_line_id = l.id) and y.voided_at is null and y.pay_run_id is not null;
    update app.referral_ledger y set voided_at = now()
     where (y.id = l.id or y.reverses_line_id = l.id) and y.voided_at is null and y.pay_run_id is null;
    if v_net <> 0 then
      insert into app.referral_ledger (partner_id, kind, referral_id, source_tenant_id, stripe_invoice_id, stripe_ref,
                                       reverses_line_id, billing_cycle, base_amount, rate, amount, earned_at, eligible, note)
      values (l.partner_id, case when v_net > 0 then 'reversal' else 'reinstatement' end, l.referral_id, l.source_tenant_id,
              l.stripe_invoice_id, 'void:' || p_referral_id, l.id, l.billing_cycle, l.base_amount, l.rate, -v_net, now(),
              l.eligible, 'referral voided');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. For shop owners and the invite page
-- ---------------------------------------------------------------------------------------------

-- The invite page (sellio.sg/r/CODE, signed out): the distributor's shop, first name and logo, and
-- their WhatsApp number if they chose to show it. Nothing for a code that isn't active.
create or replace function public.referral_code_info(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := app.referral_normal_code(p_code);
  p app.referral_partners%rowtype;
  t public.tenants%rowtype;
  v_name text;
  v_phone text;
begin
  if v_code is null then
    return jsonb_build_object('found', false);
  end if;
  select * into p from app.referral_partners where code = v_code and status = 'active';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select * into t from public.tenants where id = p.tenant_id;
  if not found or not app.can_sell(t.id) then
    return jsonb_build_object('found', false);
  end if;
  select au.full_name, regexp_replace(coalesce(au.phone, ''), '\D', '', 'g') into v_name, v_phone
    from public.app_users au
   where lower(btrim(au.email)) = p.joined_by_email
   order by au.updated_date desc nulls last limit 1;
  return jsonb_build_object(
    'found', true,
    'code', p.code,
    'shopName', nullif(btrim(t.name), ''),
    'logoUrl', t.logo_url,
    'firstName', nullif(split_part(btrim(coalesce(v_name, '')), ' ', 1), ''),
    'whatsapp', case when p.show_whatsapp and length(v_phone) >= 8
                     then case when length(v_phone) = 8 then '65' || v_phone else v_phone end end);
end $$;

-- Join (first visit to Refer & earn): one tap gets the shop its code and records the terms the
-- owner accepted. Owners of business shops on a paid plan or its trial; again returns the code.
create or replace function public.referral_join(p_tenant_id text, p_terms_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  t public.tenants%rowtype;
  p app.referral_partners%rowtype;
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
  if coalesce(t.seller_type, 'merchant') = 'individual' or not app.can_sell(p_tenant_id)
     or coalesce(app.tenant_plan(p_tenant_id), 'lapsed') in ('lapsed', 'personal') then
    raise exception 'Refer & earn is for shops on a business plan or its free trial.' using errcode = '42501';
  end if;
  insert into app.referral_partners (tenant_id, code, joined_by_email, terms_version)
  values (p_tenant_id, app.referral_new_code(), app.jwt_email(), s.terms_version)
  returning * into p;
  return jsonb_build_object('ok', true, 'code', p.code);
end $$;

-- The Refer & earn dashboard (owners only): totals only, nothing about any shop.
create or replace function public.referral_dashboard(p_tenant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  t public.tenants%rowtype;
  p app.referral_partners%rowtype;
  v_cycle text;
  v_own_amount numeric(12,2);
  v_fee app.referral_ledger%rowtype;
  v_next date;
  v_why text;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can see this.' using errcode = '42501';
  end if;
  select * into s from app.referral_settings where id;
  select * into t from public.tenants where id = p_tenant_id;
  select * into p from app.referral_partners where tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object(
      'joined', false,
      'joiningOpen', s.joining_open,
      'termsVersion', s.terms_version,
      'canJoin', coalesce(t.seller_type, 'merchant') <> 'individual' and app.can_sell(p_tenant_id)
                 and coalesce(app.tenant_plan(p_tenant_id), 'lapsed') not in ('lapsed', 'personal'),
      'rates', jsonb_build_object('monthly', s.monthly_rate, 'yearly', s.yearly_rate, 'friendMonthly', s.friend_monthly_rate,
                                  'friendYearly', s.friend_yearly_rate, 'milestoneShops', s.milestone_shops));
  end if;
  v_why := app.referral_not_earning(p_tenant_id);
  v_cycle := app.referral_own_cycle(p_tenant_id);
  select sp.commission_base into v_own_amount from app.shop_payments sp
   where sp.tenant_id = p_tenant_id and sp.billing_cycle = v_cycle
   order by sp.paid_at desc, sp.recorded_at desc limit 1;
  select * into v_fee from app.referral_ledger l
   where l.partner_id = p_tenant_id and l.kind = 'fee_back' and l.voided_at is null;
  v_next := app.referral_next_credit(app.referral_sgt_date(now()));
  return jsonb_build_object(
    'joined', true,
    'code', p.code,
    'link', 'https://sellio.sg/r/' || p.code,
    'status', p.status,
    'showWhatsapp', p.show_whatsapp,
    'joinedAt', p.joined_at,
    'earning', v_why is null,
    'notEarningReason', v_why,
    'wallet', (select coalesce(sum(w.amount), 0) from app.wallet_transactions w where w.tenant_id = p_tenant_id),
    'pending', (select coalesce(sum(o.amount), 0) from app.referral_open_lines('infinity') o where o.partner_id = p_tenant_id),
    'earnedInAll', (select coalesce(sum(l.amount), 0) from app.referral_ledger l
                     where l.partner_id = p_tenant_id and l.eligible and l.voided_at is null
                       and not exists (select 1 from app.referrals r where r.id = l.referral_id and r.hold)),
    'nextCredit', v_next,
    'nextCutoff', v_next - 5,
    'credits', (select coalesce(jsonb_agg(jsonb_build_object('at', x.created_at, 'amount', x.amount, 'kind', x.kind,
                                                             'upTo', x.cutoff_date) order by x.created_at desc), '[]'::jsonb)
                  from (select w.created_at, w.amount, w.kind, pr.cutoff_date
                          from app.wallet_transactions w
                          left join app.referral_pay_runs pr on pr.id = w.pay_run_id
                         where w.tenant_id = p_tenant_id
                         order by w.created_at desc limit 10) x),
    'feeBack', jsonb_build_object(
      'cycle', v_cycle,
      'shopsPaid', case when v_cycle is null then 0 else app.referral_shops_paid(p_tenant_id, v_cycle) end,
      'target', s.milestone_shops,
      'amount', v_own_amount,
      'receivedAt', v_fee.earned_at,
      'receivedAmount', v_fee.amount),
    'rates', jsonb_build_object('monthly', s.monthly_rate, 'yearly', s.yearly_rate, 'friendMonthly', s.friend_monthly_rate,
                                'friendYearly', s.friend_yearly_rate, 'milestoneShops', s.milestone_shops));
end $$;

-- An owner types a code (the plan window, or a home shop moving to a business plan): until the
-- shop's first payment. A code typed by hand replaces a link's code that hasn't counted yet.
create or replace function public.referral_attach(p_tenant_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := app.referral_normal_code(p_code);
  p app.referral_partners%rowtype;
  r app.referrals%rowtype;
  v_id uuid;
  v_sub text;
  v_name text;
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can do this.' using errcode = '42501';
  end if;
  perform app.referral_lock();
  select * into p from app.referral_partners where code = v_code and status = 'active';
  if v_code is null or not found
     or not exists (select 1 from public.tenants t where t.id = p.tenant_id and app.can_sell(t.id)) then
    raise exception 'That referral code isn''t valid.' using errcode = '22023';
  end if;
  if p.tenant_id = p_tenant_id then
    raise exception 'That''s this shop''s own code.' using errcode = '22023';
  end if;
  if app.referral_self_reason(p.tenant_id, p_tenant_id, null, null) is not null then
    raise exception 'That code belongs to someone at this shop, so it can''t be used here.' using errcode = '22023';
  end if;
  if exists (select 1 from app.shop_payments sp where sp.tenant_id = p_tenant_id)
     or exists (select 1 from public.subscriptions s where s.tenant_id = p_tenant_id and s.status = 'active') then
    raise exception 'A referral code can only be added before the shop''s first payment.' using errcode = '22023';
  end if;
  select s.stripe_subscription_id into v_sub from public.subscriptions s
   where s.tenant_id = p_tenant_id order by s.updated_date desc nulls last limit 1;
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
  select nullif(btrim(t.name), '') into v_name from public.tenants t where t.id = p.tenant_id;
  return jsonb_build_object('ok', true, 'code', p.code, 'shopName', v_name);
end $$;

-- The distributor's choice to show a WhatsApp button on their invite page.
create or replace function public.referral_set_whatsapp(p_tenant_id text, p_show boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tenant_id is null or not app.is_owner(p_tenant_id) then
    raise exception 'Only the shop''s owner can do this.' using errcode = '42501';
  end if;
  update app.referral_partners set show_whatsapp = coalesce(p_show, false) where tenant_id = p_tenant_id;
  if not found then
    raise exception 'This shop hasn''t joined Refer & earn.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'showWhatsapp', coalesce(p_show, false));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. For stripe-webhook (service role only; phase 2)
-- ---------------------------------------------------------------------------------------------

-- A sign-up checkout whose client_reference_id was ref_CODE: a referral waiting for its shop.
-- The shop is found at its first paid invoice through the subscription. Same session again: no
-- change. An unknown or inactive code: nothing recorded (ok false). The checkout's own email or
-- phone belonging to the distributor's team: recorded as void.
create or replace function public.referral_note_checkout(p_code text, p_session_id text, p_customer_id text,
                                                         p_subscription_id text, p_email text, p_phone text,
                                                         p_trial boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app.referral_partners%rowtype;
  r app.referrals%rowtype;
  v_self text;
begin
  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'A checkout session id is needed.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  select * into r from app.referrals where stripe_session_id = p_session_id;
  if found then
    return jsonb_build_object('ok', true, 'referralId', r.id, 'status', r.status, 'repeat', true);
  end if;
  select * into p from app.referral_partners where code = app.referral_normal_code(p_code) and status = 'active';
  if not found or not exists (select 1 from public.tenants t where t.id = p.tenant_id) then
    return jsonb_build_object('ok', false, 'reason', 'unknown code');
  end if;
  if p_subscription_id is not null and exists (select 1 from app.referrals x where x.stripe_subscription_id = p_subscription_id) then
    return jsonb_build_object('ok', false, 'reason', 'subscription has a referral already');
  end if;
  v_self := app.referral_self_reason(p.tenant_id, null, p_email, p_phone);
  insert into app.referrals (partner_id, source, status, stripe_session_id, stripe_customer_id, stripe_subscription_id,
                             customer_email, void_reason, voided_at)
  values (p.tenant_id, 'link', case when v_self is null then 'pending' else 'void' end, p_session_id,
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
  return jsonb_build_object('ok', true, 'referralId', r.id, 'status', r.status, 'reason', v_self);
end $$;

-- A paid invoice of any shop (Stripe invoice.paid, above S$0). Records it in shop_payments, then
-- earns on it if the shop was brought in by a distributor, and checks the plan fee back if the
-- shop is itself a distributor. Amounts in cents: the whole invoice, and its subscription part
-- (the commission base: no setup fee). Safe to call again for the same invoice.
create or replace function public.referral_record_payment(p_invoice_id text, p_tenant_id text, p_subscription_id text,
                                                          p_customer_id text, p_amount_paid_minor bigint, p_base_minor bigint,
                                                          p_currency text, p_billing_cycle text, p_paid_at timestamptz,
                                                          p_card_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r app.referrals%rowtype;
  v_id uuid;
  v_out jsonb := '{}'::jsonb;
  v_tenant text := nullif(btrim(coalesce(p_tenant_id, '')), '');
  v_sub text := nullif(btrim(coalesce(p_subscription_id, '')), '');
begin
  if coalesce(btrim(p_invoice_id), '') = '' or p_paid_at is null then
    raise exception 'An invoice id and its payment time are needed.' using errcode = '22023';
  end if;
  if coalesce(p_amount_paid_minor, 0) <= 0 then
    return jsonb_build_object('ok', true, 'skipped', 'nothing paid');
  end if;
  if upper(coalesce(p_currency, '')) <> 'SGD' then
    return jsonb_build_object('ok', true, 'skipped', 'not SGD');
  end if;
  if p_billing_cycle is null or p_billing_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', true, 'skipped', 'billing cycle unknown');
  end if;
  perform app.referral_lock();
  insert into app.shop_payments as sp (stripe_invoice_id, tenant_id, stripe_subscription_id, stripe_customer_id, amount_paid,
                                       commission_base, currency, billing_cycle, card_fingerprint, paid_at)
  values (btrim(p_invoice_id), v_tenant, v_sub, nullif(btrim(coalesce(p_customer_id, '')), ''),
          round(p_amount_paid_minor / 100.0, 2),
          round(greatest(0, least(coalesce(p_base_minor, p_amount_paid_minor), p_amount_paid_minor)) / 100.0, 2),
          'SGD', p_billing_cycle, nullif(btrim(coalesce(p_card_fingerprint, '')), ''), p_paid_at)
  on conflict (stripe_invoice_id) do update
     set tenant_id = coalesce(sp.tenant_id, excluded.tenant_id),
         stripe_subscription_id = coalesce(sp.stripe_subscription_id, excluded.stripe_subscription_id),
         stripe_customer_id = coalesce(sp.stripe_customer_id, excluded.stripe_customer_id),
         card_fingerprint = coalesce(sp.card_fingerprint, excluded.card_fingerprint);

  if v_tenant is not null then
    v_id := app.referral_for_shop(v_tenant);
  end if;
  if v_id is null and v_sub is not null then
    select x.id into v_id from app.referrals x
     where x.stripe_subscription_id = v_sub and (x.tenant_id is null or x.tenant_id = v_tenant);
  end if;
  if v_id is not null then
    select * into r from app.referrals where id = v_id for update;
    if r.tenant_id is null and v_tenant is not null then
      if v_tenant = r.partner_id then
        update app.referrals
           set status = 'void', void_reason = 'self-referral: own shop', voided_at = now(), updated_at = now()
         where id = v_id and status <> 'void';
      else
        update app.referrals set tenant_id = v_tenant, updated_at = now() where id = v_id;
      end if;
    end if;
    if r.stripe_subscription_id is null and v_sub is not null
       and not exists (select 1 from app.referrals x where x.stripe_subscription_id = v_sub) then
      update app.referrals set stripe_subscription_id = v_sub, updated_at = now() where id = v_id;
    end if;
    v_out := app.referral_apply_payment(v_id, btrim(p_invoice_id));
  end if;

  if v_tenant is not null and exists (select 1 from app.referral_partners x where x.tenant_id = v_tenant) then
    perform app.referral_check_milestones(v_tenant, p_paid_at);
  end if;
  return jsonb_build_object('ok', true) || v_out;
end $$;

-- A refund or dispute on a paid invoice (charge.refunded, charge.dispute.created), or a dispute
-- Sellio won (charge.dispute.closed). p_ref is the refund or dispute id; p_amount_minor the amount
-- refunded or disputed, in cents. The earnings on that invoice are taken back in proportion to the
-- whole invoice (in full for a whole-invoice dispute), and given back when Sellio wins. A shop
-- whose only payment, its first, is refunded in full doesn't count any more. Safe to call again.
create or replace function public.referral_record_reversal(p_invoice_id text, p_ref text, p_kind text,
                                                           p_amount_minor bigint, p_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay app.shop_payments%rowtype;
  l app.referral_ledger%rowtype;
  v_share numeric;
  v_left numeric(12,2);
  v_take numeric(12,2);
  v_n integer := 0;
  v_voided integer := 0;
begin
  if coalesce(btrim(p_invoice_id), '') = '' or coalesce(btrim(p_ref), '') = '' then
    raise exception 'An invoice id and a refund or dispute id are needed.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('refund', 'dispute', 'dispute_won') then
    raise exception 'Kind must be refund, dispute or dispute_won.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  select * into pay from app.shop_payments where stripe_invoice_id = btrim(p_invoice_id);
  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  if p_kind in ('refund', 'dispute') then
    if coalesce(p_amount_minor, 0) <= 0 then
      return jsonb_build_object('ok', true, 'found', true, 'skipped', 'no amount');
    end if;
    v_share := least(1, (p_amount_minor / 100.0) / pay.amount_paid);
    for l in
      select * from app.referral_ledger x
       where x.stripe_invoice_id = pay.stripe_invoice_id and x.kind in ('commission', 'friend_bonus') and x.voided_at is null
       order by x.created_at
    loop
      select l.amount + coalesce(sum(y.amount), 0) into v_left from app.referral_ledger y
       where y.reverses_line_id = l.id and y.voided_at is null;
      v_take := least(round(l.amount * v_share, 2), v_left);
      if v_take > 0 then
        insert into app.referral_ledger (partner_id, kind, referral_id, source_tenant_id, stripe_invoice_id, stripe_ref,
                                         reverses_line_id, billing_cycle, base_amount, rate, amount, earned_at, eligible, note)
        values (l.partner_id, 'reversal', l.referral_id, l.source_tenant_id, l.stripe_invoice_id, btrim(p_ref), l.id,
                l.billing_cycle, l.base_amount, l.rate, -v_take, coalesce(p_at, now()), l.eligible, p_kind)
        on conflict do nothing;
        if found then
          v_n := v_n + 1;
        end if;
      end if;
    end loop;
    if p_kind = 'refund' then
      update app.referrals r
         set status = 'void', void_reason = 'first payment refunded', voided_at = now(), updated_at = now()
       where r.first_invoice_id = pay.stripe_invoice_id and r.status = 'counted'
         and not exists (select 1 from app.referral_ledger c
                          where c.referral_id = r.id and c.kind = 'commission' and c.voided_at is null
                            and c.stripe_invoice_id <> pay.stripe_invoice_id)
         and exists (select 1 from app.referral_ledger c
                      where c.referral_id = r.id and c.kind = 'commission' and c.voided_at is null
                        and c.stripe_invoice_id = pay.stripe_invoice_id)
         and not exists (select 1 from app.referral_ledger c
                          where c.referral_id = r.id and c.kind = 'commission' and c.voided_at is null
                            and c.stripe_invoice_id = pay.stripe_invoice_id
                            and c.amount + coalesce((select sum(y.amount) from app.referral_ledger y
                                                      where y.reverses_line_id = c.id and y.voided_at is null), 0) > 0);
      get diagnostics v_voided = row_count;
    end if;
  else
    for l in
      select * from app.referral_ledger x
       where x.stripe_invoice_id = pay.stripe_invoice_id and x.kind = 'reversal' and x.stripe_ref = btrim(p_ref)
         and x.voided_at is null
    loop
      insert into app.referral_ledger (partner_id, kind, referral_id, source_tenant_id, stripe_invoice_id, stripe_ref,
                                       reverses_line_id, billing_cycle, base_amount, rate, amount, earned_at, eligible, note)
      values (l.partner_id, 'reinstatement', l.referral_id, l.source_tenant_id, l.stripe_invoice_id, btrim(p_ref) || ':won',
              l.reverses_line_id, l.billing_cycle, l.base_amount, l.rate, -l.amount, coalesce(p_at, now()), l.eligible,
              'dispute won')
      on conflict do nothing;
      if found then
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'found', true, 'lines', v_n, 'referralsVoided', v_voided);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. For Sellio admins (the admin area: pay runs, review, distributors, wallets)
-- ---------------------------------------------------------------------------------------------

-- Shows the admin area's entry (the server checks again in every function below).
create or replace function public.am_i_sellio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_sellio_admin()
$$;

create or replace function public.referral_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s app.referral_settings%rowtype;
  v_today date := app.referral_sgt_date(now());
begin
  perform app.referral_admin_guard();
  select * into s from app.referral_settings where id;
  return jsonb_build_object(
    'today', v_today,
    'settings', jsonb_build_object(
      'joiningOpen', s.joining_open, 'firstRunDate', s.first_run_date, 'termsVersion', s.terms_version,
      'monthlyRate', s.monthly_rate, 'yearlyRate', s.yearly_rate, 'friendMonthlyRate', s.friend_monthly_rate,
      'friendYearlyRate', s.friend_yearly_rate, 'milestoneShops', s.milestone_shops,
      'updatedAt', s.updated_at, 'updatedBy', s.updated_by),
    'nextRun', app.referral_next_credit(v_today),
    'lastRun', (select jsonb_build_object('runDate', pr.run_date, 'cutoffDate', pr.cutoff_date, 'total', pr.total,
                                          'wallets', pr.partners, 'creditedAt', pr.credited_at, 'creditedBy', pr.credited_by)
                  from app.referral_pay_runs pr order by pr.run_date desc limit 1),
    'toReview', (select count(*) from app.referrals r where r.status = 'counted' and r.hold),
    'distributors', (select count(*) from app.referral_partners),
    'activeDistributors', (select count(*) from app.referral_partners p where p.status = 'active'));
end $$;

-- A pay run: what it will credit (or did), per distributor. With no date: the run that is due, or
-- the next one.
create or replace function public.referral_admin_run(p_run_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := app.referral_sgt_date(now());
  v_date date := coalesce(p_run_date, app.referral_next_credit(app.referral_sgt_date(now())));
  v_run app.referral_pay_runs%rowtype;
  v_end timestamptz;
  v_rows jsonb;
  v_last date;
begin
  perform app.referral_admin_guard();
  if v_date is null then
    return jsonb_build_object('scheduled', false);
  end if;
  if not app.referral_is_run_date(v_date) then
    raise exception 'That date isn''t a pay run.' using errcode = '22023';
  end if;
  v_end := app.referral_cutoff_end(v_date);
  select * into v_run from app.referral_pay_runs pr where pr.run_date = v_date;
  select max(pr.run_date) into v_last from app.referral_pay_runs pr;

  with lines as (
    select l.* from app.referral_ledger l where v_run.id is not null and l.pay_run_id = v_run.id
    union all
    select o.* from app.referral_open_lines(v_end) o where v_run.id is null
  ),
  per as (
    select l.partner_id,
           count(*) filter (where l.kind in ('commission', 'friend_bonus')) as payments,
           coalesce(sum(l.amount) filter (where l.kind = 'commission'), 0) as commission,
           coalesce(sum(l.amount) filter (where l.kind = 'friend_bonus'), 0) as friend_bonus,
           coalesce(sum(l.amount) filter (where l.kind = 'fee_back'), 0) as fee_back,
           coalesce(sum(l.amount) filter (where l.kind in ('reversal', 'reinstatement')), 0) as refunds,
           sum(l.amount) as total
      from lines l group by l.partner_id
  ),
  held as (
    select l.partner_id, sum(l.amount) as amount, count(distinct l.referral_id) as referrals
      from app.referral_ledger l
      join app.referrals r on r.id = l.referral_id and r.hold
     where v_run.id is null and l.pay_run_id is null and l.voided_at is null and l.eligible and l.earned_at < v_end
     group by l.partner_id
  ),
  merged as (
    select coalesce(per.partner_id, held.partner_id) as partner_id, per.payments, per.commission, per.friend_bonus,
           per.fee_back, per.refunds, per.total, held.amount as held, held.referrals as held_referrals
      from per full join held on held.partner_id = per.partner_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'partnerId', x.partner_id,
           'shopName', nullif(btrim(t.name), ''),
           'ownerName', (select nullif(btrim(au.full_name), '') from public.app_users au
                          where lower(btrim(au.email)) = p.joined_by_email order by au.updated_date desc nulls last limit 1),
           'code', p.code,
           'status', p.status,
           'payments', coalesce(x.payments, 0),
           'commission', coalesce(x.commission, 0),
           'friendBonus', coalesce(x.friend_bonus, 0),
           'feeBack', coalesce(x.fee_back, 0),
           'refunds', coalesce(x.refunds, 0),
           'total', coalesce(x.total, 0),
           'held', coalesce(x.held, 0),
           'heldReferrals', coalesce(x.held_referrals, 0),
           'credits', case when v_run.id is not null then coalesce(x.total, 0) <> 0
                           else p.status = 'active' and coalesce(x.total, 0) <> 0 end)
         order by t.name nulls last, x.partner_id), '[]'::jsonb)
    into v_rows
    from merged x
    join app.referral_partners p on p.tenant_id = x.partner_id
    left join public.tenants t on t.id = x.partner_id;

  return jsonb_build_object(
    'scheduled', true,
    'runDate', v_date,
    'cutoffDate', v_date - 5,
    'due', v_date <= v_today,
    'canCredit', v_run.id is null and v_date <= v_today and (v_last is null or v_date > v_last),
    'credited', v_run.id is not null,
    'creditedAt', v_run.credited_at,
    'creditedBy', v_run.credited_by,
    'rows', v_rows,
    'toCredit', (select coalesce(sum((r ->> 'total')::numeric), 0) from jsonb_array_elements(v_rows) r
                  where (r ->> 'credits')::boolean),
    'wallets', (select count(*) from jsonb_array_elements(v_rows) r where (r ->> 'credits')::boolean),
    'held', (select coalesce(sum((r ->> 'held')::numeric), 0) from jsonb_array_elements(v_rows) r),
    'heldReferrals', (select count(distinct l.referral_id)
                        from app.referral_ledger l
                        join app.referrals r on r.id = l.referral_id and r.hold
                       where v_run.id is null and l.pay_run_id is null and l.voided_at is null and l.eligible
                         and l.earned_at < v_end),
    'refunds', (select coalesce(sum((r ->> 'refunds')::numeric), 0) from jsonb_array_elements(v_rows) r));
end $$;

-- Credit a pay run to the wallets: on the run's Friday or after, once, in date order. The total
-- the admin saw must still be the total (else nothing is credited). Distributors who are paused
-- or closed wait. Each distributor gets an alert with their total.
create or replace function public.referral_admin_credit(p_run_date date, p_expected_total numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text;
  v_today date := app.referral_sgt_date(now());
  v_end timestamptz;
  v_last date;
  v_total numeric(12,2);
  v_run app.referral_pay_runs%rowtype;
  w record;
  v_wallets integer := 0;
begin
  v_admin := app.referral_admin_guard();
  perform app.referral_lock();
  if p_run_date is null or not app.referral_is_run_date(p_run_date) then
    raise exception 'That date isn''t a pay run.' using errcode = '22023';
  end if;
  if p_run_date > v_today then
    raise exception 'This pay run is on %. It can be credited from that day.', app.referral_day(p_run_date) using errcode = '22023';
  end if;
  select max(pr.run_date) into v_last from app.referral_pay_runs pr;
  if v_last is not null and p_run_date <= v_last then
    raise exception 'That pay run (or a later one) is credited already.' using errcode = '22023';
  end if;
  v_end := app.referral_cutoff_end(p_run_date);
  select coalesce(sum(o.amount), 0) into v_total
    from app.referral_open_lines(v_end) o
    join app.referral_partners p on p.tenant_id = o.partner_id and p.status = 'active';
  if p_expected_total is null or round(p_expected_total, 2) <> v_total then
    raise exception 'The pay run has changed since you opened it: it now credits %. Check it again.',
      app.referral_money(v_total) using errcode = '22023';
  end if;

  insert into app.referral_pay_runs (run_date, cutoff_date, credited_by)
  values (p_run_date, p_run_date - 5, v_admin)
  returning * into v_run;
  update app.referral_ledger l set pay_run_id = v_run.id
   where l.id in (select o.id from app.referral_open_lines(v_end) o
                    join app.referral_partners p on p.tenant_id = o.partner_id and p.status = 'active');
  for w in
    select l.partner_id, sum(l.amount) as amount from app.referral_ledger l
     where l.pay_run_id = v_run.id group by l.partner_id order by l.partner_id
  loop
    if w.amount <> 0 then
      insert into app.wallet_transactions (tenant_id, kind, amount, pay_run_id, created_by)
      values (w.partner_id, 'referral_credit', w.amount, v_run.id, v_admin);
      v_wallets := v_wallets + 1;
      if w.amount > 0 then
        perform app.referral_notify(w.partner_id, app.referral_money(w.amount) || ' added to your wallet',
          'Your earnings from payments up to ' || app.referral_day(p_run_date - 5) || '.',
          jsonb_build_object('kind', 'credit', 'run_date', p_run_date));
      else
        perform app.referral_notify(w.partner_id, 'Wallet correction: -' || app.referral_money(w.amount),
          'A payment you earned from was refunded or disputed (payments up to ' || app.referral_day(p_run_date - 5) || ').',
          jsonb_build_object('kind', 'credit', 'run_date', p_run_date));
      end if;
    end if;
  end loop;
  update app.referral_pay_runs set partners = v_wallets, total = v_total where id = v_run.id;
  perform app.referral_log('credit_run', null, null, null,
    jsonb_build_object('runDate', p_run_date, 'total', v_total, 'wallets', v_wallets));
  return jsonb_build_object('ok', true, 'runDate', p_run_date, 'cutoffDate', p_run_date - 5,
                            'wallets', v_wallets, 'total', v_total);
end $$;

-- Every distributor, with totals.
create or replace function public.referral_admin_partners()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.referral_admin_guard();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'partnerId', p.tenant_id,
             'shopName', nullif(btrim(t.name), ''),
             'shopSlug', t.slug,
             'ownerName', (select nullif(btrim(au.full_name), '') from public.app_users au
                            where lower(btrim(au.email)) = p.joined_by_email order by au.updated_date desc nulls last limit 1),
             'ownerEmail', p.joined_by_email,
             'code', p.code,
             'status', p.status,
             'joinedAt', p.joined_at,
             'recruitedBy', (select jsonb_build_object('partnerId', fr.partner_id, 'shopName', nullif(btrim(rt.name), ''))
                               from app.referrals fr left join public.tenants rt on rt.id = fr.partner_id
                              where fr.tenant_id = p.tenant_id and fr.status = 'counted' and not fr.hold),
             'shopsPaidMonthly', app.referral_shops_paid(p.tenant_id, 'monthly'),
             'shopsPaidYearly', app.referral_shops_paid(p.tenant_id, 'yearly'),
             'shopsJoined', (select count(*) from app.referrals r where r.partner_id = p.tenant_id and r.status <> 'void'),
             'onHold', (select count(*) from app.referrals r where r.partner_id = p.tenant_id and r.status = 'counted' and r.hold),
             'wallet', (select coalesce(sum(w.amount), 0) from app.wallet_transactions w where w.tenant_id = p.tenant_id),
             'pending', (select coalesce(sum(o.amount), 0) from app.referral_open_lines('infinity') o where o.partner_id = p.tenant_id),
             'earnedInAll', (select coalesce(sum(l.amount), 0) from app.referral_ledger l
                              where l.partner_id = p.tenant_id and l.eligible and l.voided_at is null
                                and not exists (select 1 from app.referrals r where r.id = l.referral_id and r.hold)),
             'feeBackAt', p.fee_back_at,
             'notEarningReason', app.referral_not_earning(p.tenant_id))
           order by p.joined_at), '[]'::jsonb)
      from app.referral_partners p
      left join public.tenants t on t.id = p.tenant_id);
end $$;

-- One distributor in full (admins only): every shop, every ledger line, the wallet and the log.
create or replace function public.referral_admin_partner(p_partner_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p app.referral_partners%rowtype;
begin
  perform app.referral_admin_guard();
  select * into p from app.referral_partners where tenant_id = p_partner_id;
  if not found then
    raise exception 'No distributor for that shop.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'partner', to_jsonb(p) || jsonb_build_object(
      'shopName', (select nullif(btrim(t.name), '') from public.tenants t where t.id = p.tenant_id),
      'ownCycle', app.referral_own_cycle(p.tenant_id),
      'notEarningReason', app.referral_not_earning(p.tenant_id)),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object(
                'referralId', r.id, 'shopId', r.tenant_id, 'shopName', nullif(btrim(t.name), ''), 'shopSlug', t.slug,
                'ownerEmail', coalesce(lower(btrim(t.owner_email)), r.customer_email),
                'source', r.source, 'status', r.status, 'hold', r.hold, 'holdReason', r.hold_reason,
                'voidReason', r.void_reason, 'createdAt', r.created_at, 'countedAt', r.counted_at,
                'countedCycle', r.counted_cycle, 'tier', s.tier, 'billing', s.billing_cycle, 'planStatus', s.status,
                'payments', (select count(*) from app.shop_payments sp where sp.tenant_id = r.tenant_id),
                'paid', (select coalesce(sum(sp.amount_paid), 0) from app.shop_payments sp where sp.tenant_id = r.tenant_id))
                order by r.created_at desc), '[]'::jsonb)
                from app.referrals r
                left join public.tenants t on t.id = r.tenant_id
                left join lateral (select x.tier, x.billing_cycle, x.status from public.subscriptions x
                                    where x.tenant_id = r.tenant_id order by x.updated_date desc nulls last limit 1) s on true
               where r.partner_id = p.tenant_id),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', l.id, 'kind', l.kind, 'amount', l.amount, 'base', l.base_amount, 'rate', l.rate,
                 'billing', l.billing_cycle, 'earnedAt', l.earned_at, 'eligible', l.eligible, 'note', l.note,
                 'voidedAt', l.voided_at, 'payRunId', l.pay_run_id, 'invoice', l.stripe_invoice_id, 'ref', l.stripe_ref,
                 'shopName', (select nullif(btrim(t.name), '') from app.referrals r join public.tenants t on t.id = r.tenant_id
                               where r.id = l.referral_id))
                 order by l.earned_at desc, l.created_at desc), '[]'::jsonb)
                 from (select * from app.referral_ledger x where x.partner_id = p.tenant_id
                        order by x.earned_at desc, x.created_at desc limit 300) l),
    'wallet', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.kind, 'amount', w.amount, 'note', w.note,
                                                            'at', w.created_at, 'by', w.created_by, 'payRunId', w.pay_run_id)
                                         order by w.created_at desc), '[]'::jsonb)
                 from app.wallet_transactions w where w.tenant_id = p.tenant_id),
    'balance', (select coalesce(sum(w.amount), 0) from app.wallet_transactions w where w.tenant_id = p.tenant_id),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'by', a.admin_email, 'action', a.action,
                                                         'reason', a.reason, 'details', a.details) order by a.at desc), '[]'::jsonb)
              from (select * from app.referral_admin_log x where x.partner_id = p.tenant_id order by x.at desc limit 100) a));
end $$;

-- Referrals held for review (same card as the distributor's own plan).
create or replace function public.referral_admin_reviews()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.referral_admin_guard();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'referralId', r.id,
             'partnerId', r.partner_id,
             'partnerShopName', (select nullif(btrim(pt.name), '') from public.tenants pt where pt.id = r.partner_id),
             'code', p.code,
             'shopId', r.tenant_id,
             'shopName', nullif(btrim(t.name), ''),
             'ownerEmail', coalesce(lower(btrim(t.owner_email)), r.customer_email),
             'reason', r.hold_reason,
             'firstPayment', (select jsonb_build_object('amount', sp.amount_paid, 'billing', sp.billing_cycle, 'paidAt', sp.paid_at)
                                from app.shop_payments sp where sp.stripe_invoice_id = r.first_invoice_id),
             'waiting', (select coalesce(sum(l.amount), 0) from app.referral_ledger l
                          where l.referral_id = r.id and l.eligible and l.voided_at is null and l.pay_run_id is null),
             'countedAt', r.counted_at)
           order by r.counted_at), '[]'::jsonb)
      from app.referrals r
      join app.referral_partners p on p.tenant_id = r.partner_id
      left join public.tenants t on t.id = r.tenant_id
     where r.status = 'counted' and r.hold);
end $$;

-- Release a held referral (its earnings join the next pay run, and it counts toward milestones)
-- or void it.
create or replace function public.referral_admin_review(p_referral_id uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r app.referrals%rowtype;
begin
  perform app.referral_admin_guard(p_reason, true);
  if p_action is null or p_action not in ('release', 'void') then
    raise exception 'Choose release or void.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  select * into r from app.referrals where id = p_referral_id for update;
  if not found or r.status <> 'counted' or not r.hold then
    raise exception 'That referral isn''t waiting for a review.' using errcode = 'P0002';
  end if;
  if p_action = 'release' then
    update app.referrals set hold = false, updated_at = now() where id = r.id;
    perform app.referral_after_count(r.partner_id, r.counted_cycle, now());
  else
    perform app.referral_void(r.id, 'voided by Sellio: ' || btrim(p_reason));
  end if;
  perform app.referral_log(p_action, r.partner_id, r.id, p_reason, jsonb_build_object('shopId', r.tenant_id));
  return jsonb_build_object('ok', true, 'referralId', r.id, 'action', p_action);
end $$;

-- Assign a shop to a distributor (a code the owner forgot, a test): before any of the shop's
-- earnings are in a pay run. Its earlier payments then earn as if the code had been there.
create or replace function public.referral_admin_assign(p_tenant_id text, p_code text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app.referral_partners%rowtype;
  r app.referrals%rowtype;
  v_id uuid;
  v_sub text;
  v_old text;
  pay record;
begin
  perform app.referral_admin_guard(p_reason, true);
  perform app.referral_lock();
  select * into p from app.referral_partners where code = app.referral_normal_code(p_code);
  if not found then
    raise exception 'No distributor has that code.' using errcode = '22023';
  end if;
  if p.status <> 'active' then
    raise exception 'That distributor is %.', p.status using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'That shop isn''t there.' using errcode = 'P0002';
  end if;
  if p.tenant_id = p_tenant_id then
    raise exception 'A shop can''t be brought in by itself.' using errcode = '22023';
  end if;
  v_id := app.referral_for_shop(p_tenant_id);
  if v_id is not null then
    select * into r from app.referrals where id = v_id for update;
    if exists (select 1 from app.referral_ledger l where l.referral_id = v_id and l.pay_run_id is not null) then
      raise exception 'This shop''s earnings are in a pay run already. Adjust the wallets instead.' using errcode = '22023';
    end if;
    v_old := r.partner_id;
    update app.referral_ledger set voided_at = now() where referral_id = v_id and voided_at is null;
    update app.referrals
       set partner_id = p.tenant_id, tenant_id = p_tenant_id, source = 'admin', status = 'pending', hold = false,
           hold_reason = null, counted_at = null, counted_cycle = null, first_invoice_id = null, void_reason = null,
           voided_at = null, updated_at = now()
     where id = v_id;
  else
    select s.stripe_subscription_id into v_sub from public.subscriptions s
     where s.tenant_id = p_tenant_id order by s.updated_date desc nulls last limit 1;
    insert into app.referrals (partner_id, tenant_id, source, stripe_subscription_id)
    values (p.tenant_id, p_tenant_id, 'admin',
            case when v_sub is not null and not exists (select 1 from app.referrals x where x.stripe_subscription_id = v_sub)
                 then v_sub end)
    returning id into v_id;
  end if;
  for pay in
    select sp.stripe_invoice_id from app.shop_payments sp
     where sp.tenant_id = p_tenant_id order by sp.paid_at, sp.recorded_at
  loop
    perform app.referral_apply_payment(v_id, pay.stripe_invoice_id);
  end loop;
  perform app.referral_log('assign', p.tenant_id, v_id, p_reason, jsonb_build_object('shopId', p_tenant_id, 'from', v_old));
  perform app.referral_notify(p.tenant_id, 'A shop added to your referrals', 'Sellio added a shop to your referrals.',
                              jsonb_build_object('kind', 'signup'));
  select * into r from app.referrals where id = v_id;
  return jsonb_build_object('ok', true, 'referralId', v_id, 'status', r.status);
end $$;

-- Pause (earnings stop and pay runs wait), close (the code stops working too) or reactivate a
-- distributor.
create or replace function public.referral_admin_set_status(p_partner_id text, p_status text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text;
  v_old text;
begin
  v_admin := app.referral_admin_guard(p_reason, true);
  if p_status is null or p_status not in ('active', 'paused', 'closed') then
    raise exception 'Choose active, paused or closed.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  select p.status into v_old from app.referral_partners p where p.tenant_id = p_partner_id for update;
  if not found then
    raise exception 'No distributor for that shop.' using errcode = 'P0002';
  end if;
  update app.referral_partners
     set status = p_status, status_reason = btrim(p_reason), status_changed_at = now(), status_changed_by = v_admin
   where tenant_id = p_partner_id;
  perform app.referral_log('status', p_partner_id, null, p_reason, jsonb_build_object('from', v_old, 'to', p_status));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- Correct a wallet by hand (plus or minus), with the reason.
create or replace function public.referral_admin_adjust(p_partner_id text, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text;
  v_amount numeric(12,2) := round(p_amount, 2);
begin
  v_admin := app.referral_admin_guard(p_reason, true);
  if v_amount is null or v_amount = 0 or abs(v_amount) > 100000 then
    raise exception 'Give an amount other than zero.' using errcode = '22023';
  end if;
  perform app.referral_lock();
  if not exists (select 1 from app.referral_partners p where p.tenant_id = p_partner_id) then
    raise exception 'No distributor for that shop.' using errcode = 'P0002';
  end if;
  insert into app.wallet_transactions (tenant_id, kind, amount, note, created_by)
  values (p_partner_id, 'adjustment', v_amount, btrim(p_reason), v_admin);
  perform app.referral_log('adjust', p_partner_id, null, p_reason, jsonb_build_object('amount', v_amount));
  return jsonb_build_object('ok', true,
    'balance', (select coalesce(sum(w.amount), 0) from app.wallet_transactions w where w.tenant_id = p_partner_id));
end $$;

-- Open or close joining, set the first pay run (a Friday; fixed once a run is credited) and the
-- terms version owners accept. The rates are the commercial terms and change only by migration.
create or replace function public.referral_admin_settings(p_joining_open boolean default null, p_first_run_date date default null,
                                                          p_terms_version text default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin text;
  s app.referral_settings%rowtype;
begin
  v_admin := app.referral_admin_guard(p_reason, true);
  perform app.referral_lock();
  select * into s from app.referral_settings where id for update;
  if p_first_run_date is not null and p_first_run_date is distinct from s.first_run_date then
    if extract(isodow from p_first_run_date) <> 5 then
      raise exception 'Pay runs are on Fridays.' using errcode = '22023';
    end if;
    if exists (select 1 from app.referral_pay_runs) then
      raise exception 'The pay run dates can''t change after the first pay run.' using errcode = '22023';
    end if;
  end if;
  if p_terms_version is not null and btrim(p_terms_version) = '' then
    raise exception 'Give the terms a version.' using errcode = '22023';
  end if;
  update app.referral_settings
     set joining_open = coalesce(p_joining_open, joining_open),
         first_run_date = coalesce(p_first_run_date, first_run_date),
         terms_version = coalesce(nullif(btrim(p_terms_version), ''), terms_version),
         updated_at = now(),
         updated_by = v_admin
   where id;
  perform app.referral_log('settings', null, null, p_reason,
    jsonb_build_object('joiningOpen', p_joining_open, 'firstRunDate', p_first_run_date, 'termsVersion', p_terms_version));
  return public.referral_admin_overview() -> 'settings';
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Who may call what
-- ---------------------------------------------------------------------------------------------

revoke all on function app.referral_lock() from public, anon, authenticated;
revoke all on function app.referral_sgt_date(timestamptz) from public, anon, authenticated;
revoke all on function app.referral_cutoff_end(date) from public, anon, authenticated;
revoke all on function app.referral_is_run_date(date) from public, anon, authenticated;
revoke all on function app.referral_run_on_or_after(date) from public, anon, authenticated;
revoke all on function app.referral_run_on_or_before(date) from public, anon, authenticated;
revoke all on function app.referral_next_credit(date) from public, anon, authenticated;
revoke all on function app.referral_credit_date(timestamptz) from public, anon, authenticated;
revoke all on function app.referral_money(numeric) from public, anon, authenticated;
revoke all on function app.referral_day(date) from public, anon, authenticated;
revoke all on function app.is_sellio_admin() from public, anon, authenticated;
revoke all on function app.referral_admin_guard(text, boolean) from public, anon, authenticated;
revoke all on function app.referral_log(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function app.referral_normal_code(text) from public, anon, authenticated;
revoke all on function app.referral_new_code() from public, anon, authenticated;
revoke all on function app.referral_owner_emails(text) from public, anon, authenticated;
revoke all on function app.referral_member_emails(text) from public, anon, authenticated;
revoke all on function app.referral_owner_phones(text) from public, anon, authenticated;
revoke all on function app.referral_self_reason(text, text, text, text) from public, anon, authenticated;
revoke all on function app.referral_not_earning(text) from public, anon, authenticated;
revoke all on function app.referral_notify(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function app.referral_alert_admins(text, text, jsonb) from public, anon, authenticated;
revoke all on function app.referral_shops_paid(text, text) from public, anon, authenticated;
revoke all on function app.referral_own_cycle(text) from public, anon, authenticated;
revoke all on function app.referral_for_shop(text) from public, anon, authenticated;
revoke all on function app.referral_open_lines(timestamptz) from public, anon, authenticated;
revoke all on function app.referral_check_milestones(text, timestamptz) from public, anon, authenticated;
revoke all on function app.referral_after_count(text, text, timestamptz) from public, anon, authenticated;
revoke all on function app.referral_apply_payment(uuid, text) from public, anon, authenticated;
revoke all on function app.referral_void(uuid, text) from public, anon, authenticated;

revoke all on function public.referral_code_info(text) from public, anon, authenticated;
grant execute on function public.referral_code_info(text) to anon, authenticated;

revoke all on function public.referral_join(text, text) from public, anon, authenticated;
revoke all on function public.referral_dashboard(text) from public, anon, authenticated;
revoke all on function public.referral_attach(text, text) from public, anon, authenticated;
revoke all on function public.referral_set_whatsapp(text, boolean) from public, anon, authenticated;
grant execute on function public.referral_join(text, text) to authenticated;
grant execute on function public.referral_dashboard(text) to authenticated;
grant execute on function public.referral_attach(text, text) to authenticated;
grant execute on function public.referral_set_whatsapp(text, boolean) to authenticated;

revoke all on function public.referral_note_checkout(text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.referral_record_payment(text, text, text, text, bigint, bigint, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.referral_record_reversal(text, text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.referral_note_checkout(text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.referral_record_payment(text, text, text, text, bigint, bigint, text, text, timestamptz, text) to service_role;
grant execute on function public.referral_record_reversal(text, text, text, bigint, timestamptz) to service_role;

revoke all on function public.am_i_sellio_admin() from public, anon, authenticated;
revoke all on function public.referral_admin_overview() from public, anon, authenticated;
revoke all on function public.referral_admin_run(date) from public, anon, authenticated;
revoke all on function public.referral_admin_credit(date, numeric) from public, anon, authenticated;
revoke all on function public.referral_admin_partners() from public, anon, authenticated;
revoke all on function public.referral_admin_partner(text) from public, anon, authenticated;
revoke all on function public.referral_admin_reviews() from public, anon, authenticated;
revoke all on function public.referral_admin_review(uuid, text, text) from public, anon, authenticated;
revoke all on function public.referral_admin_assign(text, text, text) from public, anon, authenticated;
revoke all on function public.referral_admin_set_status(text, text, text) from public, anon, authenticated;
revoke all on function public.referral_admin_adjust(text, numeric, text) from public, anon, authenticated;
revoke all on function public.referral_admin_settings(boolean, date, text, text) from public, anon, authenticated;
grant execute on function public.am_i_sellio_admin() to authenticated;
grant execute on function public.referral_admin_overview() to authenticated;
grant execute on function public.referral_admin_run(date) to authenticated;
grant execute on function public.referral_admin_credit(date, numeric) to authenticated;
grant execute on function public.referral_admin_partners() to authenticated;
grant execute on function public.referral_admin_partner(text) to authenticated;
grant execute on function public.referral_admin_reviews() to authenticated;
grant execute on function public.referral_admin_review(uuid, text, text) to authenticated;
grant execute on function public.referral_admin_assign(text, text, text) to authenticated;
grant execute on function public.referral_admin_set_status(text, text, text) to authenticated;
grant execute on function public.referral_admin_adjust(text, numeric, text) to authenticated;
grant execute on function public.referral_admin_settings(boolean, date, text, text) to authenticated;
