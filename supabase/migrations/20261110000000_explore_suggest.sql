-- Explore search that forgives typos (UX states, 6: approved by Alvin, 9 Nov 2026). When a
-- search on Explore finds nothing, Explore asks explore_suggest for the likely spelling ("Did you
-- mean nasi lemak?") and for popular listings to try instead.
-- - The suggestion: the words (one to three in a row) from listed items' names and their shops'
--   names that look most like the search (pg_trgm similarity, at least 0.35, less 0.1 for each
--   word more or fewer than the search has: "fish oyl" is "fish oil", not "fish"), and that the
--   same search would find (explore_feed, or explore_merchants for Merchants). Ties: more
--   listings, then shorter. Searches under 3 letters get none.
-- - Popular on Sellio: the listings most liked and ordered in the last 60 days (newest first
--   among equals), five names at most.
-- Both follow explore_feed's rules for what is listed, and the chosen kind (Food, Goods, Home…).

create extension if not exists pg_trgm with schema extensions;

-- What Explore lists (explore_feed's rules), for a kind: each listing's name and its shop's name.
create or replace function app.explore_listed(p_kind text)
returns table(id text, tenant_id text, name text, shop_name text, created_date timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, t.id, btrim(p.name), btrim(t.name), p.created_date
    from public.products p
    join public.tenants t on t.id = p.tenant_id
   where t.is_public
     and t.slug is not null
     and app.can_sell(t.id)
     and coalesce(p.is_active, true)
     and nullif(btrim(coalesce(p.image_url, '')), '') is not null
     and (case coalesce(p_kind, 'all')
            when 'food'      then coalesce(t.industry, '') = 'f&b'
            when 'goods'     then nullif(btrim(coalesce(t.industry, '')), '') is not null and t.industry <> 'f&b'
            when 'home'      then t.seller_type = 'individual'
            when 'shops'     then t.seller_type = 'merchant'
            when 'merchants' then t.seller_type = 'merchant'
            else true
          end)
$$;
revoke all on function app.explore_listed(text) from public, anon, authenticated;

create or replace function public.explore_suggest(p_search text, p_kind text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(regexp_replace(lower(coalesce(p_search, '')), '\s+', ' ', 'g'));
  v_kind text := coalesce(p_kind, 'all');
  v_words integer := coalesce(array_length(regexp_split_to_array(btrim(regexp_replace(lower(coalesce(p_search, '')), '\s+', ' ', 'g')), ' '), 1), 0);
  v_suggestion text;
  v_popular jsonb;
  c record;
begin
  select coalesce(jsonb_agg(x.name order by x.score desc, x.latest desc nulls last, x.name), '[]'::jsonb)
    into v_popular
    from (
      select min(l.name) as name,
             sum((select count(*) from public.listing_likes ll where ll.product_id = l.id)
               + (select count(*) from public.orders o
                   where o.tenant_id = l.tenant_id
                     and o.created_date > now() - interval '60 days'
                     and jsonb_typeof(o.items) = 'array'
                     and o.items @> jsonb_build_array(jsonb_build_object('product_id', l.id)))) as score,
             max(l.created_date) as latest
        from app.explore_listed(p_kind) l
       where nullif(l.name, '') is not null
       group by lower(l.name)
       order by 2 desc, 3 desc nulls last, 1
       limit 5
    ) x;

  if char_length(v_q) >= 3 then
    for c in
      select ph.phrase,
             extensions.similarity(ph.phrase, v_q)
               - 0.1 * abs(array_length(regexp_split_to_array(ph.phrase, ' '), 1) - v_words) as score,
             count(*) as uses
        from app.explore_listed(p_kind) l
        cross join lateral unnest(array[l.name, l.shop_name]) as src(text)
        cross join lateral (select regexp_split_to_array(lower(btrim(src.text)), '\s+') as words) w
        cross join lateral generate_series(1, 3) as n(len)
        cross join lateral generate_series(1, greatest(coalesce(array_length(w.words, 1), 0) - n.len + 1, 0)) as i(at)
        cross join lateral (select array_to_string(w.words[i.at:i.at + n.len - 1], ' ') as phrase) ph
       where ph.phrase <> v_q
         and char_length(ph.phrase) >= 3
       group by ph.phrase
      having extensions.similarity(ph.phrase, v_q) >= 0.35
       order by score desc, uses desc, char_length(ph.phrase), ph.phrase
       limit 8
    loop
      -- Only a spelling the same search would find.
      if (v_kind = 'merchants' and exists (select 1 from public.explore_merchants(c.phrase, 1, 0)))
         or (v_kind <> 'merchants' and exists (select 1 from public.explore_feed(c.phrase, p_kind, 1, 0))) then
        v_suggestion := c.phrase;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object('suggestion', v_suggestion, 'popular', v_popular);
end $$;
revoke all on function public.explore_suggest(text, text) from public;
grant execute on function public.explore_suggest(text, text) to anon, authenticated, service_role;
