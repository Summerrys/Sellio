-- Sellio app feedback (Alvin, 20 Nov 2026). A rating of the Sellio app itself, asked inside the app
-- once per account (once per phone for someone not signed in), on the third separate day someone
-- opens Sellio. 1–4 stars: what could be better, an optional note and "you can contact me"; 5 stars:
-- an invitation to rate Sellio on Google Play. "Maybe later" is kept too (outcome 'dismissed'), so the
-- prompt isn't shown again.
-- Admins (app.is_sellio_admin(): the sign-in email, checked here, never the phone) read it in
-- Admin → Feedback, and every 1–3 star rating sends them a push alert. Feedback sent by an admin
-- account, or from a phone an admin has opened the inbox on (app.app_feedback_test_devices), is
-- tagged as a test so testing doesn't skew the numbers.
-- The tables are in the app schema: nobody reads them directly; the functions below are the only way in.

create table app.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('rated', 'dismissed')),
  stars smallint check (stars between 1 and 5),
  topics text[] not null default '{}',
  comment text check (char_length(comment) <= 2000),
  contact_ok boolean not null default false,
  opened_play boolean not null default false,
  user_email text,
  device_id text check (char_length(device_id) <= 100),
  role text not null check (role in ('guest', 'buyer', 'seller', 'home_seller', 'staff')),
  tenant_id text,
  shop_name text,
  language text check (language in ('en', 'zh', 'ms', 'id')),
  platform text check (platform in ('android', 'ios', 'web')),
  app_version text check (char_length(app_version) <= 40),
  is_test boolean not null default false,
  status text not null default 'new' check (status in ('new', 'done')),
  handled_at timestamptz,
  handled_by text,
  constraint app_feedback_stars_match check ((outcome = 'rated') = (stars is not null)),
  constraint app_feedback_topics_known check (topics <@ array['ease_of_use', 'speed', 'ordering', 'design', 'broken', 'other']::text[])
);
create index app_feedback_user_email_idx on app.app_feedback (user_email) where user_email is not null;
create index app_feedback_device_idx on app.app_feedback (device_id) where device_id is not null;
create index app_feedback_created_idx on app.app_feedback (created_at desc);
alter table app.app_feedback enable row level security;

create table app.app_feedback_test_devices (
  device_id text primary key check (char_length(device_id) <= 100),
  added_by text not null,
  added_at timestamptz not null default now()
);
alter table app.app_feedback_test_devices enable row level security;

revoke all on app.app_feedback, app.app_feedback_test_devices from public, anon, authenticated;

-- Send a rating, or "Maybe later". Anyone, signed in or not. Who is asking (buyer, seller, home
-- seller, staff) comes from the account, never from what the phone says. Once per account; once
-- per phone for someone not signed in.
create or replace function public.submit_app_feedback(
  p_outcome text,
  p_stars integer default null,
  p_topics text[] default '{}',
  p_comment text default null,
  p_contact_ok boolean default false,
  p_opened_play boolean default false,
  p_device_id text default null,
  p_language text default null,
  p_platform text default null,
  p_app_version text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email text := app.jwt_email();
  v_device text := nullif(left(btrim(coalesce(p_device_id, '')), 100), '');
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 2000), '');
  v_role text := 'guest';
  v_tenant_id text;
  v_shop text;
  v_seller_type text;
  v_topics text[];
  v_stars smallint;
  v_test boolean;
  v_id uuid;
