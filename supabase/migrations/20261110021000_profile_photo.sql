-- Profile photos (Alvin, 10 Nov 2026: "use their [Google] profile photo and replace the profile
-- placeholder as their photo. They can also edit and change another image if they wish to").
-- A Sellio account's photo is one of:
-- - the photo Google gives at sign-in (the sign-in's user data: avatar_url or picture), read live
--   (the default: photo_choice is null). Nothing is copied, so a new Google sign-in has its photo
--   straight away, and it follows the Google account's photo. Only Google's photo addresses
--   (…googleusercontent.com) are used, shown at 256 px.
-- - a photo the person chose ('upload'): photo_path, in the public profile-photos bucket, in a
--   folder named after their sign-in (auth.uid()), where only they can add or remove files.
-- - none ('none'): the letter, as before.
-- my_profile_photo says which; set_profile_photo changes it. A trigger keeps the two columns
-- for set_profile_photo alone, so a photo can't point elsewhere.

alter table public.app_users
  add column if not exists photo_choice text,
  add column if not exists photo_path text;
alter table public.app_users drop constraint if exists app_users_photo_choice_check;
alter table public.app_users
  add constraint app_users_photo_choice_check check (photo_choice in ('upload', 'none'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile photos: add to your own folder" on storage.objects;
create policy "Profile photos: add to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Profile photos: see your own folder" on storage.objects;
create policy "Profile photos: see your own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Profile photos: remove from your own folder" on storage.objects;
create policy "Profile photos: remove from your own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- The Google photo of a sign-in, at 256 px ("…=s96-c" → "…=s256-c"), or null.
create or replace function app.google_photo(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when x.url ~* '^https://[a-z0-9.-]*googleusercontent\.com/'
             then regexp_replace(x.url, '=s[0-9]+(-c)?$', '=s256-c')
         end
    from (
      select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
                      nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')) as url
        from auth.users u
       where u.id = p_user
    ) x
$$;
revoke all on function app.google_photo(uuid) from public, anon, authenticated;

-- The signed-in person's photo: { source: 'google' | 'upload' | null, path (an upload's, in
-- profile-photos), google (their Google photo, for "Use my Google photo"), folder (their folder
-- in profile-photos) }. Null when not signed in.
create or replace function public.my_profile_photo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := app.jwt_email();
  v_choice text;
  v_path text;
  v_google text;
begin
  if v_uid is null then
    return null;
  end if;
  v_google := app.google_photo(v_uid);
  if v_email is not null then
    select a.photo_choice, a.photo_path into v_choice, v_path
      from public.app_users a
     where lower(a.email) = v_email
     order by a.created_date nulls last
     limit 1;
  end if;
  return jsonb_build_object(
    'source', case
                when v_choice = 'upload' and v_path is not null then 'upload'
                when v_choice = 'none' then null
                when v_google is not null then 'google'
              end,
    'path', case when v_choice = 'upload' then v_path end,
    'google', v_google,
    'folder', v_uid::text
  );
end $$;
revoke all on function public.my_profile_photo() from public, anon;
grant execute on function public.my_profile_photo() to authenticated, service_role;

-- Change the signed-in person's photo: 'google' (back to their Google photo), 'upload' (p_path:
-- a photo they put in their own profile-photos folder) or 'none' (the letter). Returns
-- my_profile_photo, and 'replaced': their earlier upload's path when it's no longer used (Sellio
-- then removes that file).
create or replace function public.set_profile_photo(p_choice text, p_path text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := app.jwt_email();
  v_old text;
  v_new text := case when p_choice = 'upload' then p_path end;
  v_count integer;
begin
  if v_uid is null or v_email is null or not app.auth_identity_exists() then
    raise exception 'Please sign in again to change your photo.' using errcode = '42501';
  end if;
  if p_choice is null or p_choice not in ('google', 'upload', 'none') then
    raise exception 'Unknown photo choice.' using errcode = '22023';
  end if;
  if p_choice = 'upload' and (
       p_path is null
       or p_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
       or split_part(p_path, '/', 1) <> v_uid::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = p_path)
     ) then
    raise exception 'That photo didn''t upload. Please try again.' using errcode = '22023';
  end if;

  select a.photo_path into v_old
    from public.app_users a
   where lower(a.email) = v_email
   order by a.created_date nulls last
   limit 1;

  perform set_config('sellio.profile_photo', 'on', true);
  update public.app_users a
     set photo_choice = case p_choice when 'google' then null else p_choice end,
         photo_path = v_new
   where lower(a.email) = v_email;
  get diagnostics v_count = row_count;
  perform set_config('sellio.profile_photo', '', true);
  if v_count = 0 then
    raise exception 'There''s no Sellio account for this sign-in.' using errcode = 'P0002';
  end if;

  return public.my_profile_photo()
    || jsonb_build_object('replaced', case when v_old is not null and v_old is distinct from v_new then v_old end);
end $$;
revoke all on function public.set_profile_photo(text, text) from public, anon;
grant execute on function public.set_profile_photo(text, text) to authenticated, service_role;

-- The photo columns change only through set_profile_photo.
create or replace function app.app_users_photo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('sellio.profile_photo', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.photo_choice := null;
    new.photo_path := null;
  elsif new.photo_choice is distinct from old.photo_choice or new.photo_path is distinct from old.photo_path then
    raise exception 'Change the profile photo with set_profile_photo.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.app_users_photo_guard() from public, anon, authenticated;
drop trigger if exists app_users_photo_guard on public.app_users;
create trigger app_users_photo_guard
  before insert or update of photo_choice, photo_path on public.app_users
  for each row execute function app.app_users_photo_guard();
