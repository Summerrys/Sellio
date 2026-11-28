-- A shop's link follows its name (Alvin, 29 Nov 2026: "she wanted to change her business name
-- but then her url sharing has not changed at all"). Renaming a shop gives it the link the new
-- name makes, the way create_personal_store makes one (cafe-ana, or cafe-ana-2 … when another
-- shop has it), and its old link keeps working: app.shop_link_history remembers it, so
-- get_storefront_tenant still finds the shop there (with its new slug, which the store page and
-- the worker move to), and no other shop can take it.
--   - A name with no letters or digits a link can use (蟹老妈 alone) keeps the current link.
--   - A link that already fits the new name (the name's own, or it with -2 …) stays as it is.
--   - A shop going back to an earlier name gets that link back: its own old links stay its own.
--   - A new shop can't take another shop's old link: it's refused as taken, so create_personal_store
--     goes on to its next address (-2 …), as when another shop has the link now.
-- When a shop is removed (shop_removal), its old links go with it (on delete cascade).

create table if not exists app.shop_link_history (
  slug text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  retired_at timestamptz not null default now()
);
create index if not exists shop_link_history_tenant_id on app.shop_link_history (tenant_id);
alter table app.shop_link_history enable row level security;
-- No policies on purpose: only the definer functions below read or write it.
revoke all on table app.shop_link_history from public, anon, authenticated;

-- The link a name makes (the same rule as create_personal_store), or null when it has nothing
-- a link can use.
create or replace function app.slug_for_name(p_name text)
returns text
language sql
immutable
set search_path to ''
as $$
  select nullif(btrim(left(btrim(regexp_replace(lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))),
                                                '[^a-z0-9]+', '-', 'g'), '-'), 48), '-'), '')
$$;

-- Whether this shop can use a link: no other shop has it now, or had it before.
create or replace function app.slug_free_for(p_slug text, p_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (select 1 from public.tenants t where t.slug = p_slug and t.id is distinct from p_tenant_id)
     and not exists (select 1 from app.shop_link_history h where h.slug = p_slug and h.tenant_id is distinct from p_tenant_id)
$$;

-- The first free link from a base: base, base-2 … base-50, then base-<8 random characters>.
create or replace function app.free_slug_from(p_base text, p_tenant_id text)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_slug text;
begin
  for n in 1..60 loop
    v_slug := case when n = 1 then p_base
                   when n <= 50 then p_base || '-' || n
                   else p_base || '-' || left(md5(random()::text || clock_timestamp()::text), 8) end;
    if app.slug_free_for(v_slug, p_tenant_id) then
      return v_slug;
    end if;
  end loop;
  return null;
end
$$;

create or replace function app.tenant_link_follows_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_base text;
  v_slug text;
begin
  if tg_op = 'INSERT' then
    -- Never another shop's old link: refused as taken, so create_personal_store tries its next
    -- address (-2 …) as it does when a shop has the link now.
    if new.slug is not null
       and exists (select 1 from app.shop_link_history h where h.slug = new.slug and h.tenant_id is distinct from new.id) then
      raise exception 'Another shop had the web address % before.', new.slug
        using errcode = '23505', hint = 'slug_unavailable';
    end if;
    return new;
  end if;

  -- An update that sets the link itself: the old one is still remembered.
  if new.slug is distinct from old.slug then
    if old.slug is not null and new.slug is not null then
      insert into app.shop_link_history (slug, tenant_id) values (old.slug, new.id)
      on conflict (slug) do update set tenant_id = excluded.tenant_id, retired_at = now();
    end if;
    return new;
  end if;

  if new.name is not distinct from old.name or old.slug is null then
    return new;
  end if;
  v_base := app.slug_for_name(new.name);
  if v_base is null then
    return new;
  end if;
  if old.slug = v_base or old.slug ~ ('^' || v_base || '-[0-9]+$') then
    return new;
  end if;
  v_slug := app.free_slug_from(v_base, new.id);
  if v_slug is null or v_slug = old.slug then
    return new;
  end if;
  insert into app.shop_link_history (slug, tenant_id) values (old.slug, new.id)
  on conflict (slug) do update set tenant_id = excluded.tenant_id, retired_at = now();
  new.slug := v_slug;
  return new;
end
$$;
revoke all on function app.tenant_link_follows_name() from public, anon, authenticated;

create or replace trigger tenants_link_follows_name
  before insert or update of name, slug on public.tenants
  for each row execute function app.tenant_link_follows_name();

-- The store page, by link: the shop's current link first, else a link it had before. The answer
-- carries the current slug, so a caller with an old one moves to it.
create or replace function public.get_storefront_tenant(p_slug text)
returns table(id text, name text, slug text, logo_url text, industry text, currency text, country text, phone text, address text, payment_qr_url text, payment_qr_label text, payment_reference text, settings jsonb, is_available boolean, chat_enabled boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with hit as (
    select t.id from public.tenants t where t.slug = p_slug
    union all
    select h.tenant_id from app.shop_link_history h
     where h.slug = p_slug
       and not exists (select 1 from public.tenants c where c.slug = p_slug)
    limit 1
  )
  select t.id, t.name, t.slug, t.logo_url, t.industry, t.currency, t.country,
         t.phone, t.address, t.payment_qr_url, t.payment_qr_label,
         t.payment_reference, t.settings, app.can_sell(t.id),
         app.entitled(t.id, 'can_use_storefront_chat')
    from hit
    join public.tenants t on t.id = hit.id
$$;
