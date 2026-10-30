-- DRAFT, NOT APPLIED. Rating checks (A: a shop's own phones can't rate it; C: suspicious
-- ratings wait for Sellio's moderators). Waiting for Alvin's go-ahead; apply with Supabase
-- apply_migration only after the rolled-back test passes. The app code on this branch needs it first.

-- Ratings: a shop's own phones can't rate it, and ratings that look suspicious wait for
-- Sellio's moderators (they don't count until one keeps them).

-- ── 1. The phones each signed-in account uses ─────────────────────────────────────────
-- A phone is known by a fingerprint of a random key that only the phone holds
-- (localStorage sellio_device_key, lib/deviceKey.js). The key itself is never stored, so
-- no one can claim another person's phone.
create table if not exists app.account_devices (
  user_id uuid not null,
  email text,
  fp text not null check (fp ~ '^[0-9a-f]{64}$'),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, fp)
);
create index if not exists account_devices_fp_idx on app.account_devices (fp);
create index if not exists account_devices_email_idx on app.account_devices (email);
alter table app.account_devices enable row level security;
revoke all on app.account_devices from public, anon, authenticated;

-- The fingerprint of a phone's key (null for a missing or malformed key).
create or replace function app.device_fp(p_key text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when p_key ~ '^[A-Za-z0-9_-]{32,128}$'
              then encode(sha256(convert_to(p_key, 'UTF8')), 'hex') end
$$;

-- The phones a shop's owner and staff (its active members) have signed in on.
create or replace function app.shop_phone_fps(p_tenant_id text)
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select distinct ad.fp
    from public.tenant_users tu
    join app.account_devices ad on ad.email = lower(btrim(tu.user_email))
   where tu.tenant_id = p_tenant_id
     and tu.status = 'active'
     and nullif(btrim(coalesce(tu.user_email, '')), '') is not null
$$;

-- ── 2. A review state on each rating ──────────────────────────────────────────────────
-- none: counts as normal · held: looks suspicious, doesn't count until a moderator
-- checks it · kept: checked and counts · removed: checked and doesn't count.
-- review_reasons: why it was held; for kept (and existing) ratings, the reasons already
-- accepted, so only a new reason holds it again.
alter table public.shop_ratings
  add column if not exists rater_fp text,
  add column if not exists rater_new boolean not null default false,
  add column if not exists review_state text not null default 'none',
  add column if not exists review_reasons text[] not null default '{}',
  add column if not exists held_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists shop_notified boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'shop_ratings_review_state_check'
                    and conrelid = 'public.shop_ratings'::regclass) then
    alter table public.shop_ratings
      add constraint shop_ratings_review_state_check
      check (review_state in ('none', 'held', 'kept', 'removed'));
  end if;
end $$;
create index if not exists shop_ratings_held_idx on public.shop_ratings (held_at) where review_state = 'held';

-- is_hidden (which every average, count and list already leaves out) follows the review:
-- a rating on hold or removed isn't counted or shown anywhere. The rater still sees their
-- own rating as they gave it.
create or replace function app.shop_rating_hidden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_hidden := new.review_state in ('held', 'removed');
  return new;
end $$;
drop trigger if exists shop_ratings_hidden on public.shop_ratings;
create trigger shop_ratings_hidden
  before insert or update on public.shop_ratings
  for each row execute function app.shop_rating_hidden();

