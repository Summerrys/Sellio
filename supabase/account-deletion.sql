
create table app.account_deletion_requests(
 id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique,
 email text not null, status text not null check(status in ('needs_owner_action','needs_asset_action','needs_admin_action','processing','failed','completed')),
 blockers jsonb not null default '[]', membership_snapshot jsonb not null default '[]',
 profile_was_active boolean, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), completed_at timestamptz
);
alter table app.account_deletion_requests enable row level security;
revoke all on app.account_deletion_requests from public,anon,authenticated;

create or replace function app.auth_identity_exists() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid());
$$;
revoke all on function app.auth_identity_exists() from public,anon;
grant execute on function app.auth_identity_exists() to authenticated;
create policy live_auth_identity on public.app_users as restrictive for all to authenticated
 using(app.auth_identity_exists()) with check(app.auth_identity_exists());

create or replace function public.account_deletion_prepare(p_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $
declare
 v_email text; v_owned jsonb; v_storage bigint; v_status text;
 v_request app.account_deletion_requests%rowtype; v_snapshot jsonb; v_active boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('delete-account:' || p_auth_user_id::text,0));
 select lower(email) into v_email from auth.users where id=p_auth_user_id;
 if v_email is null then raise exception 'Verified account not found' using errcode='P0002'; end if;
 select * into v_request from app.account_deletion_requests where auth_user_id=p_auth_user_id for update;
 if v_request.status='processing' then return jsonb_build_object('requestId',v_request.id,'status',v_request.status,'blockers',v_request.blockers); end if;
 select coalesce(jsonb_agg(jsonb_build_object('tenantId',t.id,'name',t.name)),'[]'::jsonb) into v_owned
 from public.tenants t where lower(t.owner_email)=v_email or exists(
   select 1 from public.tenant_users tu where tu.tenant_id=t.id and lower(tu.user_email)=v_email and coalesce(tu.is_owner,false)
 );
 select count(*) into v_storage from storage.objects where owner_id=p_auth_user_id::text or owner=p_auth_user_id;
 v_status := case
   when exists(select 1 from public.super_admins where lower(email)=v_email and coalesce(is_active,true)) then 'needs_admin_action'
   when jsonb_array_length(v_owned)>0 then 'needs_owner_action'
   when v_storage>0 then 'needs_asset_action'
   else 'processing' end;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status)),'[]'::jsonb) into v_snapshot
   from public.tenant_users where lower(user_email)=v_email;
 select is_active into v_active from public.app_users where lower(email)=v_email;
 insert into app.account_deletion_requests(auth_user_id,email,status,blockers,membership_snapshot,profile_was_active)
 values(p_auth_user_id,v_email,v_status,jsonb_build_object('stores',v_owned,'ownedFiles',v_storage),v_snapshot,v_active)
 on conflict(auth_user_id) do update set status=excluded.status,blockers=excluded.blockers,
   membership_snapshot=excluded.membership_snapshot,profile_was_active=excluded.profile_was_active,updated_at=now()
 returning * into v_request;
 if v_status='processing' then
   update public.tenant_users set status='suspended',updated_date=now() where lower(user_email)=v_email;
   update public.app_users set is_active=false,updated_date=now() where lower(email)=v_email;
 end if;
 return jsonb_build_object('requestId',v_request.id,'status',v_status,'blockers',v_request.blockers);
end $;
revoke all on function public.account_deletion_prepare(uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_prepare(uuid) to service_role;

create or replace function public.account_deletion_finish(p_auth_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request app.account_deletion_requests%rowtype;
begin
 select * into v_request from app.account_deletion_requests where id=p_request_id and auth_user_id=p_auth_user_id for update;
 if not found then raise exception 'Deletion request not found' using errcode='P0002'; end if;
 if v_request.status='completed' then return jsonb_build_object('requestId',v_request.id,'status','completed'); end if;
 if exists(select 1 from auth.users where id=p_auth_user_id) then raise exception 'Authentication deletion is not complete'; end if;
 if v_request.status not in ('processing','failed') then raise exception 'Deletion prerequisites have not been met'; end if;
 delete from public.notification_preferences where lower(user_email)=v_request.email;
 delete from public.notifications where lower(user_email)=v_request.email;
 delete from public.tenant_users where lower(user_email)=v_request.email;
 delete from public.app_users where lower(email)=v_request.email;
 update app.account_deletion_requests set status='completed',email='',membership_snapshot='[]',blockers='{}',
   completed_at=now(),updated_at=now() where id=v_request.id;
 return jsonb_build_object('requestId',v_request.id,'status','completed');
end $$;
revoke all on function public.account_deletion_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_finish(uuid,uuid) to service_role;

create or replace function public.account_deletion_restore(p_auth_user_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $
declare v_request app.account_deletion_requests%rowtype;
begin
 select * into v_request from app.account_deletion_requests where id=p_request_id and auth_user_id=p_auth_user_id for update;
 if not found or v_request.status<>'processing' then return; end if;
 if not exists(select 1 from auth.users where id=p_auth_user_id) then return; end if;
 update public.tenant_users tu set status=snap.status,updated_date=now()
 from jsonb_to_recordset(v_request.membership_snapshot) as snap(id text,status text)
 where tu.id=snap.id and lower(tu.user_email)=v_request.email and tu.status='suspended' and tu.updated_date=v_request.updated_at;
 update public.app_users set is_active=coalesce(v_request.profile_was_active,true),updated_date=now()
 where lower(email)=v_request.email and is_active=false and updated_date=v_request.updated_at;
 update app.account_deletion_requests set status='failed',updated_at=now() where id=v_request.id;
end $;
revoke all on function public.account_deletion_restore(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_deletion_restore(uuid,uuid) to service_role;

-- Finalize personal data in the same transaction that removes Auth.
-- An error rolls Auth deletion back, allowing the edge function to restore access.
create or replace function app.finish_account_deletion_on_auth_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_request_id uuid;
begin
 select id into v_request_id from app.account_deletion_requests
 where auth_user_id=old.id and status='processing';
 if v_request_id is not null then
   perform public.account_deletion_finish(old.id,v_request_id);
 end if;
 return old;
end $$;
revoke all on function app.finish_account_deletion_on_auth_delete() from public,anon,authenticated;
create trigger sellio_account_deletion_finalize
after delete on auth.users for each row
execute function app.finish_account_deletion_on_auth_delete();
