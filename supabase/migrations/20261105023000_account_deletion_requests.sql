-- Account deletion on request, stage 1 (Alvin, 5 Nov 2026).
--
-- A person asks inside the app (or on sellio.sg/delete-account). The delete-account edge
-- function, as the server, calls public.account_deletion_request(...), which at once:
--   * closes every shop they own: can_sell = false (Store unavailable, no new orders, off
--     Explore, no chat), the same switch the plans use;
--   * suspends their own shop memberships and those of the staff of their shops;
--   * marks their profile inactive, locks their sign-in (Supabase Auth ban) and signs them
--     out everywhere, and forgets their phones for push alerts;
--   * does the same to the logins of those shops' staff, unless a staff member also works in
--     another shop or owns one (then only this shop's membership is suspended). Signed out,
--     everyone lands on Explore and can browse as a visitor (Alvin, 5 Nov);
--   * records the request, with the date it is to be deleted: 6 months for an owner (so
--     Sellio can reinstate the shop if they write in), 30 days for anyone without a shop;
--   * alerts Sellio's admins (in-app notification and push).
-- Nothing is deleted yet: the deleting on that date is stage 2 (a scheduled job, planned
-- separately). public.account_deletion_reinstate(request_id) undoes all of the above.
-- Sellio admin accounts are refused (so an admin can't lock Sellio out).
-- The older functions account_deletion_prepare/finish/restore are left as they were.

-- Who hears about deletion requests (and can't be deleted from the app): Sellio's own
-- accounts. public.super_admins is empty and also grants access elsewhere, so it isn't used
-- for this; active super_admins rows, if any are ever added, are included too.
create table if not exists app.alert_recipients (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table app.alert_recipients enable row level security;
revoke all on app.alert_recipients from public, anon, authenticated;
-- leeyq.alvin@gmail.com is the Sellio account on Alvin's phone; the other two are the
-- bypass addresses the app treats as Alvin's.
insert into app.alert_recipients (email)
values ('leeyq.alvin@gmail.com'), ('alvin.leeyq@gmail.com'), ('alvin_y_q_lee@ite.edu.sg')
on conflict (email) do nothing;

create or replace function app.sellio_admin_emails()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select r.email from app.alert_recipients r
  union
  select lower(sa.email) from public.super_admins sa where coalesce(sa.is_active, true)
$$;
revoke all on function app.sellio_admin_emails() from public, anon, authenticated;

alter table app.account_deletion_requests
  add column if not exists reason text,
  add column if not exists delete_after timestamptz,
  add column if not exists shops jsonb not null default '[]'::jsonb,
  add column if not exists staff_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists stripe_result jsonb,
  add column if not exists staff_locked jsonb not null default '[]'::jsonb,
  add column if not exists reinstated_at timestamptz;

alter table app.account_deletion_requests drop constraint account_deletion_requests_status_check;
alter table app.account_deletion_requests add constraint account_deletion_requests_status_check
  check (status in ('requested', 'reinstated', 'needs_owner_action', 'needs_asset_action',
                    'needs_admin_action', 'processing', 'failed', 'completed'));

create or replace function public.account_deletion_request(p_auth_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_request app.account_deletion_requests%rowtype;
  v_owned jsonb;
  v_staff jsonb;
  v_memberships jsonb;
  v_active boolean;
  v_after timestamptz;
  v_names text;
  v_subscriptions jsonb;
  v_staff_locked jsonb;
begin
  if p_auth_user_id is null then
    raise exception 'An account is required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('delete-account:' || p_auth_user_id::text, 0));

  select lower(u.email) into v_email from auth.users u where u.id = p_auth_user_id;
  if v_email is null then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from app.sellio_admin_emails() a(email) where a.email = v_email) then
    return jsonb_build_object('status', 'refused', 'reason', 'admin');
  end if;

  select * into v_request from app.account_deletion_requests r where r.auth_user_id = p_auth_user_id for update;
  if found and v_request.status = 'requested' then
    -- Asked again (a retry, or a second device): the same request, unchanged.
    select coalesce(jsonb_agg(jsonb_build_object('tenantId', s.tenant_id, 'stripeSubscriptionId', s.stripe_subscription_id)), '[]'::jsonb)
      into v_subscriptions
      from public.subscriptions s
     where s.tenant_id in (select x ->> 'tenantId' from jsonb_array_elements(v_request.shops) x)
       and s.stripe_subscription_id is not null
       and s.status in ('active', 'trial', 'past_due');
    return jsonb_build_object(
      'requestId', v_request.id, 'status', 'requested', 'deleteAfter', v_request.delete_after,
      'shops', (select coalesce(jsonb_agg(x -> 'name'), '[]'::jsonb) from jsonb_array_elements(v_request.shops) x),
      'subscriptions', v_subscriptions, 'alreadyRequested', true);
  end if;

  -- The shops this person owns (the same test as the older deletion flow), with any can_sell
  -- setting they already had, so reinstating puts it back exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
           'tenantId', t.id,
           'name', t.name,
           'canSellOverride', (select to_jsonb(o) - 'tenant_id' - 'entitlement'
                                 from public.tenant_entitlement_overrides o
                                where o.tenant_id = t.id and o.entitlement = 'can_sell'))
           order by t.created_date), '[]'::jsonb)
    into v_owned
    from public.tenants t
   where lower(t.owner_email) = v_email
      or exists (select 1 from public.tenant_users tu
                  where tu.tenant_id = t.id and lower(tu.user_email) = v_email and coalesce(tu.is_owner, false));

  -- Everyone else in those shops (their staff), as they were.
  select coalesce(jsonb_agg(jsonb_build_object('id', tu.id, 'tenantId', tu.tenant_id,
                                               'email', lower(tu.user_email), 'status', tu.status)), '[]'::jsonb)
    into v_staff
    from public.tenant_users tu
   where tu.tenant_id in (select x ->> 'tenantId' from jsonb_array_elements(v_owned) x)
     and lower(tu.user_email) <> v_email;

  -- The staff logins that exist only for those shops: locked as well (with how they were).
  select coalesce(jsonb_agg(jsonb_build_object('userId', u.id, 'email', s.email, 'bannedUntil', u.banned_until)), '[]'::jsonb)
    into v_staff_locked
    from (select distinct x ->> 'email' as email from jsonb_array_elements(v_staff) x) s
    join auth.users u on lower(u.email) = s.email
   where not exists (select 1 from public.tenant_users o
                      where lower(o.user_email) = s.email
                        and o.tenant_id not in (select y ->> 'tenantId' from jsonb_array_elements(v_owned) y)
                        and coalesce(o.status, 'active') = 'active')
     and not exists (select 1 from public.tenants t where lower(t.owner_email) = s.email)
     and not exists (select 1 from app.sellio_admin_emails() a(email) where a.email = s.email);

  -- Their own memberships (owner or staff, any shop), as they were.
  select coalesce(jsonb_agg(jsonb_build_object('id', tu.id, 'status', tu.status)), '[]'::jsonb)
    into v_memberships
    from public.tenant_users tu
   where lower(tu.user_email) = v_email;

  select bool_and(coalesce(u.is_active, true)) into v_active from public.app_users u where lower(u.email) = v_email;

  v_after := now() + case when jsonb_array_length(v_owned) > 0 then interval '6 months' else interval '30 days' end;

  -- Their Stripe subscriptions, for the edge function to stop renewing.
  select coalesce(jsonb_agg(jsonb_build_object('tenantId', s.tenant_id, 'stripeSubscriptionId', s.stripe_subscription_id)), '[]'::jsonb)
    into v_subscriptions
    from public.subscriptions s
   where s.tenant_id in (select x ->> 'tenantId' from jsonb_array_elements(v_owned) x)
     and s.stripe_subscription_id is not null
     and s.status in ('active', 'trial', 'past_due');

  -- 1. The shops close: Store unavailable, no new orders, off Explore.
  insert into public.tenant_entitlement_overrides (tenant_id, entitlement, value, reason, expires_at, created_by)
  select x ->> 'tenantId', 'can_sell', 'false'::jsonb, 'Closed: account deletion requested', null, 'account-deletion'
    from jsonb_array_elements(v_owned) x
  on conflict (tenant_id, entitlement) do update
    set value = 'false'::jsonb, reason = excluded.reason, expires_at = null, created_by = excluded.created_by;

  -- 2. No one works in those shops any more, and this person is in no shop.
  update public.tenant_users tu
     set status = 'suspended'
   where (lower(tu.user_email) = v_email
          or tu.tenant_id in (select x ->> 'tenantId' from jsonb_array_elements(v_owned) x))
     and coalesce(tu.status, 'active') <> 'suspended';

  -- 3. The person: profile inactive, sign-in locked, signed out everywhere, no push alerts.
  update public.app_users u set is_active = false where lower(u.email) = v_email;
  update auth.users u set banned_until = now() + interval '100 years' where u.id = p_auth_user_id;
  delete from auth.sessions s where s.user_id = p_auth_user_id;
  delete from public.push_devices d where d.user_email = v_email;

  -- 3b. The same for the staff logins that exist only for those shops.
  update auth.users u set banned_until = now() + interval '100 years'
   where u.id in (select (x ->> 'userId')::uuid from jsonb_array_elements(v_staff_locked) x);
  delete from auth.sessions s
   where s.user_id in (select (x ->> 'userId')::uuid from jsonb_array_elements(v_staff_locked) x);
  delete from public.push_devices d
   where d.user_email in (select x ->> 'email' from jsonb_array_elements(v_staff_locked) x);

  -- 4. The request.
  insert into app.account_deletion_requests as r
         (auth_user_id, email, status, blockers, membership_snapshot, profile_was_active,
          reason, delete_after, shops, staff_snapshot, staff_locked, stripe_result, completed_at, reinstated_at)
  values (p_auth_user_id, v_email, 'requested', '{}'::jsonb, v_memberships, v_active,
          nullif(left(btrim(coalesce(p_reason, '')), 1000), ''), v_after, v_owned, v_staff, v_staff_locked, null, null, null)
  on conflict (auth_user_id) do update
     set email = excluded.email, status = 'requested', blockers = '{}'::jsonb,
         membership_snapshot = excluded.membership_snapshot, profile_was_active = excluded.profile_was_active,
         reason = excluded.reason, delete_after = excluded.delete_after, shops = excluded.shops,
         staff_snapshot = excluded.staff_snapshot, staff_locked = excluded.staff_locked, stripe_result = null,
         completed_at = null, reinstated_at = null, created_at = now(), updated_at = now()
  returning * into v_request;

  -- 5. Sellio's admins hear about it (the notifications trigger sends the push alert).
  select string_agg(x ->> 'name', ', ') into v_names from jsonb_array_elements(v_owned) x;
  insert into public.notifications (user_email, type, title, message, data, priority)
  select a.email, 'account_deletion', 'Account deletion requested',
         v_email || ' asked to delete their account.'
           || case when v_names is not null then ' Shop closed: ' || v_names || '.' else '' end
           || case when jsonb_array_length(v_staff_locked) > 0
                   then ' Staff logins locked: ' || jsonb_array_length(v_staff_locked) || '.' else '' end
           || ' Deleted on ' || to_char(v_after at time zone 'Asia/Singapore', 'DD Mon YYYY')
           || ' unless reinstated.',
         jsonb_build_object('request_id', v_request.id, 'email', v_email, 'delete_after', v_after,
                            'shops', (select coalesce(jsonb_agg(x -> 'name'), '[]'::jsonb) from jsonb_array_elements(v_owned) x),
                            'staff_locked', (select coalesce(jsonb_agg(x -> 'email'), '[]'::jsonb) from jsonb_array_elements(v_staff_locked) x),
                            'reason', v_request.reason),
         'high'
    from app.sellio_admin_emails() a(email);

  return jsonb_build_object(
    'requestId', v_request.id, 'status', 'requested', 'deleteAfter', v_after,
    'shops', (select coalesce(jsonb_agg(x -> 'name'), '[]'::jsonb) from jsonb_array_elements(v_owned) x),
    'subscriptions', v_subscriptions, 'alreadyRequested', false);
end
$$;

revoke all on function public.account_deletion_request(uuid, text) from public, anon, authenticated;
grant execute on function public.account_deletion_request(uuid, text) to service_role;

-- What the edge function did with the Stripe subscriptions (stopped renewing, or not).
-- A failure alerts the admins to stop it by hand.
create or replace function public.account_deletion_stripe_result(p_request_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request app.account_deletion_requests%rowtype;
begin
  update app.account_deletion_requests r
     set stripe_result = p_result, updated_at = now()
   where r.id = p_request_id
  returning * into v_request;
  if not found then
    raise exception 'Deletion request not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_result, '[]'::jsonb)) x where not coalesce((x ->> 'ok')::boolean, false)) then
    insert into public.notifications (user_email, type, title, message, data, priority)
    select a.email, 'account_deletion', 'Stop a Stripe subscription by hand',
           'The subscription of ' || v_request.email || ' (deletion requested) could not be stopped automatically.'
             || ' Cancel it in Stripe so it doesn''t renew.',
           jsonb_build_object('request_id', v_request.id, 'stripe', p_result),
           'high'
      from app.sellio_admin_emails() a(email);
  end if;
end
$$;

revoke all on function public.account_deletion_stripe_result(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.account_deletion_stripe_result(uuid, jsonb) to service_role;

-- Undoes a request that hasn't been carried out yet (someone wrote in to keep their account).
-- Run by Sellio: select public.account_deletion_reinstate('<request id>');
-- Their Stripe subscription, if it was stopped from renewing, is turned back on in Stripe by hand.
create or replace function public.account_deletion_reinstate(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request app.account_deletion_requests%rowtype;
  v_shop jsonb;
begin
  select * into v_request from app.account_deletion_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'Deletion request not found.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'requested' then
    raise exception 'Only a pending request can be reinstated (this one is %).', v_request.status;
  end if;
  if not exists (select 1 from auth.users u where u.id = v_request.auth_user_id) then
    raise exception 'This account has already been deleted.';
  end if;

  -- The shops' can_sell setting back to what it was.
  for v_shop in select x from jsonb_array_elements(v_request.shops) x loop
    if jsonb_typeof(v_shop -> 'canSellOverride') is distinct from 'object' then
      delete from public.tenant_entitlement_overrides o
       where o.tenant_id = v_shop ->> 'tenantId' and o.entitlement = 'can_sell' and o.created_by = 'account-deletion';
    else
      update public.tenant_entitlement_overrides o
         set value = v_shop -> 'canSellOverride' -> 'value',
             reason = v_shop -> 'canSellOverride' ->> 'reason',
             expires_at = (v_shop -> 'canSellOverride' ->> 'expires_at')::timestamptz,
             created_by = v_shop -> 'canSellOverride' ->> 'created_by'
       where o.tenant_id = v_shop ->> 'tenantId' and o.entitlement = 'can_sell';
    end if;
  end loop;

  -- Memberships (theirs, then their staff's) back to how they were.
  update public.tenant_users tu
     set status = snap.status
    from jsonb_to_recordset(v_request.membership_snapshot) as snap(id text, status text)
   where tu.id = snap.id and tu.status = 'suspended';
  update public.tenant_users tu
     set status = snap.status
    from jsonb_to_recordset(v_request.staff_snapshot) as snap(id text, status text)
   where tu.id = snap.id and tu.status = 'suspended';

  update public.app_users u set is_active = coalesce(v_request.profile_was_active, true) where lower(u.email) = v_request.email;
  update auth.users u set banned_until = null where u.id = v_request.auth_user_id;
  update auth.users u
     set banned_until = (x ->> 'bannedUntil')::timestamptz
    from jsonb_array_elements(v_request.staff_locked) x
   where u.id = (x ->> 'userId')::uuid;
  update app.account_deletion_requests r
     set status = 'reinstated', reinstated_at = now(), updated_at = now()
   where r.id = v_request.id;

  return jsonb_build_object('requestId', v_request.id, 'status', 'reinstated', 'email', v_request.email,
                            'shops', v_request.shops, 'stripe', v_request.stripe_result);
end
$$;

revoke all on function public.account_deletion_reinstate(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_reinstate(uuid) to service_role;