begin
  if p_outcome is null or p_outcome not in ('rated', 'dismissed') then
    raise exception 'outcome must be rated or dismissed' using errcode = '22023';
  end if;
  if p_outcome = 'rated' and (p_stars is null or p_stars not between 1 and 5) then
    raise exception 'stars must be 1 to 5' using errcode = '22023';
  end if;
  v_stars := case when p_outcome = 'rated' then p_stars end;

  if v_email is not null then
    if exists (select 1 from app.app_feedback f where f.user_email = v_email) then
      return jsonb_build_object('status', 'already');
    end if;
  else
    if v_device is null then
      return jsonb_build_object('status', 'no_device');
    end if;
    if exists (select 1 from app.app_feedback f where f.device_id = v_device and f.user_email is null) then
      return jsonb_build_object('status', 'already');
    end if;
    -- Sending while signed out is open to anyone: a ceiling stops a flood.
    if (select count(*) from app.app_feedback f
         where f.user_email is null and f.created_at > now() - interval '1 hour') >= 60 then
      return jsonb_build_object('status', 'busy');
    end if;
  end if;

  if v_email is not null then
    v_role := 'buyer';
    select t.id, t.name, t.seller_type into v_tenant_id, v_shop, v_seller_type
      from public.tenants t
     where lower(btrim(coalesce(t.owner_email, ''))) = v_email
     order by t.created_date nulls last
     limit 1;
    if v_tenant_id is not null then
      v_role := case when v_seller_type = 'individual' then 'home_seller' else 'seller' end;
    else
      select t.id, t.name into v_tenant_id, v_shop
        from public.tenant_users tu
        join public.tenants t on t.id = tu.tenant_id
       where lower(btrim(tu.user_email)) = v_email and tu.status = 'active'
       limit 1;
      if v_tenant_id is not null then
        v_role := 'staff';
      end if;
    end if;
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_topics
    from unnest(coalesce(p_topics, '{}'::text[])) as x
   where x in ('ease_of_use', 'speed', 'ordering', 'design', 'broken', 'other');

  v_test := (v_email is not null and app.is_sellio_admin())
         or (v_device is not null and exists (select 1 from app.app_feedback_test_devices d where d.device_id = v_device));

  insert into app.app_feedback (outcome, stars, topics, comment, contact_ok, opened_play, user_email,
                                device_id, role, tenant_id, shop_name, language, platform, app_version, is_test)
  values (
    p_outcome,
    v_stars,
    case when v_stars between 1 and 4 then v_topics else '{}' end,
    case when p_outcome = 'rated' then v_comment end,
    coalesce(p_contact_ok, false) and v_email is not null and p_outcome = 'rated',
    coalesce(p_opened_play, false) and v_stars = 5,
    v_email,
    v_device,
    v_role,
    v_tenant_id,
    v_shop,
    case when p_language in ('en', 'zh', 'ms', 'id') then p_language end,
    case when p_platform in ('android', 'ios', 'web') then p_platform end,
    nullif(left(btrim(coalesce(p_app_version, '')), 40), ''),
    v_test
  )
  returning id into v_id;

  -- 1–3 stars: a push alert to Sellio's admins. It never stops the rating being saved.
  if v_stars is not null and v_stars <= 3 then
    begin
      insert into public.notifications (user_email, type, title, message, data, link, priority)
      select a.email,
             'app_feedback',
             case when v_test then 'Test: ' else '' end || v_stars || '★ app feedback',
             coalesce(left(v_comment, 140), 'No comment'),
             jsonb_build_object('feedback_id', v_id, 'stars', v_stars),
             '/admin/feedback',
             'high'
        from app.sellio_admin_emails() a(email);
    exception when others then
      raise warning 'app feedback alert not sent: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('status', 'saved', 'id', v_id);
end $$;

