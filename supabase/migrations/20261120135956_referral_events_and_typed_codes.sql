-- Refer & earn: every referral's history, and a code typed at sign-up recorded as typed.
-- Alvin, 20 Nov 2026: "We should record all these referral codes from individual users, who they
-- actually referred to, and whether they entered a code. So when the moment we launch the payment
-- as well as the wallet feature, all these can be reimbursed easily." Then, to the two fixes
-- proposed for that: "proceed".
--
-- 1. app.referral_events: a line for each referral when it's made (from a link, a typed code or an
--    admin's assignment) and each time it changes (moved to another distributor's code, its shop
--    attached, counted at the first payment, voided, reopened), with who did it, the distributor
--    before and after, and what changed. Written by a trigger on app.referrals, so every function
--    that makes or changes a referral is covered without changing them. Lines are only ever added.
--    Like the programme's other tables: row-level security on and no policies, so only Sellio's
--    own functions (security definer) and the service role read it. A line that can't be written
--    never stops the referral itself (a warning in the logs instead).
-- 2. referral_note_checkout: the sign-up page's "Have a referral code?" sends a typed code as
--    client_reference_id reft_CODE (a link's code stays ref_CODE). Both start with "ref", so
--    stripe-webhook passes them on unchanged; this records reft_ as source 'code' instead of
--    'link'. Nothing sends reft_ until the app's next release, after this.

create table app.referral_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  referral_id uuid not null,
  event text not null check (event in ('linked', 'typed', 'assigned', 'replaced', 'shop_attached', 'counted', 'voided', 'reopened', 'changed')),
  partner_id text,
  previous_partner_id text,
  tenant_id text,
  source text,
  status text,
  actor text,
  details jsonb not null default '{}'::jsonb
);
comment on table app.referral_events is
  'Refer & earn: each referral''s history, one line per change, only ever added to (trigger on app.referrals). Who referred which shop, how (link, typed code, admin), and every change since.';
create index referral_events_referral_at on app.referral_events (referral_id, at);
create index referral_events_partner_at on app.referral_events (partner_id, at);
alter table app.referral_events enable row level security;
revoke all on table app.referral_events from public, anon, authenticated;

create function app.referral_events_record() returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event text;
  v_details jsonb := '{}'::jsonb;
  v_actor text;
begin
  begin
    v_actor := coalesce(app.jwt_email(),
                        nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
                        current_user::text);
    if tg_op = 'INSERT' then
      v_event := case new.source when 'link' then 'linked' when 'code' then 'typed' when 'admin' then 'assigned' else 'changed' end;
      v_details := jsonb_strip_nulls(jsonb_build_object(
        'stripe_session_id', new.stripe_session_id, 'stripe_customer_id', new.stripe_customer_id,
        'stripe_subscription_id', new.stripe_subscription_id, 'customer_email', new.customer_email,
        'void_reason', new.void_reason, 'hold', case when new.hold then true end, 'hold_reason', new.hold_reason));
      insert into app.referral_events (referral_id, event, partner_id, tenant_id, source, status, actor, details)
      values (new.id, v_event, new.partner_id, new.tenant_id, new.source, new.status, v_actor, v_details);
      return null;
    end if;

    -- An update: what changed, from and to (updated_at alone is no change).
    select coalesce(jsonb_object_agg(k.name, jsonb_build_object('from', x.o -> k.name, 'to', x.n -> k.name)), '{}'::jsonb)
      into v_details
      from (select to_jsonb(old) as o, to_jsonb(new) as n) x
      cross join unnest(array['partner_id', 'tenant_id', 'source', 'status', 'hold', 'hold_reason', 'stripe_session_id',
                              'stripe_customer_id', 'stripe_subscription_id', 'customer_email', 'counted_at', 'counted_cycle',
                              'first_invoice_id', 'void_reason', 'voided_at']) as k(name)
     where (x.o -> k.name) is distinct from (x.n -> k.name);
    if v_details = '{}'::jsonb then
      return null;
    end if;
    v_event := case
      when new.partner_id is distinct from old.partner_id then case when new.source = 'admin' then 'assigned' else 'replaced' end
      when new.status is distinct from old.status then
        case new.status when 'counted' then 'counted' when 'void' then 'voided' when 'pending' then 'reopened' else 'changed' end
      when old.tenant_id is null and new.tenant_id is not null then 'shop_attached'
      else 'changed'
    end;
    insert into app.referral_events (referral_id, event, partner_id, previous_partner_id, tenant_id, source, status, actor, details)
    values (new.id, v_event, new.partner_id,
            case when new.partner_id is distinct from old.partner_id then old.partner_id end,
            new.tenant_id, new.source, new.status, v_actor, v_details);
  exception when others then
    raise warning 'referral_events_record: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$function$;
revoke all on function app.referral_events_record() from public, anon, authenticated;

create trigger referral_events_record
  after insert or update on app.referrals
  for each row execute function app.referral_events_record();

-- referral_note_checkout, three edits to the version live since 10 Nov (checked by its md5).
do $migration$
declare
  v_def text := pg_get_functiondef('public.referral_note_checkout(text,text,text,text,text,text,boolean)'::regprocedure);
  v_new text;
begin
  if md5(v_def) <> '5933081176425149cd43b6badde6c9e7' then
    raise exception 'referral_note_checkout is not the version this migration edits (md5 %)', md5(v_def);
  end if;
  v_new := replace(v_def, E'  v_self text;\nbegin\n',
    E'  v_self text;\n'
    || E'  -- A link''s code comes as ref_CODE, one typed at sign-up as reft_CODE (20 Nov 2026).\n'
    || E'  v_ref text := upper(regexp_replace(coalesce(p_code, ''''), ''[^A-Za-z0-9]'', '''', ''g''));\n'
    || E'  v_typed boolean := v_ref ~ ''^REFT[A-HJ-NP-Z2-9]{6}$'';\n'
    || E'  v_code text := app.referral_normal_code(case when v_typed then right(v_ref, 6) else p_code end);\n'
    || E'begin\n');
  if v_new = v_def then raise exception 'edit 1 (declarations) did not apply'; end if;
  v_def := v_new;
  v_new := replace(v_def, 'where code = app.referral_normal_code(p_code) and status = ''active''',
                          'where code = v_code and status = ''active''');
  if v_new = v_def then raise exception 'edit 2 (the code) did not apply'; end if;
  v_def := v_new;
  v_new := replace(v_def, E'values (p.tenant_id, ''link'', case when v_self',
                          E'values (p.tenant_id, case when v_typed then ''code'' else ''link'' end, case when v_self');
  if v_new = v_def then raise exception 'edit 3 (the source) did not apply'; end if;
  execute v_new;
end
$migration$;
