-- A closed account signing in again (Alvin, 5 Nov 2026: "both"). Someone whose account is
-- closed (a deletion request is pending, so the login is locked) and who signs in with the
-- right password, or with Google in the app, sees that it's closed and when it will be
-- deleted, and can choose:
--   Keep my account: Sellio's admins get an alert to restore it (restoring needs Sellio).
--   Start again: the account, any shop it owns and that shop's staff logins are deleted now,
--   for good, so the phone number or email can sign up again.
-- The closed-account edge function proves who it is (the password is checked here, since
-- Supabase Auth refuses a locked login before it checks the password; Google with the ID
-- token) and runs the choice. A staff login locked because its shop's owner closed their
-- account only sees that.

alter table app.account_deletion_requests add column if not exists restore_requested_at timestamptz;

-- What a closed login sees, or null when it isn't closed.
create or replace function app.closed_account_info(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select jsonb_build_object(
              'kind', case when jsonb_array_length(coalesce(r.shops, '[]'::jsonb)) > 0 then 'owner' else 'member' end,
              'requestId', r.id,
              'requestedAt', r.created_at,
              'deleteAfter', r.delete_after,
              'shops', (select coalesce(jsonb_agg(btrim(x ->> 'name')), '[]'::jsonb)
                          from jsonb_array_elements(coalesce(r.shops, '[]'::jsonb)) x),
              'restoreRequestedAt', r.restore_requested_at)
       from app.account_deletion_requests r
      where r.auth_user_id = p_user_id and r.status = 'requested'
      limit 1),
    (select jsonb_build_object(
              'kind', 'staff',
              'deleteAfter', r.delete_after,
              'shops', (select coalesce(jsonb_agg(btrim(x ->> 'name')), '[]'::jsonb)
                          from jsonb_array_elements(coalesce(r.shops, '[]'::jsonb)) x))
       from app.account_deletion_requests r
      where r.status = 'requested'
        and exists (select 1 from jsonb_array_elements(coalesce(r.staff_locked, '[]'::jsonb)) s
                     where s ->> 'userId' = p_user_id::text)
      order by r.delete_after
      limit 1))
$$;

