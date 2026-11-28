-- Explore's location pin (Alvin, 28 Nov 2026, after Taobao's: "a location icon that you can click
-- and immediately choose a country"): Explore can show one country. explore_search has taken a
-- country since step 1 of search (20261127231518_explore_search.sql), and lists the pin's
-- country's items in explore_feed's order. This gives the row of shops (explore_shops) and the
-- Merchants list (explore_merchants) the same p_country, matched the same way:
--   p_country   'Singapore' | 'Malaysia' | 'Indonesia' (tenants.country) | null = every country
-- Nothing else changes, and a call without p_country (the app before this release, older copies
-- of it, the website's worker, explore_complete) gets exactly the answer it got before.
--
-- A new argument makes a new function in Postgres, and two of each name with defaults would leave
-- the API unable to choose between them. So each new one is made beside the old one and the old
-- one dropped, in one transaction. Calls by name (the API's p_limit := 20) and by position
-- (explore_complete's explore_merchants(v_q, 60, 0)) reach the new ones.

create function public.explore_shops(p_limit integer default 20, p_country text default null)
 returns table(shop_id text, shop_name text, shop_slug text, shop_logo_url text, shop_type text, item_count bigint)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select t.id, btrim(t.name), t.slug, t.logo_url, t.seller_type, count(p.id)
    from public.tenants t
    join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
   where t.is_public
     and t.slug is not null
     and app.can_sell(t.id)
     and (p_country is null or t.country = p_country)
   group by t.id, t.name, t.slug, t.logo_url, t.seller_type
   order by max(p.created_date) desc nulls last, t.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

drop function public.explore_shops(integer);

revoke all on function public.explore_shops(integer, text) from public;
grant execute on function public.explore_shops(integer, text) to anon, authenticated, service_role;

create function public.explore_merchants(p_search text default null, p_limit integer default 24, p_offset integer default 0, p_country text default null)
 returns table(shop_id text, shop_name text, shop_slug text, shop_logo_url text, industry text, item_count bigint, preview_images text[], last_listed_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with q as (select nullif(lower(btrim(coalesce(p_search, ''))), '') as term)
  select t.id,
         btrim(t.name),
         t.slug,
         t.logo_url,
         t.industry,
         count(p.id),
         (array_agg(btrim(p.image_url) order by p.created_date desc nulls last, p.id)
            filter (where nullif(btrim(coalesce(p.image_url, '')), '') is not null))[1:4],
         max(p.created_date)
    from public.tenants t
    join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
   cross join q
   where t.is_public
     and t.slug is not null
     and t.seller_type = 'merchant'
     and app.can_sell(t.id)
     and (q.term is null or strpos(lower(coalesce(t.name, '')), q.term) > 0)
     and (p_country is null or t.country = p_country)
   group by t.id, t.name, t.slug, t.logo_url, t.industry
   order by max(p.created_date) desc nulls last, t.id
   limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0)
$function$;

drop function public.explore_merchants(text, integer, integer);

revoke all on function public.explore_merchants(text, integer, integer, text) from public;
grant execute on function public.explore_merchants(text, integer, integer, text) to anon, authenticated, service_role;