-- ── 3. What looks suspicious, and holding it ──────────────────────────────────────────
--   shop_phone: the rater's account, or the phone it rated on, is also used by the
--     shop's owner or staff;
--   shared_phone: another account that rated this shop uses one of the same phones (other
--     than the shop's own, which shop_phone covers);
--   new_account_burst: one of 3 or more five-star ratings for the shop within 24 hours,
--     each from an account under 3 days old when it rated.
create or replace function app.rating_flags(p_rating_id uuid)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare
  r public.shop_ratings%rowtype;
  v_flags text[] := '{}';
begin
  select * into r from public.shop_ratings where id = p_rating_id;
  if not found then
    return v_flags;
  end if;

  if exists (
    select 1
      from (select ad.fp from app.account_devices ad where ad.user_id = r.rater_id
            union select r.rater_fp where r.rater_fp is not null) mine
     where mine.fp in (select app.shop_phone_fps(r.tenant_id))
  ) then
    v_flags := v_flags || 'shop_phone'::text;
  end if;

  if exists (
    select 1
      from public.shop_ratings o
     where o.tenant_id = r.tenant_id
       and o.rater_id <> r.rater_id
       and exists (
         select 1
           from (select ad.fp from app.account_devices ad where ad.user_id = r.rater_id
                 union select r.rater_fp where r.rater_fp is not null) mine
           join (select ad.fp from app.account_devices ad where ad.user_id = o.rater_id
                 union select o.rater_fp where o.rater_fp is not null) theirs
             on theirs.fp = mine.fp
          where mine.fp not in (select app.shop_phone_fps(r.tenant_id)))
  ) then
    v_flags := v_flags || 'shared_phone'::text;
  end if;

  if r.stars = 5 and r.rater_new and exists (
    select 1
      from public.shop_ratings q
     where q.tenant_id = r.tenant_id and q.stars = 5 and q.rater_new
       and q.created_at <= r.created_at
       and q.created_at > r.created_at - interval '24 hours'
       and (select count(distinct q2.rater_id)
              from public.shop_ratings q2
             where q2.tenant_id = r.tenant_id and q2.stars = 5 and q2.rater_new
               and q2.created_at >= q.created_at
               and q2.created_at < q.created_at + interval '24 hours') >= 3
  ) then
    v_flags := v_flags || 'new_account_burst'::text;
  end if;

  return v_flags;
end $$;

-- Hold the shop's ratings that now look suspicious (a kept one only for a reason not
-- already checked; a removed one stays removed), and tell Sellio's moderators.
-- Returns how many were newly held.
create or replace function app.recheck_shop_ratings(p_tenant_id text)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  rec record;
  n integer := 0;
  v_shop text;
begin
  if p_tenant_id is null then
    return 0;
  end if;
  -- One check at a time per shop.
  perform pg_advisory_xact_lock(hashtext('shop_ratings_recheck'), hashtext(p_tenant_id));
  for rec in
    select sr.id, sr.review_state, sr.review_reasons, app.rating_flags(sr.id) as flags
      from public.shop_ratings sr
     where sr.tenant_id = p_tenant_id and sr.review_state <> 'removed'
     order by sr.created_at, sr.id
  loop
    if not exists (select 1 from unnest(rec.flags) as f(reason)
                    where f.reason <> all (rec.review_reasons)) then
      continue;
    end if;
    update public.shop_ratings sr
       set review_reasons = array(select distinct x.reason
                                    from unnest(rec.review_reasons || rec.flags) as x(reason)
                                   order by x.reason),
           review_state = 'held',
           held_at = case when rec.review_state = 'held' then sr.held_at else now() end
     where sr.id = rec.id;
    if rec.review_state <> 'held' then
      n := n + 1;
    end if;
  end loop;

  if n > 0 then
    begin
      select nullif(btrim(t.name), '') into v_shop from public.tenants t where t.id = p_tenant_id;
      insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
      select null, m.email, 'system_announcement',
             case when n = 1 then 'A rating is on hold' else n || ' ratings are on hold' end,
             coalesce(v_shop, 'A shop') || ': '
               || case when n = 1 then 'it doesn’t' else 'they don’t' end
               || ' count until you check.',
             '/moderation',
             jsonb_build_object('tenant_id', p_tenant_id),
             'normal'
        from app.moderators m;
    exception when others then
      null;  -- a hold never fails over the notification
    end;
  end if;
  return n;
end $$;