-- The password check for phone sign-in when Supabase Auth refused a locked login, and for the
-- closed-account screen's choices. Says nothing but "wrong" without the right password. Only
-- the edge functions call it, behind phone sign-in's limits (5 wrong passwords per number,
-- 20 failed attempts per network).
create or replace function public.closed_account_check(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user auth.users%rowtype;
  v_ok boolean := false;
  v_locked boolean;
begin
  select * into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if not found or coalesce(v_user.encrypted_password, '') = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('passwordOk', false);
  end if;
  begin
    v_ok := extensions.crypt(p_password, v_user.encrypted_password) = v_user.encrypted_password;
  exception when others then
    v_ok := false;
  end;
  if not v_ok then
    return jsonb_build_object('passwordOk', false);
  end if;
  v_locked := v_user.banned_until is not null and v_user.banned_until > now();
  return jsonb_build_object('passwordOk', true, 'userId', v_user.id, 'locked', v_locked,
    'closed', case when v_locked then app.closed_account_info(v_user.id) end);
end
$$;

-- The same for Google, once the edge function has checked Google's ID token: the login with
-- that Google account (by Google's account id, which doesn't change).
create or replace function public.closed_account_by_google(p_google_sub text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user auth.users%rowtype;
begin
  select u.* into v_user
    from auth.identities i
    join auth.users u on u.id = i.user_id
   where i.provider = 'google' and i.provider_id = btrim(coalesce(p_google_sub, ''))
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v_user.banned_until is null or v_user.banned_until <= now() then
    return jsonb_build_object('found', true, 'locked', false);
  end if;
  return jsonb_build_object('found', true, 'locked', true, 'userId', v_user.id, 'closed', app.closed_account_info(v_user.id));
end
$$;

-- Keep my account: the admins are told (at most once a day per account).
create or replace function public.account_restore_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_request app.account_deletion_requests%rowtype;
  v_again boolean;
  v_shops text;
begin
  select * into v_request from app.account_deletion_requests r where r.id = p_request_id for update;
  if not found or v_request.status <> 'requested' then
    return jsonb_build_object('ok', false);
  end if;
  v_again := v_request.restore_requested_at is not null and v_request.restore_requested_at > now() - interval '1 day';
  update app.account_deletion_requests r set restore_requested_at = now(), updated_at = now() where r.id = v_request.id;
  if not v_again then
    select string_agg(btrim(x ->> 'name'), ', ') into v_shops from jsonb_array_elements(coalesce(v_request.shops, '[]'::jsonb)) x;
    perform public.alert_sellio_admins(
      'account_restore',
      'Account restore asked for',
      v_request.email || ' wants to keep their account'
        || case when v_shops is not null then ' (shop: ' || v_shops || ')' else '' end
        || '. It is due to be deleted on ' || to_char(v_request.delete_after at time zone 'Asia/Singapore', 'DD Mon YYYY')
        || '. Restore it to let them sign in again.',
      jsonb_build_object('request_id', v_request.id, 'email', v_request.email, 'delete_after', v_request.delete_after));
  end if;
  return jsonb_build_object('ok', true, 'alreadyAsked', v_again);
end
$$;

-- An account's own files: chat photos it sent (chat-images, under its id) and every photo in
-- its chats as a buyer, setup leftovers (product-images temp/onboarding/<id>/), and its
-- downloads (exports <shop>/<id>/).
create or replace function app.account_files(p_user_id uuid, p_email text)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where (o.bucket_id = 'chat-images' and left(o.name, 37) = p_user_id::text || '/')
      or (o.bucket_id = 'product-images' and left(o.name, 53) = 'temp/onboarding/' || p_user_id::text || '/')
      or (o.bucket_id = 'exports' and split_part(o.name, '/', 2) = p_user_id::text)
  union
  select o.bucket_id, o.name
    from public.chat_conversations c
    join public.chat_messages m on m.conversation_id = c.id and m.image_path is not null
    join storage.objects o on o.bucket_id = 'chat-images' and o.name = m.image_path
   where coalesce(p_email, '') <> '' and lower(c.buyer_email) = lower(p_email)
$$;

-- A shop's files also include its downloads (exports, under <shop id>/). Otherwise as before.
create or replace function app.shop_files(p_tenant_id text)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where (o.bucket_id = 'product-images'
          and (left(o.name, length(p_tenant_id) + 1) = p_tenant_id || '/'
               or left(o.name, length(p_tenant_id) + 17) = 'temp/onboarding/' || p_tenant_id || '/'))
      or (o.bucket_id = 'exports' and left(o.name, length(p_tenant_id) + 1) = p_tenant_id || '/')
  union
  select o.bucket_id, o.name
    from public.chat_conversations c
    join public.chat_messages m on m.conversation_id = c.id and m.image_path is not null
    join storage.objects o on o.bucket_id = 'chat-images' and o.name = m.image_path
   where c.tenant_id = p_tenant_id
$$;

-- Deleting an account for good ("Start again" now, or later when its time is up). The edge
-- function removes its shops (shop_removal: Stripe, files, rows, staff logins) and its own
-- files first; then account_removal_complete deletes the rest.
create or replace function public.account_removal_plan(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_request app.account_deletion_requests%rowtype;
begin
  select * into v_request from app.account_deletion_requests r where r.id = p_request_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'requestId', v_request.id,
    'status', v_request.status,
    'authUserId', v_request.auth_user_id,
    'deleteAfter', v_request.delete_after,
    'accountExists', exists (select 1 from auth.users u where u.id = v_request.auth_user_id),
    'shops', (select coalesce(jsonb_agg(x ->> 'tenantId'), '[]'::jsonb)
                from jsonb_array_elements(coalesce(v_request.shops, '[]'::jsonb)) x
               where exists (select 1 from public.tenants t
                              where t.id = x ->> 'tenantId'
                                and (lower(btrim(t.owner_email)) = v_request.email
                                     or exists (select 1 from public.tenant_users tu
                                                 where tu.tenant_id = t.id and coalesce(tu.is_owner, false)
                                                   and lower(btrim(tu.user_email)) = v_request.email)))),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'name', f.name)), '[]'::jsonb)
                from app.account_files(v_request.auth_user_id, v_request.email) f));
