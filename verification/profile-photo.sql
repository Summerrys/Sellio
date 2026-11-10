-- Profile photos per sign-in (11 Nov 2026): every rule of my_profile_photo and set_profile_photo
-- in supabase/migrations/20261111010000_profile_photo_per_sign_in.sql, in one transaction that
-- ends by raising its results ("TEST RESULTS {passed, failed, failures}"), so nothing stays. Its
-- test sign-ins are made here (…@example.com) and go with everything else.
-- Live: paste the whole file into the Supabase SQL editor (or execute_sql). Locally:
-- node verification/profile-photo.test.mjs /tmp/sellio-verification (see that file).
create function pg_temp.r(p_name text, p_ok boolean, p_got text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'ok', coalesce(p_ok, false), 'got', p_got)
$$;
-- Signed in as p_user (null: signed out), as Supabase sets it for a request.
create function pg_temp.as_user(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when p_user is null then ''
                         else json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text end,
                    true)
$$;

do $test$
declare
  v_res jsonb := '[]'::jsonb;
  v_google uuid := gen_random_uuid();   -- a Google sign-in with no app_users row
  v_plain uuid := gen_random_uuid();    -- an email sign-in: no Google photo, no app_users row
  v_listed uuid := gen_random_uuid();   -- a sign-in with an app_users row
  v_gone uuid := gen_random_uuid();     -- a sign-in that no longer exists
  v_ans jsonb;
  v_first text;
  v_second text;
  v_n integer;
  v_err text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_google, 'zz-photo-google@example.com', jsonb_build_object('avatar_url', 'https://lh3.googleusercontent.com/a/zz-photo=s96-c')),
    (v_plain, 'zz-photo-plain@example.com', '{}'::jsonb),
    (v_listed, 'zz-photo-listed@example.com', jsonb_build_object('picture', 'https://lh3.googleusercontent.com/a/zz-listed=s96-c'));
  insert into public.app_users (email, full_name, role) values ('zz-photo-listed@example.com', 'zz Listed', 'admin');
  v_first := v_google::text || '/1794300000001.webp';
  v_second := v_google::text || '/1794300000002.jpg';

  -- Signed out.
  perform pg_temp.as_user(null, null);
  v_res := v_res || pg_temp.r('signed out: no photo', public.my_profile_photo() is null, coalesce(public.my_profile_photo()::text, 'null'));
  begin
    perform public.set_profile_photo('none');
    v_res := v_res || pg_temp.r('signed out: can''t change it', false, 'changed');
  exception when others then
    v_res := v_res || pg_temp.r('signed out: can''t change it', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  -- A Google sign-in with no app_users row (the gap): its Google photo, and it can change it.
  perform pg_temp.as_user(v_google, 'zz-photo-google@example.com');
  v_ans := public.my_profile_photo();
  v_res := v_res || pg_temp.r('Google sign-in: its Google photo by default',
    v_ans ->> 'source' = 'google' and v_ans ->> 'google' = 'https://lh3.googleusercontent.com/a/zz-photo=s256-c'
      and v_ans ->> 'folder' = v_google::text and v_ans ->> 'path' is null, v_ans::text);

  v_ans := public.set_profile_photo('none');
  v_res := v_res || pg_temp.r('no app_users row: the letter can be chosen (the gap)',
    v_ans ->> 'source' is null and v_ans ->> 'google' is not null and v_ans ->> 'replaced' is null, v_ans::text);
  select count(*) into v_n from app.profile_photos p where p.user_id = v_google and p.choice = 'none' and p.path is null;
  v_res := v_res || pg_temp.r('kept for the sign-in', v_n = 1, v_n::text);
  v_res := v_res || pg_temp.r('read back', public.my_profile_photo() ->> 'source' is null, public.my_profile_photo()::text);

  begin
    perform public.set_profile_photo('upload', v_first);
    v_res := v_res || pg_temp.r('a photo not uploaded is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('a photo not uploaded is refused', sqlstate = '22023' and sqlerrm like 'That photo didn%', sqlstate || ' ' || sqlerrm);
  end;

  insert into storage.objects (bucket_id, name) values ('profile-photos', v_first), ('profile-photos', v_second);
  v_ans := public.set_profile_photo('upload', v_first);
  v_res := v_res || pg_temp.r('an uploaded photo becomes its photo',
    v_ans ->> 'source' = 'upload' and v_ans ->> 'path' = v_first and v_ans ->> 'replaced' is null, v_ans::text);
  v_ans := public.set_profile_photo('upload', v_second);
  v_res := v_res || pg_temp.r('another upload: the first is replaced (Sellio removes its file)',
    v_ans ->> 'source' = 'upload' and v_ans ->> 'path' = v_second and v_ans ->> 'replaced' = v_first, v_ans::text);
  v_ans := public.set_profile_photo('upload', v_second);
  v_res := v_res || pg_temp.r('the same photo again: nothing replaced', v_ans ->> 'replaced' is null, v_ans::text);
  v_ans := public.set_profile_photo('google');
  v_res := v_res || pg_temp.r('back to the Google photo: the upload is replaced',
    v_ans ->> 'source' = 'google' and v_ans ->> 'path' is null and v_ans ->> 'replaced' = v_second, v_ans::text);
  select count(*) into v_n from app.profile_photos p where p.user_id = v_google;
  v_res := v_res || pg_temp.r('the Google photo is no row (the default)', v_n = 0, v_n::text);
  v_ans := public.set_profile_photo('google');
  v_res := v_res || pg_temp.r('Google again: nothing replaced', v_ans ->> 'source' = 'google' and v_ans ->> 'replaced' is null, v_ans::text);

  -- Refused: someone else's folder, a strange name, another bucket, an unknown choice.
  insert into storage.objects (bucket_id, name) values ('profile-photos', v_plain::text || '/1794300000003.webp');
  begin
    perform public.set_profile_photo('upload', v_plain::text || '/1794300000003.webp');
    v_res := v_res || pg_temp.r('another person''s folder is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('another person''s folder is refused', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;
  insert into storage.objects (bucket_id, name) values ('profile-photos', v_google::text || '/../x.webp'), ('product-images', v_google::text || '/1794300000004.webp');
  begin
    perform public.set_profile_photo('upload', v_google::text || '/../x.webp');
    v_res := v_res || pg_temp.r('a strange file name is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('a strange file name is refused', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform public.set_profile_photo('upload', v_google::text || '/1794300000004.webp');
    v_res := v_res || pg_temp.r('a file in another bucket is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('a file in another bucket is refused', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform public.set_profile_photo('selfie');
    v_res := v_res || pg_temp.r('an unknown choice is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('an unknown choice is refused', sqlstate = '22023' and sqlerrm = 'Unknown photo choice.', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform public.set_profile_photo(null);
    v_res := v_res || pg_temp.r('no choice is refused', false, 'accepted');
  exception when others then
    v_res := v_res || pg_temp.r('no choice is refused', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  -- An email sign-in with no Google photo and no app_users row: the letter; it can choose too.
  perform pg_temp.as_user(v_plain, 'zz-photo-plain@example.com');
  v_ans := public.my_profile_photo();
  v_res := v_res || pg_temp.r('email sign-in: the letter, no Google photo',
    v_ans ->> 'source' is null and v_ans ->> 'google' is null and v_ans ->> 'folder' = v_plain::text, v_ans::text);
  v_ans := public.set_profile_photo('google');
  v_res := v_res || pg_temp.r('email sign-in: "Google" is still the letter', v_ans ->> 'source' is null, v_ans::text);
  v_ans := public.set_profile_photo('none');
  v_res := v_res || pg_temp.r('email sign-in: can choose the letter', v_ans ->> 'source' is null, v_ans::text);

  -- Each sign-in has its own photo: the first one's choice isn't the second's.
  perform pg_temp.as_user(v_google, 'zz-photo-google@example.com');
  v_res := v_res || pg_temp.r('each sign-in has its own photo', public.my_profile_photo() ->> 'source' = 'google', public.my_profile_photo()::text);

  -- A sign-in with an app_users row works the same.
  perform pg_temp.as_user(v_listed, 'zz-photo-listed@example.com');
  v_ans := public.my_profile_photo();
  v_res := v_res || pg_temp.r('with an app_users row: its Google photo (from "picture")',
    v_ans ->> 'source' = 'google' and v_ans ->> 'google' = 'https://lh3.googleusercontent.com/a/zz-listed=s256-c', v_ans::text);
  v_ans := public.set_profile_photo('none');
  v_res := v_res || pg_temp.r('with an app_users row: can choose the letter', v_ans ->> 'source' is null, v_ans::text);

  -- A sign-in that no longer exists (a token outliving a deleted account) can't change anything.
  perform pg_temp.as_user(v_gone, 'zz-photo-gone@example.com');
  begin
    perform public.set_profile_photo('none');
    v_res := v_res || pg_temp.r('a deleted sign-in can''t change it', false, 'changed');
  exception when others then
    v_res := v_res || pg_temp.r('a deleted sign-in can''t change it', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  -- Only the two functions read or change the choices: a signed-in person can't touch the table.
  perform pg_temp.as_user(v_plain, 'zz-photo-plain@example.com');
  execute 'set local role authenticated';
  begin
    perform 1 from app.profile_photos limit 1;
    v_res := v_res || pg_temp.r('the table is closed to signed-in people', false, 'read it');
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('the table is closed to signed-in people', true, sqlerrm);
  end;
  begin
    insert into app.profile_photos (user_id, choice) values (v_plain, 'none');
    v_res := v_res || pg_temp.r('nor can they write to it', false, 'wrote');
  exception when insufficient_privilege then
    v_res := v_res || pg_temp.r('nor can they write to it', true, sqlerrm);
  end;
  v_ans := public.my_profile_photo();
  v_res := v_res || pg_temp.r('the functions still answer them', v_ans ->> 'folder' = v_plain::text, v_ans::text);
  execute 'reset role';

  -- A sign-in deleted: its choice goes with it.
  delete from auth.users where id = v_listed;
  select count(*) into v_n from app.profile_photos p where p.user_id = v_listed;
  v_res := v_res || pg_temp.r('a deleted sign-in''s choice goes with it', v_n = 0, v_n::text);

  -- The photo is no longer kept on app_users.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'app_users' and column_name in ('photo_choice', 'photo_path');
  v_res := v_res || pg_temp.r('app_users has no photo columns', v_n = 0, v_n::text);
  select count(*) into v_n from pg_trigger t where t.tgrelid = 'public.app_users'::regclass and t.tgname = 'app_users_photo_guard';
  v_res := v_res || pg_temp.r('nor their guard', v_n = 0, v_n::text);

  perform pg_temp.as_user(null, null);
  raise exception 'TEST RESULTS %', jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(v_res) e where (e ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean),
    'failures', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_res) e where not (e ->> 'ok')::boolean));
end
$test$;
