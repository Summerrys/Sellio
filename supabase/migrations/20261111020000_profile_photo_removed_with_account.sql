-- A profile photo goes with its account (Alvin, 11 Nov 2026: "Yes delete along with the account").
-- A sign-in's uploaded photos are in profile-photos/<its id>/ (20261110021000_profile_photo.sql),
-- and until now deleting an account for good left them there. They're now among the files a
-- removal deletes first, through the Storage API, as account-purge does for every file:
-- - account_files: the account's own, for "Start again" and the final deletion of a closed
--   account (account_removal_plan lists them; account_removal_complete refuses while any remain);
-- - shop_files: those of the staff logins deleted with a shop (shop_removal deletes those logins,
--   and refuses while any of the shop's files remain). The owner keeps their account and photo.
-- Otherwise both are as in 20261105193000_closed_account.sql.

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
      or (o.bucket_id = 'profile-photos' and left(o.name, 37) = p_user_id::text || '/')
  union
  select o.bucket_id, o.name
    from public.chat_conversations c
    join public.chat_messages m on m.conversation_id = c.id and m.image_path is not null
    join storage.objects o on o.bucket_id = 'chat-images' and o.name = m.image_path
   where coalesce(p_email, '') <> '' and lower(c.buyer_email) = lower(p_email)
$$;

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
  union
  select o.bucket_id, o.name
    from app.shop_staff_logins(p_tenant_id) s
    join storage.objects o on o.bucket_id = 'profile-photos' and left(o.name, 37) = s.user_id::text || '/'
$$;

revoke all on function app.account_files(uuid, text) from public, anon, authenticated;
revoke all on function app.shop_files(text) from public, anon, authenticated;
