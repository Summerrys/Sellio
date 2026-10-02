-- Public signup establishes identity; store authority is granted by server-owned membership.
-- Normalize legacy cached clients that still submit role: 'admin'.
create or replace function app.normalize_self_signup_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.role := 'user';
  end if;
  return new;
end;
$function$;
revoke all on function app.normalize_self_signup_profile_role() from public;
drop trigger if exists normalize_self_signup_profile_role on public.app_users;
create trigger normalize_self_signup_profile_role
before insert on public.app_users
for each row execute function app.normalize_self_signup_profile_role();

-- Exercise the actual trigger under API roles using only a disposable temporary table.
create temporary table sellio_signup_role_verification (role text);
create trigger verify_signup_role before insert on sellio_signup_role_verification
for each row execute function app.normalize_self_signup_profile_role();
grant all on sellio_signup_role_verification to authenticated, service_role;
set local role authenticated;
do $test$
declare assigned text;
begin
  foreach assigned in array array['admin','superadmin','staff','user'] loop
    insert into sellio_signup_role_verification(role) values (assigned);
  end loop;
  if exists (select 1 from sellio_signup_role_verification where role is distinct from 'user') then
    raise exception 'Self signup role was not normalized';
  end if;
end;
$test$;
reset role;
set local role service_role;
do $test$
declare assigned text;
begin
  insert into sellio_signup_role_verification(role) values ('admin') returning role into assigned;
  if assigned <> 'admin' then raise exception 'Trusted server role was changed'; end if;
end;
$test$;
reset role;
drop table sellio_signup_role_verification;
