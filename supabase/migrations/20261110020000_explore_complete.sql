-- Explore: suggestions while typing (Alvin, 10 Nov 2026: "Dum > words that have dum will be
-- suggested, nas > nasi lemak"). From the second letter typed, explore_complete returns up to six,
-- as [{ "type": "search", "text": "nasi lemak" }, { "type": "shop", "text": "Nasi Corner", "slug": "nasi-corner" }]:
-- - searches: one to three words in a row from listed items' names that start with what's typed
--   ("nas" → "nasi", "nasi lemak"), and whole names with a word that starts with it (after those:
--   "ayam nasi goreng"). Each is a search that finds something (explore_feed's rule: an item's
--   name or its shop's name contains it). Most liked and ordered first (orders in the last 60
--   days), then found in more listings, then shorter. When nothing typed matches, up to three
--   close spellings from 4 letters ("nasi lmak" → "nasi lemak", pg_trgm as explore_suggest).
-- - shops: up to two whose name has a word starting with what's typed (they open the shop).
-- Everything follows explore_feed's rules for what's listed and the chosen kind (Food, Home…);
-- Merchants (Explore's list of shops) gets shops only, as explore_merchants lists them.

create or replace function public.explore_complete(p_search text, p_kind text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(regexp_replace(lower(coalesce(p_search, '')), '\s+', ' ', 'g'));
  v_kind text := coalesce(p_kind, 'all');
  v_words integer;
  v_shops jsonb := '[]'::jsonb;
  v_searches jsonb := '[]'::jsonb;
  v_room integer;
begin
  if char_length(v_q) < 2 or char_length(v_q) > 60 then
    return '[]'::jsonb;
  end if;
  v_words := coalesce(array_length(regexp_split_to_array(v_q, ' '), 1), 0);

  -- Merchants: the shops Explore lists there, by a word of their name.
  if v_kind = 'merchants' then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'shop', 'text', m.shop_name, 'slug', m.shop_slug)
                              order by m.leading desc, m.item_count desc, m.shop_name), '[]'::jsonb)
      into v_shops
      from (
        select x.shop_name, x.shop_slug, x.item_count, starts_with(lower(x.shop_name), v_q) as leading
          from public.explore_merchants(v_q, 60, 0) x
         where starts_with(lower(x.shop_name), v_q) or strpos(' ' || lower(x.shop_name), ' ' || v_q) > 0
         order by 4 desc, x.item_count desc, x.shop_name
         limit 6
      ) m;
    return v_shops;
  end if;

  -- Shops (two at most) with listed items, by a word of their name.
  select coalesce(jsonb_agg(jsonb_build_object('type', 'shop', 'text', s.name, 'slug', s.slug)
                            order by s.leading desc, s.items desc, s.name), '[]'::jsonb)
    into v_shops
    from (
      select btrim(t.name) as name, t.slug, count(*) as items, starts_with(lower(btrim(t.name)), v_q) as leading
        from app.explore_listed(p_kind) l
        join public.tenants t on t.id = l.tenant_id
       where starts_with(lower(btrim(t.name)), v_q) or strpos(' ' || lower(btrim(t.name)), ' ' || v_q) > 0
       group by t.id, t.name, t.slug
       order by 4 desc, 3 desc, 1
       limit 2
    ) s;
  v_room := 6 - jsonb_array_length(v_shops);

  with listed as (
    select l.id, l.tenant_id, lower(l.name) as lname, lower(coalesce(l.shop_name, '')) as lshop,
           btrim(regexp_replace(lower(l.name), '\s+', ' ', 'g')) as full_name
      from app.explore_listed(p_kind) l
     where nullif(l.name, '') is not null
  ),
  phrases as (
    select distinct ph.phrase
      from listed li
      cross join lateral (select regexp_split_to_array(btrim(regexp_replace(li.lname, '[[:space:][:punct:]]+', ' ', 'g')), ' ') as words) w
      cross join lateral generate_series(1, 3) as n(len)
      cross join lateral generate_series(1, greatest(coalesce(array_length(w.words, 1), 0) - n.len + 1, 0)) as i(at)
      cross join lateral (select array_to_string(w.words[i.at:i.at + n.len - 1], ' ') as phrase) ph
     where char_length(ph.phrase) >= 2
  ),
  -- Typed so far: words that start with it, and whole names with a word that does.
  typed as (
    select p.phrase, true as typed, true as leading, 1::real as closeness
      from phrases p
     where p.phrase <> v_q
       and starts_with(p.phrase, v_q)
    union
    select li.full_name, true, starts_with(li.full_name, v_q), 1::real
      from listed li
     where li.full_name <> v_q
       and char_length(li.full_name) <= 60
       and (starts_with(li.full_name, v_q) or strpos(' ' || li.full_name, ' ' || v_q) > 0)
  ),
  -- A small slip (4 letters or more): the closest spellings.
  close_by as (
    select p.phrase, false as typed, false as leading,
           extensions.similarity(p.phrase, v_q) - 0.1 * abs(array_length(regexp_split_to_array(p.phrase, ' '), 1) - v_words) as closeness
      from phrases p
     where char_length(v_q) >= 4
       and p.phrase <> v_q
       and not exists (select 1 from typed t where t.phrase = p.phrase)
       and extensions.similarity(p.phrase, v_q) >= 0.35
  ),
  candidates as (
    select * from typed
    union all
    select * from close_by
  ),
  -- Each one a search that finds something (explore_feed: name or shop name contains it).
  found as (
    select c.phrase, c.typed, c.leading, c.closeness, li.id, li.tenant_id
      from candidates c
      join listed li on strpos(li.lname, c.phrase) > 0 or strpos(li.lshop, c.phrase) > 0
  ),
  liked as (
    select f.id,
           (select count(*) from public.listing_likes ll where ll.product_id = f.id)
           + (select count(*) from public.orders o
               where o.tenant_id = f.tenant_id
                 and o.created_date > now() - interval '60 days'
                 and jsonb_typeof(o.items) = 'array'
                 and o.items @> jsonb_build_array(jsonb_build_object('product_id', f.id))) as score
      from (select distinct found.id, found.tenant_id from found) f
  ),
  ranked as (
    select f.phrase, bool_or(f.typed) as typed, bool_or(f.leading) as leading, max(f.closeness) as closeness,
           sum(coalesce(k.score, 0)) as score, count(distinct f.id) as uses
      from found f
      left join liked k on k.id = f.id
     group by f.phrase
  ),
  picked as (
    -- What's typed (starting with it first); close spellings only when nothing typed matches.
    select r.*, row_number() over (order by r.typed desc, r.leading desc, r.score desc, r.uses desc,
                                            r.closeness desc, char_length(r.phrase), r.phrase) as at,
           count(*) filter (where r.typed) over () as typed_total
      from ranked r
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', 'search', 'text', p.phrase) order by p.at), '[]'::jsonb)
    into v_searches
    from picked p
   where p.at <= v_room
     and (p.typed or (p.typed_total = 0 and p.at <= 3));

  return v_searches || v_shops;
end $$;
revoke all on function public.explore_complete(text, text) from public;
grant execute on function public.explore_complete(text, text) to anon, authenticated, service_role;
