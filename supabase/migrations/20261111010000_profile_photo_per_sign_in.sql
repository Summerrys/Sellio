-- Profile photos kept per sign-in (Alvin, 11 Nov 2026: "fix the profile photo gap").
-- Until now a chosen photo was kept on the person's app_users row (20261110021000_profile_photo.sql),
-- and a sign-in without one couldn't change its photo: set_profile_photo answered "There's no
-- Sellio account for this sign-in." On 11 Nov that was 6 of 28 sign-ins, Alvin's own two Google
-- accounts among them (today's sign-ups and shop setup don't make an app_users row).
-- Now each sign-in's choice is kept in app.profile_photos, keyed by the sign-in itself, so every
-- sign-in can change its photo, and its choice goes when the sign-in is deleted. No row = the
-- Google photo (the default), as before. The one chosen photo there was on 11 Nov is copied over;
-- the app_users columns, their check and their guard trigger are then removed.
-- my_profile_photo and set_profile_photo answer exactly as before, so the app doesn't change.

create table if not exists app.profile_photos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  choice text not null check (choice in ('upload', 'none')),
  path text,
  updated_at timestamptz not null default now(),
  constraint profile_photos_upload_has_path check ((choice = 'upload') = (path is not null))
);
-- Only the two functions below (security definer) read or change it.
alter table app.profile_photos enable row level security;
revoke all on table app.profile_photos from public, anon, authenticated;

-- The choices made so far (the earliest app_users row of an email, as my_profile_photo read it).
insert into app.profile_photos (user_id, choice, path)
select distinct on (u.id) u.id, a.photo_choice, case when a.photo_choice = 'upload' then a.photo_path end
  from public.app_users a
  join auth.users u on lower(u.email) = lower(btrim(a.email))
 where a.photo_choice = 'none'
    or (a.photo_choice = 'upload' and a.photo_path is not null)
 order by u.id, a.created_date nulls last
on conflict (user_id) do nothing;

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
  v_choice text;
  v_path text;
  v_google text;
begin
  if v_uid is null then
    return null;
  end if;
  v_google := app.google_photo(v_uid);
  select p.choice, p.path into v_choice, v_path
    from app.profile_photos p
   where p.user_id = v_uid;
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
  v_old text;
  v_new text := case when p_choice = 'upload' then p_path end;
begin
  if v_uid is null or not app.auth_identity_exists() then
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

  select p.path into v_old
    from app.profile_photos p
   where p.user_id = v_uid
     for update;

  if p_choice = 'google' then
    delete from app.profile_photos p where p.user_id = v_uid;
  else
    insert into app.profile_photos as p (user_id, choice, path, updated_at)
    values (v_uid, p_choice, v_new, now())
    on conflict (user_id) do update
      set choice = excluded.choice, path = excluded.path, updated_at = excluded.updated_at;
  end if;

  return public.my_profile_photo()
    || jsonb_build_object('replaced', case when v_old is not null and v_old is distinct from v_new then v_old end);
end $$;
revoke all on function public.set_profile_photo(text, text) from public, anon;
grant execute on function public.set_profile_photo(text, text) to authenticated, service_role;

-- The photo is no longer kept on app_users.
drop trigger if exists app_users_photo_guard on public.app_users;
drop function if exists app.app_users_photo_guard();
alter table public.app_users drop constraint if exists app_users_photo_choice_check;
alter table public.app_users
  drop column if exists photo_choice,
  drop column if exists photo_path;