-- The signed-in account uses this phone. When that's new, the ratings it could change
-- are checked again: those of shops this account runs, and of shops it has rated.
-- Returns the phone's fingerprint (null without a usable key).
create or replace function app.note_device(p_key text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := app.jwt_email();
  v_fp text := app.device_fp(p_key);
  v_added boolean;
  t text;
begin
  if v_uid is null or v_fp is null then
    return v_fp;
  end if;
  if exists (select 1 from app.account_devices ad where ad.user_id = v_uid and ad.fp = v_fp) then
    update app.account_devices ad
       set last_seen = now(), email = coalesce(v_email, ad.email)
     where ad.user_id = v_uid and ad.fp = v_fp;
    return v_fp;
  end if;
  -- Dozens of phones on one account aren't one person's phones: stop adding them.
  if (select count(*) from app.account_devices ad where ad.user_id = v_uid) >= 30 then
    return v_fp;
  end if;
  insert into app.account_devices (user_id, email, fp)
  values (v_uid, v_email, v_fp)
  on conflict (user_id, fp) do nothing
  returning true into v_added;
  if coalesce(v_added, false) then
    for t in
      select tu.tenant_id from public.tenant_users tu
       where lower(btrim(tu.user_email)) = v_email and tu.status = 'active'
      union
      select sr.tenant_id from public.shop_ratings sr where sr.rater_id = v_uid
    loop
      perform app.recheck_shop_ratings(t);
    end loop;
  end if;
  return v_fp;
end $$;

-- The app notes the phone for whoever is signed in (lib/deviceKey.js rememberThisPhone).
create or replace function public.remember_my_device(p_device_key text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.note_device(p_device_key);
end $$;

-- ── 4. Rating, with the phone's key (rate_order_v3) ───────────────────────────────────
-- rate_order_v2 as it is, plus: a phone the shop's owner or staff use can't rate it; the
-- phone and the account's age are kept with the rating; the shop's ratings are checked
-- again; and the shop hears of a new rating only when it isn't on hold.
do $mig$
declare
  d text := pg_get_functiondef('public.rate_order_v2(text,integer,text,boolean)'::regprocedure);
  a text;
  v_notify text;
  i integer;
  j integer;
begin
  if md5(d) <> 'fa641f87310df253ae802901ab37d60d' then
    raise exception 'rate_order_v2 changed since it was read (md5 %)', md5(d);
  end if;

  -- name, and the phone's key
  a := 'CREATE OR REPLACE FUNCTION public.rate_order_v2(p_order_id text, p_stars integer, p_note text DEFAULT NULL::text, p_note_public boolean DEFAULT false)';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 1'; end if;
  d := replace(d, a, 'CREATE OR REPLACE FUNCTION public.rate_order_v3(p_order_id text, p_stars integer, p_note text DEFAULT NULL::text, p_note_public boolean DEFAULT false, p_device_key text DEFAULT NULL::text)');

  a := E'  v_first boolean := false;\n';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 2'; end if;
  d := replace(d, a, a || E'  v_fp text := app.device_fp(p_device_key);\n  v_born timestamptz;\n');

  -- a phone the shop's owner or staff use can't rate the shop
  a := $a$    raise exception 'You can''t rate your own shop.' using errcode = '42501', hint = 'own_shop';
  end if;
$a$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 3'; end if;
  d := replace(d, a, a || $b$  -- Nor from a phone the shop's owner or staff use, whoever is signed in on it.
  if v_fp is not null and v_fp in (select app.shop_phone_fps(o.tenant_id)) then
    raise exception 'You can''t rate this shop from a phone that''s used to run it.' using errcode = '42501', hint = 'shop_phone';
  end if;
$b$);

  -- a changed rating keeps the phone it was first rated on
  a := E'       set stars = p_stars, note = v_note, note_public = v_public,\n';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 4'; end if;
  d := replace(d, a, E'       set stars = p_stars, note = v_note, note_public = v_public, rater_fp = coalesce(r.rater_fp, v_fp),\n');

  -- a new rating: its phone, and whether the account is under 3 days old
  a := $a$    insert into public.shop_ratings (tenant_id, order_id, order_number, rater_id, rater_name, stars, note, note_public)
    values (o.tenant_id, o.id, o.order_number, v_uid, v_name, p_stars, v_note, v_public)
    returning * into r;
$a$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 5'; end if;
  d := replace(d, a, $b$    -- How old the account is (a burst of brand-new accounts gets checked).
    select u.created_at into v_born from auth.users u where u.id = v_uid;
    insert into public.shop_ratings (tenant_id, order_id, order_number, rater_id, rater_name, stars, note, note_public, rater_fp, rater_new, shop_notified)
    values (o.tenant_id, o.id, o.order_number, v_uid, v_name, p_stars, v_note, v_public, v_fp, coalesce(v_born > now() - interval '3 days', false), false)
    returning * into r;
$b$);

  -- the shop's notification moves after the check (taken out here, word for word)
  a := E'    insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)\n';
  i := strpos(d, a);
  if i = 0 or (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 6'; end if;
  a := E'      from app.chat_seller_emails(o.tenant_id) as e;\n';
  j := strpos(d, a);
  if j < i or (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 7'; end if;
  v_notify := substr(d, i, j + length(a) - i);
  d := substr(d, 1, i - 1) || substr(d, j + length(a));
  a := E'    v_first := true;\n\n  end if;\n';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 8'; end if;
  d := replace(d, a, E'    v_first := true;\n  end if;\n');

  a := E'\n  return jsonb_build_object(\n';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rate_order_v3: anchor 9'; end if;
  d := replace(d, a,
    E'\n  -- This phone, for the account; then the shop''s ratings are checked again. A rating\n'
    || E'  -- that looks suspicious waits for Sellio''s moderators, and the shop hears of it only\n'
    || E'  -- once it''s kept (review_rating).\n'
    || E'  perform app.note_device(p_device_key);\n'
    || E'  perform app.recheck_shop_ratings(o.tenant_id);\n'
    || E'  select * into r from public.shop_ratings where id = r.id;\n'
    || E'  if v_first and r.review_state <> ''held'' then\n'
    || v_notify
    || E'    update public.shop_ratings set shop_notified = true where id = r.id;\n'
    || E'  end if;\n'
    || a);

  execute d;
end $mig$;
revoke all on function public.rate_order_v3(text, integer, text, boolean, text) from public, anon;
grant execute on function public.rate_order_v3(text, integer, text, boolean, text) to authenticated;

-- The app before this change (no phone key): the same rules otherwise.
create or replace function public.rate_order_v2(p_order_id text, p_stars integer, p_note text default null, p_note_public boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  return public.rate_order_v3(p_order_id, p_stars, p_note, p_note_public, null);
end $$;

-- ── 5. Sellio's moderators: ratings on hold ───────────────────────────────────────────
-- Each held rating with what made it look suspicious: the shop's people who use one of
-- the rater's phones, the other raters of the shop on the same phone, and how many
-- five-star ratings from new accounts came within a day of it.
create or replace function public.rating_review_queue(p_limit integer default 30, p_offset integer default 0)
returns table(rating_id uuid, shop_id text, shop_name text, shop_slug text, shop_currency text,
              order_number text, order_total numeric, order_placed_at timestamptz, order_done_at timestamptz,
              rater_name text, rater_email text, rater_since timestamptz,
              stars smallint, note text, posted_at timestamptz, reasons text[], held_at timestamptz,
              shop_people jsonb, phone_mates jsonb, burst_count integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.is_moderator() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
  select sr.id, sr.tenant_id, nullif(btrim(t.name), ''), t.slug, t.currency,
         sr.order_number, o.total_amount, o.created_date,
         coalesce((ost.times ->> 'completed')::timestamptz, o.updated_date),
         sr.rater_name, lower(btrim(u.email)), u.created_at,
         sr.stars, sr.note, sr.created_at, sr.review_reasons, sr.held_at,
         (select coalesce(jsonb_agg(distinct jsonb_build_object(
                    'name', coalesce(nullif(btrim(tu.user_name), ''), lower(btrim(tu.user_email))),
                    'owner', coalesce(tu.is_owner, false))), '[]'::jsonb)
            from public.tenant_users tu
            join app.account_devices mad on mad.email = lower(btrim(tu.user_email))
           where tu.tenant_id = sr.tenant_id and tu.status = 'active'
             and mad.fp in (select ad.fp from app.account_devices ad where ad.user_id = sr.rater_id
                            union select sr.rater_fp where sr.rater_fp is not null)),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', coalesce(o2.rater_name, 'Sellio buyer'), 'stars', o2.stars, 'at', o2.created_at)
                    order by o2.created_at), '[]'::jsonb)
            from public.shop_ratings o2
           where o2.tenant_id = sr.tenant_id and o2.rater_id <> sr.rater_id
             and exists (
               select 1
                 from (select ad.fp from app.account_devices ad where ad.user_id = sr.rater_id
                       union select sr.rater_fp where sr.rater_fp is not null) mine
                 join (select ad.fp from app.account_devices ad where ad.user_id = o2.rater_id
                       union select o2.rater_fp where o2.rater_fp is not null) theirs
                   on theirs.fp = mine.fp
                where mine.fp not in (select app.shop_phone_fps(sr.tenant_id)))),
         (select count(distinct q.rater_id)::integer
            from public.shop_ratings q
           where q.tenant_id = sr.tenant_id and q.stars = 5 and q.rater_new
             and q.created_at between sr.created_at - interval '24 hours' and sr.created_at + interval '24 hours')
    from public.shop_ratings sr
    left join public.tenants t on t.id = sr.tenant_id
    left join public.orders o on o.id = sr.order_id
    left join app.order_status_times ost on ost.order_id = sr.order_id
    left join auth.users u on u.id = sr.rater_id
   where sr.review_state = 'held'
   order by sr.held_at, sr.id
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- keep: it counts from now on, and the shop is told about it (it wasn't while it waited).
-- remove: it doesn't count; no one is told.
create or replace function public.review_rating(p_rating_id uuid, p_action text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.shop_ratings%rowtype;
  v_state text;
begin
  if not app.is_moderator() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('keep', 'remove') then
    raise exception 'Choose keep or remove.' using errcode = '22023';
  end if;
  select * into r from public.shop_ratings where id = p_rating_id for update;
  if not found then
    raise exception 'That rating isn''t there any more.' using errcode = 'P0002';
  end if;
  if r.review_state <> 'held' then
    raise exception 'That rating has already been checked.' using errcode = '22023', hint = 'already';
  end if;
  v_state := case when p_action = 'keep' then 'kept' else 'removed' end;
  update public.shop_ratings
     set review_state = v_state, reviewed_at = now(), reviewed_by = app.jwt_email()
   where id = r.id;
  if v_state = 'kept' and not r.shop_notified then
    begin
      insert into public.notifications (tenant_id, user_email, type, title, message, link, data, priority)
      select r.tenant_id, e, 'new_rating',
             'New rating: ' || repeat('★', r.stars) || repeat('☆', 5 - r.stars),
             coalesce(r.rater_name, 'A buyer') || ' rated order ' || coalesce(r.order_number, '')
               || coalesce(' · “' || left(r.note, 120) || '”', ''),
             '/ratings',
             jsonb_build_object('order_id', r.order_id, 'stars', r.stars),
             'normal'
        from app.chat_seller_emails(r.tenant_id) as e;
    exception when others then
      null;
    end;
    update public.shop_ratings set shop_notified = true where id = r.id;
  end if;
  return jsonb_build_object('rating_id', r.id, 'review_state', v_state);
end $$;

-- ── 6. Who can call what ──────────────────────────────────────────────────────────────
revoke all on function public.remember_my_device(text) from public, anon;
grant execute on function public.remember_my_device(text) to authenticated;
revoke all on function public.rating_review_queue(integer, integer) from public, anon;
grant execute on function public.rating_review_queue(integer, integer) to authenticated;
revoke all on function public.review_rating(uuid, text) from public, anon;
grant execute on function public.review_rating(uuid, text) to authenticated;
revoke all on function app.device_fp(text) from public, anon, authenticated;
revoke all on function app.shop_phone_fps(text) from public, anon, authenticated;
revoke all on function app.rating_flags(uuid) from public, anon, authenticated;
revoke all on function app.recheck_shop_ratings(text) from public, anon, authenticated;
revoke all on function app.note_device(text) from public, anon, authenticated;
revoke all on function app.shop_rating_hidden() from public, anon, authenticated;
