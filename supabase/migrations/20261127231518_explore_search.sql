-- Explore search, step 1 (Alvin, 26 Nov 2026: "two steps … Meet-up. Search can be all."): the
-- results page behind Explore's search box, with its sort and filters. Step 2 (item condition,
-- and Nearby from a list of towns) comes later, once listings carry that information.
--
-- explore_search returns the same columns as explore_feed, plus total_count (how many listings
-- match, whatever the page; the filter sheet's "Show 12 results" asks for one row to learn it).
-- What it lists follows explore_feed's rules exactly: a public shop with an address on Sellio
-- that may sell (app.can_sell), an active item with a photo. On top of that:
--   p_search    an item's name or its shop's name contains it (as explore_feed); null = everything
--   p_kind      'food' | 'goods' | 'home' | 'merchants' (items from business shops) | null = all,
--               the same categories as explore_feed
--   p_deal      {'meetup','delivery'}: items whose shop offers any of those; null or {} = any.
--               Meet-up: a home shop's self-collection (app.shop_selling, as app.shop_selling_for
--               reads it: on unless the shop saved it off), and a business's takeaway. Delivery:
--               a home shop that delivers (business shops have no delivery)
--   p_country   'Singapore' | 'Malaysia' | 'Indonesia' (tenants.country) | null = every country
--   p_currency  the buyer's currency ('SGD', 'MYR', 'IDR'). A price range (p_min / p_max, either
--               may be null) only matches items priced in it: S$10 and RM10 aren't the same
--               money, and nothing here converts between them. The price sorts list items in
--               it first, then the others, each by its own price
--   p_sort      'best' (default; anything unknown is 'best') | 'recent' | 'price_asc' | 'price_desc'.
--               Best match, with a search: the whole name is the search, then the search as
--               whole words, then words starting with it, then anywhere in the name, then the
--               shop's name only; ties by likes, then newest. With no search, best is
--               explore_feed's order (each shop's newest first, interleaved so one shop can't
--               fill the page)
--   p_limit     1–60 (default 24), p_offset >= 0

create or replace function public.explore_search(
  p_search text default null,
  p_kind text default null,
  p_sort text default 'best',
  p_deal text[] default null,
  p_country text default null,
  p_currency text default 'SGD',
  p_min numeric default null,
  p_max numeric default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(product_id text, product_name text, price numeric, compare_at_price numeric, image_url text,
              listed_at timestamp with time zone, shop_id text, shop_name text, shop_slug text, shop_logo_url text,
              shop_type text, currency text, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select nullif(lower(btrim(coalesce(p_search, ''))), '') as term,
           nullif(btrim(regexp_replace(lower(coalesce(p_search, '')), '[^[:alnum:]]+', ' ', 'g')), '') as words,
           upper(coalesce(nullif(btrim(p_currency), ''), 'SGD')) as cur,
           coalesce(p_deal, '{}'::text[]) as deal,
           case when p_sort in ('recent', 'price_asc', 'price_desc') then p_sort else 'best' end as sort
  ),
  items as (
    select p.id,
           btrim(p.name) as name,
           p.price,
           p.compare_at_price,
           btrim(p.image_url) as image_url,
           p.created_date,
           t.id as shop_id,
           btrim(t.name) as shop_name,
           t.slug,
           t.logo_url,
           t.seller_type,
           coalesce(t.currency, 'SGD') as currency,
           row_number() over (partition by t.id order by p.created_date desc nulls last, p.id) as shop_rank,
           ' ' || btrim(regexp_replace(lower(coalesce(p.name, '')), '[^[:alnum:]]+', ' ', 'g')) || ' ' as name_words
      from public.products p
      join public.tenants t on t.id = p.tenant_id
      left join app.shop_selling s on s.tenant_id = t.id and s.settings_saved
     cross join q
     where t.is_public
       and t.slug is not null
       and app.can_sell(t.id)
       and coalesce(p.is_active, true)
       and nullif(btrim(coalesce(p.image_url, '')), '') is not null
       and (q.term is null
            or strpos(lower(coalesce(p.name, '')), q.term) > 0
            or strpos(lower(coalesce(t.name, '')), q.term) > 0)
       and (case coalesce(p_kind, 'all')
              when 'food'      then coalesce(t.industry, '') = 'f&b'
              when 'goods'     then nullif(btrim(coalesce(t.industry, '')), '') is not null and t.industry <> 'f&b'
              when 'home'      then t.seller_type = 'individual'
              when 'shops'     then t.seller_type = 'merchant'
              when 'merchants' then t.seller_type = 'merchant'
              else true
            end)
       and (p_country is null or t.country = p_country)
       and (cardinality(q.deal) = 0
            or ('meetup' = any(q.deal)
                and (t.seller_type = 'merchant' or (t.seller_type = 'individual' and coalesce(s.collection_enabled, true))))
            or ('delivery' = any(q.deal)
                and t.seller_type = 'individual' and coalesce(s.delivery_enabled, false)))
       and ((p_min is null and p_max is null)
            or (coalesce(t.currency, 'SGD') = q.cur
                and (p_min is null or p.price >= p_min)
                and (p_max is null or p.price <= p_max)))
  ),
  ranked as (
    select i.*,
           case when q.term is null then 0
                when lower(i.name) = q.term then 5
                when q.words is not null and strpos(i.name_words, ' ' || q.words || ' ') > 0 then 4
                when q.words is not null and strpos(i.name_words, ' ' || q.words) > 0 then 3
                when strpos(lower(i.name), q.term) > 0 then 2
                else 1
           end as match_rank,
           (select count(*) from public.listing_likes ll where ll.product_id = i.id) as likes
      from items i
     cross join q
  )
  select r.id, r.name, r.price, r.compare_at_price, r.image_url, r.created_date,
         r.shop_id, r.shop_name, r.slug, r.logo_url, r.seller_type, r.currency,
         count(*) over () as total_count
    from ranked r
   cross join q
   order by
     case when q.sort in ('price_asc', 'price_desc') then r.currency = q.cur end desc nulls last,
     case when q.sort = 'price_asc' then r.price end asc nulls last,
     case when q.sort = 'price_desc' then r.price end desc nulls last,
     case when q.sort = 'best' and q.term is not null then r.match_rank end desc nulls last,
     case when q.sort = 'best' and q.term is not null then r.likes end desc nulls last,
     case when q.sort = 'best' and q.term is null then r.shop_rank end asc nulls last,
     r.created_date desc nulls last,
     r.id
   limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.explore_search(text, text, text, text[], text, text, numeric, numeric, integer, integer) from public;
grant execute on function public.explore_search(text, text, text, text[], text, text, numeric, numeric, integer, integer) to anon, authenticated, service_role;