end
$$;

create or replace function public.account_removal_complete(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_request app.account_deletion_requests%rowtype;
  v_left integer;
  v_status text;
begin
  select * into v_request from app.account_deletion_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'Deletion request not found.' using errcode = 'P0002';
  end if;
  if v_request.status not in ('requested', 'failed') then
    raise exception 'This deletion request is %.', v_request.status using errcode = '55000';
  end if;
  if v_request.auth_user_id is null or not exists (select 1 from auth.users u where u.id = v_request.auth_user_id) then
    raise exception 'The account is already gone.' using errcode = '55000';
  end if;
  select count(*) into v_left
    from jsonb_array_elements(coalesce(v_request.shops, '[]'::jsonb)) x
   where exists (select 1 from public.tenants t where t.id = x ->> 'tenantId');
  if v_left > 0 then
    raise exception 'Remove the account''s % shop(s) first.', v_left using errcode = '55000';
  end if;
  select count(*) into v_left from app.account_files(v_request.auth_user_id, v_request.email);
  if v_left > 0 then
    raise exception 'Remove the account''s % file(s) first.', v_left using errcode = '55000';
  end if;

  -- Its ratings of shops (with any reports on them), its reports of ratings, and its chats as
  -- a buyer whatever the email's capitals (their messages go with them).
  delete from public.rating_reports rr where rr.reporter_id = v_request.auth_user_id;
  delete from public.shop_ratings sr where sr.rater_id = v_request.auth_user_id;
  delete from public.chat_conversations c where lower(btrim(c.buyer_email)) = v_request.email;
  -- A staff login locked with this request that wasn't deleted with its shop (it has joined
  -- another shop since) is unlocked again.
  update auth.users u
     set banned_until = nullif(x ->> 'bannedUntil', '')::timestamptz
    from jsonb_array_elements(coalesce(v_request.staff_locked, '[]'::jsonb)) x
   where u.id = (x ->> 'userId')::uuid and u.id <> v_request.auth_user_id and u.banned_until > now();

  -- The login itself. Its likes, phone alerts, setup and game records go with it (foreign
  -- keys); the trigger sellio_account_deletion_finalize then deletes its chats as a buyer,
  -- notifications, memberships and profile, and marks the request completed (email blanked).
  update app.account_deletion_requests r set status = 'processing', updated_at = now() where r.id = v_request.id;
  delete from auth.users u where u.id = v_request.auth_user_id;

  -- What the finished request keeps: which shops went, nothing personal.
  update app.account_deletion_requests r
     set reason = null,
         staff_snapshot = '[]'::jsonb,
         staff_locked = '[]'::jsonb,
         shops = (select coalesce(jsonb_agg(jsonb_build_object('tenantId', x ->> 'tenantId')), '[]'::jsonb)
                    from jsonb_array_elements(coalesce(r.shops, '[]'::jsonb)) x),
         updated_at = now()
   where r.id = v_request.id
  returning r.status into v_status;
  if v_status is distinct from 'completed' then
    raise exception 'The account deletion did not complete (%).', v_status;
  end if;
  return jsonb_build_object('requestId', v_request.id, 'status', v_status);
end
$$;

revoke all on function app.closed_account_info(uuid) from public, anon, authenticated;
revoke all on function app.account_files(uuid, text) from public, anon, authenticated;
revoke all on function app.shop_files(text) from public, anon, authenticated;
revoke all on function public.closed_account_check(text, text) from public, anon, authenticated;
revoke all on function public.closed_account_by_google(text) from public, anon, authenticated;
revoke all on function public.account_restore_request(uuid) from public, anon, authenticated;
revoke all on function public.account_removal_plan(uuid) from public, anon, authenticated;
revoke all on function public.account_removal_complete(uuid) from public, anon, authenticated;
grant execute on function public.closed_account_check(text, text) to service_role;
grant execute on function public.closed_account_by_google(text) to service_role;
grant execute on function public.account_restore_request(uuid) to service_role;
grant execute on function public.account_removal_plan(uuid) to service_role;
grant execute on function public.account_removal_complete(uuid) to service_role;