-- Has this account (or, signed out, this phone) already answered? The prompt asks only once.
create or replace function public.app_feedback_status(p_device_id text default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object('done',
    case when app.jwt_email() is not null
         then exists (select 1 from app.app_feedback f where f.user_email = app.jwt_email())
         else exists (select 1 from app.app_feedback f
                       where f.user_email is null
                         and f.device_id = nullif(left(btrim(coalesce(p_device_id, '')), 100), ''))
    end);
$$;

-- Admin → Feedback: the numbers at the top.
create or replace function public.app_feedback_admin_summary(p_include_test boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v jsonb;
begin
  if not app.is_sellio_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'ratings', count(*) filter (where f.outcome = 'rated'),
           'average', round(avg(f.stars) filter (where f.outcome = 'rated'), 1),
           'by_stars', jsonb_build_object(
             '5', count(*) filter (where f.stars = 5),
             '4', count(*) filter (where f.stars = 4),
             '3', count(*) filter (where f.stars = 3),
             '2', count(*) filter (where f.stars = 2),
             '1', count(*) filter (where f.stars = 1)),
           'low_open', count(*) filter (where f.stars <= 3 and f.status = 'new'),
           'dismissed', count(*) filter (where f.outcome = 'dismissed'),
           'opened_play', count(*) filter (where f.opened_play),
           'tests', (select count(*) from app.app_feedback t where t.is_test))
    into v
    from app.app_feedback f
   where p_include_test or not f.is_test;
  return v;
end $$;

-- Admin → Feedback: the ratings, newest first. Contact details only where the person said yes.
-- p_filter: all, low (1–3★), four, five, open (1–3★ not marked done).
create or replace function public.app_feedback_admin_list(
  p_filter text default 'all',
  p_include_test boolean default false,
  p_before timestamptz default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v jsonb;
begin
  if not app.is_sellio_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) into v
    from (
      select f.id, f.created_at, f.stars, f.topics, f.comment, f.contact_ok, f.opened_play, f.role,
             f.shop_name, f.language, f.platform, f.app_version, f.is_test, f.status, f.handled_at,
             case when f.contact_ok then f.user_email end as contact_email,
             case when f.contact_ok then u.phone end as contact_phone,
             case when f.contact_ok then u.full_name end as contact_name
        from app.app_feedback f
        left join lateral (
          select au.phone, au.full_name from public.app_users au
           where lower(btrim(au.email)) = f.user_email
           limit 1
        ) u on true
       where f.outcome = 'rated'
         and (p_include_test or not f.is_test)
         and (p_before is null or f.created_at < p_before)
         and case coalesce(p_filter, 'all')
               when 'low' then f.stars <= 3
               when 'four' then f.stars = 4
               when 'five' then f.stars = 5
               when 'open' then f.stars <= 3 and f.status = 'new'
               else true
             end
       order by f.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) r;
  return v;
end $$;

-- Admin → Feedback: Mark done (or back to new).
create or replace function public.app_feedback_admin_mark(p_id uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not app.is_sellio_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update app.app_feedback f
     set status = case when p_done then 'done' else 'new' end,
         handled_at = case when p_done then now() end,
         handled_by = case when p_done then app.jwt_email() end
   where f.id = p_id;
  if not found then
    raise exception 'no such feedback' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', case when p_done then 'done' else 'new' end);
end $$;

-- An admin opening the inbox on a phone marks that phone as a test phone: whatever is sent from it,
-- by any account, is tagged as a test (and so is what it already sent).
create or replace function public.app_feedback_admin_note_device(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_device text := nullif(left(btrim(coalesce(p_device_id, '')), 100), '');
begin
  if not app.is_sellio_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_device is null then
    return jsonb_build_object('status', 'no_device');
  end if;
  insert into app.app_feedback_test_devices (device_id, added_by)
  values (v_device, app.jwt_email())
  on conflict (device_id) do nothing;
  update app.app_feedback f set is_test = true where f.device_id = v_device and not f.is_test;
  return jsonb_build_object('status', 'noted');
end $$;

revoke all on function public.submit_app_feedback(text, integer, text[], text, boolean, boolean, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_feedback_status(text) from public, anon, authenticated;
revoke all on function public.app_feedback_admin_summary(boolean) from public, anon, authenticated;
revoke all on function public.app_feedback_admin_list(text, boolean, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.app_feedback_admin_mark(uuid, boolean) from public, anon, authenticated;
revoke all on function public.app_feedback_admin_note_device(text) from public, anon, authenticated;

grant execute on function public.submit_app_feedback(text, integer, text[], text, boolean, boolean, text, text, text, text) to anon, authenticated;
grant execute on function public.app_feedback_status(text) to anon, authenticated;
grant execute on function public.app_feedback_admin_summary(boolean) to authenticated;
grant execute on function public.app_feedback_admin_list(text, boolean, timestamptz, integer) to authenticated;
grant execute on function public.app_feedback_admin_mark(uuid, boolean) to authenticated;
grant execute on function public.app_feedback_admin_note_device(text) to authenticated;
