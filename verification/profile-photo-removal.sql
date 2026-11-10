-- A profile photo goes with its account (11 Nov 2026): the account_files and shop_files rules in
-- supabase/migrations/20261111020000_profile_photo_removed_with_account.sql, on the live database,
-- in one transaction that ends by raising its results ("TEST RESULTS {passed, failed, failures}"),
-- so nothing stays. Its sign-ins, shop, photos and deletion request are made here
-- (zz-…@example.com) and go with everything else. Live only: paste the whole file into the
-- Supabase SQL editor (or execute_sql).
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_me uuid := gen_random_uuid();      -- an account deleted for good
  v_other uuid := gen_random_uuid();   -- someone else
  v_owner uuid := gen_random_uuid();   -- a shop's owner (keeps their account when the shop goes)
  v_staff uuid := gen_random_uuid();   -- a staff login only that shop uses (goes with it)
  v_shop text := gen_random_uuid()::text;
  v_req uuid;
  v_plan jsonb;
  v_files text[];
  v_n integer;
begin
  insert into auth.users (id, email) values
    (v_me, 'zz-photo-gone@example.com'), (v_other, 'zz-photo-other@example.com'),
    (v_owner, 'zz-photo-owner@example.com'), (v_staff, 'zz-photo-staff@example.com');
  insert into storage.objects (bucket_id, name) values
    ('profile-photos', v_me::text || '/1794300000001.webp'), ('profile-photos', v_me::text || '/1794300000002.jpg'),
    ('profile-photos', v_other::text || '/1794300000003.webp'),
    ('profile-photos', v_owner::text || '/1794300000004.webp'),
    ('profile-photos', v_staff::text || '/1794300000005.webp');

  -- An account's own files include its profile photos, and no one else's.
  select array_agg(f.name order by f.name) into v_files
    from app.account_files(v_me, 'zz-photo-gone@example.com') f where f.bucket_id = 'profile-photos';
  v_res := v_res || pg_temp.r('an account''s files include its profile photos',
    v_files = array[v_me::text || '/1794300000001.webp', v_me::text || '/1794300000002.jpg'], coalesce(v_files::text, 'none'));
  select count(*) into v_n from app.account_files(v_other, 'zz-photo-other@example.com') f where f.name not like v_other::text || '/%';
  v_res := v_res || pg_temp.r('and not another account''s', v_n = 0, v_n::text);

  -- Deleting it for good: the plan lists them to delete first; completing refuses while they remain.
  insert into app.account_deletion_requests (auth_user_id, email, status, shops)
  values (v_me, 'zz-photo-gone@example.com', 'requested', '[]'::jsonb)
  returning id into v_req;
  v_plan := public.account_removal_plan(v_req);
  select count(*) into v_n from jsonb_array_elements(v_plan -> 'files') x
   where x ->> 'bucket' = 'profile-photos' and x ->> 'name' like v_me::text || '/%';
  v_res := v_res || pg_temp.r('deleting the account lists its photos to delete first', v_n = 2, (v_plan -> 'files')::text);
  begin
    perform public.account_removal_complete(v_req);
    v_res := v_res || pg_temp.r('the account isn''t deleted while its photos remain', false, 'deleted');
  exception when others then
    v_res := v_res || pg_temp.r('the account isn''t deleted while its photos remain',
      sqlstate = '55000' and sqlerrm = 'Remove the account''s 2 file(s) first.', sqlstate || ' ' || sqlerrm);
  end;
  select count(*) into v_n from auth.users u where u.id = v_me;
  v_res := v_res || pg_temp.r('so the account is still there', v_n = 1, v_n::text);

  -- A shop removed: its staff logins go with it, and so do their photos; its owner's stay.
  insert into public.tenants (id, name, slug, owner_email, seller_type, status)
  values (v_shop, 'zz Photo Shop', 'zz-photo-shop-' || left(v_shop, 8), 'zz-photo-owner@example.com', 'merchant', 'active');
  insert into public.tenant_users (tenant_id, user_email, is_owner, status) values
    (v_shop, 'zz-photo-owner@example.com', true, 'active'),
    (v_shop, 'zz-photo-staff@example.com', false, 'active');
  select array_agg(f.name order by f.name) into v_files from app.shop_files(v_shop) f where f.bucket_id = 'profile-photos';
  v_res := v_res || pg_temp.r('a shop''s files include its staff logins'' photos, not its owner''s',
    v_files = array[v_staff::text || '/1794300000005.webp'], coalesce(v_files::text, 'none'));
  v_plan := public.shop_removal(v_shop, true);
  select count(*) into v_n from jsonb_array_elements(v_plan -> 'files') x
   where x ->> 'bucket' = 'profile-photos' and x ->> 'name' = v_staff::text || '/1794300000005.webp';
  v_res := v_res || pg_temp.r('removing the shop lists the staff photo to delete first',
    v_n = 1 and (v_plan -> 'staff') @> jsonb_build_array(jsonb_build_object('userId', v_staff)), v_plan::text);
  begin
    perform public.shop_removal(v_shop, false);
    v_res := v_res || pg_temp.r('the shop isn''t removed while the staff photo remains', false, 'removed');
  exception when others then
    v_res := v_res || pg_temp.r('the shop isn''t removed while the staff photo remains',
      sqlstate = '55000' and sqlerrm = 'The shop still has 1 files. Remove them through the Storage API first.', sqlstate || ' ' || sqlerrm);
  end;

  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) e where (e ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean));
end
$test$;
