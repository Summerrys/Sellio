-- Admin → Deletion requests (Alvin, 29 Nov 2026: "me as an admin should be able to approve on
-- her delete as well and if I have not manually approved immediate removal, it will remain as
-- how it is now which is given a certain days of store restoration").
--
-- The page (/admin/deletions) lists every account deletion request through
-- admin_account_deletions(), for Sellio's admins only. What it can do goes through the
-- admin-deletions edge function, which checks the admin again (am_i_sellio_admin with their own
-- session) and then uses what "Start again" and "Keep my account" already use:
--   Delete now    removeAccount (account-removal.ts): Stripe ends, files, rows, the login
--   Restore       account_deletion_reinstate, then the shop's plan renews again in Stripe
--   Remove files  files a deleted account left in storage (account_leftovers below)
-- Each is written to the request's admin_log. A request nobody acts on stays as it is: closed,
-- and restorable by its owner, until its delete_after.

alter table app.account_deletion_requests
  add column if not exists admin_log jsonb not null default '[]'::jsonb;

-- Files a deleted account left in storage: those of its shops that no longer exist, and its own
-- once its login is gone. Only for a completed request, so nothing of a live shop or login is
-- ever listed. (Files go through the Storage API: storage.objects rows can't be deleted with SQL.)
create or replace function app.account_leftover_files(p_request_id uuid)
returns table(bucket_id text, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select f.bucket_id, f.name
    from app.account_deletion_requests r
    cross join lateral jsonb_array_elements(coalesce(r.shops, '[]'::jsonb)) s
    cross join lateral app.shop_files(s ->> 'tenantId') f
   where r.id = p_request_id
     and r.status = 'completed'
     and coalesce(s ->> 'tenantId', '') <> ''
     and not exists (select 1 from public.tenants t where t.id = s ->> 'tenantId')
  union
  select f.bucket_id, f.name
    from app.account_deletion_requests r
    cross join lateral app.account_files(r.auth_user_id, null) f
   where r.id = p_request_id
     and r.status = 'completed'
     and r.auth_user_id is not null
     and not exists (select 1 from auth.users u where u.id = r.auth_user_id)
$$;
revoke all on function app.account_leftover_files(uuid) from public, anon, authenticated;

-- For the edge functions (service role): the request's status and its leftover files.
create or replace function public.account_leftovers(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select case when r.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'requestId', r.id,
      'status', r.status,
      'files', (select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'name', f.name)
                                          order by f.bucket_id, f.name), '[]'::jsonb)
                  from app.account_leftover_files(r.id) f))
    end
    from (select 1) one
    left join app.account_deletion_requests r on r.id = p_request_id
$$;
revoke all on function public.account_leftovers(uuid) from public, anon, authenticated;
grant execute on function public.account_leftovers(uuid) to service_role;

-- What an admin did to a request, kept on it (who, what, when, how it went).
create or replace function public.account_deletion_admin_log(p_request_id uuid, p_action text, p_admin text, p_result jsonb)
returns void
language sql
security definer
set search_path to ''
as $$
  update app.account_deletion_requests r
     set admin_log = coalesce(r.admin_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'action', p_action,
           'by', lower(btrim(coalesce(p_admin, ''))),
           'at', now(),
           'ok', coalesce((p_result ->> 'ok')::boolean, false),
           'result', p_result)),
         updated_at = now()
   where r.id = p_request_id
$$;
revoke all on function public.account_deletion_admin_log(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.account_deletion_admin_log(uuid, text, text, jsonb) to service_role;

-- The list on Admin → Deletion requests. Waiting ones first (soonest deletion first), then the
-- rest, newest first. A deleted account's email is gone (account_removal_complete blanks it);
-- its shops' names stay from the request's own record.
create or replace function public.admin_account_deletions()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.is_sellio_admin() then
    raise exception 'Only Sellio''s admins can see deletion requests.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.item order by x.waiting desc, case when x.waiting then x.delete_after end asc nulls last, x.created_at desc)
      from (
        select r.created_at,
               r.delete_after,
               r.status in ('requested', 'failed', 'processing') as waiting,
               jsonb_build_object(
                 'id', r.id,
                 'status', r.status,
                 'email', nullif(btrim(coalesce(r.email, '')), ''),
                 'name', (select nullif(btrim(u.full_name), '')
                            from public.app_users u
                           where coalesce(r.email, '') <> '' and lower(btrim(u.email)) = r.email
                           order by u.created_date nulls last
                           limit 1),
                 'phone', (select nullif(btrim(coalesce(u.phone, '')), '') from auth.users u where u.id = r.auth_user_id),
                 'reason', nullif(btrim(coalesce(r.reason, '')), ''),
                 'requestedAt', r.created_at,
                 'deleteAfter', r.delete_after,
                 'completedAt', r.completed_at,
                 'reinstatedAt', r.reinstated_at,
                 'accountExists', exists (select 1 from auth.users u where u.id = r.auth_user_id),
                 'shops', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'tenantId', s ->> 'tenantId',
                                    'name', coalesce(nullif(btrim(t.name), ''), nullif(btrim(s ->> 'name'), '')),
                                    'slug', t.slug,
                                    'exists', t.id is not null)), '[]'::jsonb)
                             from jsonb_array_elements(coalesce(r.shops, '[]'::jsonb)) s
                             left join public.tenants t on t.id = s ->> 'tenantId'),
                 'staffLocked', jsonb_array_length(coalesce(r.staff_locked, '[]'::jsonb)),
                 'stripe', case when jsonb_typeof(r.stripe_result) = 'array' then r.stripe_result else '[]'::jsonb end,
                 'leftoverFiles', case when r.status = 'completed'
                                       then (select count(*) from app.account_leftover_files(r.id))
                                       else 0 end,
                 'adminLog', coalesce(r.admin_log, '[]'::jsonb)) as item
          from app.account_deletion_requests r
      ) x
  ), '[]'::jsonb);
end
$$;
revoke all on function public.admin_account_deletions() from public, anon;
grant execute on function public.admin_account_deletions() to authenticated;
