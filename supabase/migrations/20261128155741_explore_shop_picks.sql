-- Shops on Sellio as cards (Alvin, 28 Nov 2026, after Taobao's shop cards: "Carousel", and for
-- this change "Proceed"): each shop in explore_shops also brings its currency and its three newest
-- listings with a photo, newest first, as picks: [{id, name, price, image_url}]. They are listings
-- Explore itself would show for the shop (explore_feed's rule: active, with a photo, from a listed
-- shop that is allowed to sell), so a card can show them with their prices without asking again.
-- A shop whose active listings have no photos comes with picks [] (it is listed as before).
--
-- Postgres can't change the columns a function returns in place, so it is dropped and made again
-- with the same arguments, in this one transaction, and given back to the same roles. The first
-- six columns are exactly as before: callers that read them by name (the app before this release,
-- the website's worker) get the same answer, with two more fields beside it.

drop function public.explore_shops(integer, text);

create function public.explore_shops(p_limit integer default 20, p_country text default null)
 returns table(shop_id text, shop_name text, shop_slug text, shop_logo_url text, shop_type text, item_count bigint, currency text, picks jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with shops as (
    select t.id, btrim(t.name) as name, t.slug, t.logo_url, t.seller_type,
           count(p.id) as item_count,
           coalesce(t.currency, 'SGD') as currency,
           max(p.created_date) as last_listed
      from public.tenants t
      join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
     where t.is_public
       and t.slug is not null
       and app.can_sell(t.id)
       and (p_country is null or t.country = p_country)
     group by t.id, t.name, t.slug, t.logo_url, t.seller_type, t.currency
     order by max(p.created_date) desc nulls last, t.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select s.id, s.name, s.slug, s.logo_url, s.seller_type, s.item_count, s.currency,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'price', x.price, 'image_url', x.image_url)
                            order by x.created_date desc nulls last, x.id)
             from (select p.id, btrim(p.name) as name, p.price, btrim(p.image_url) as image_url, p.created_date
                     from public.products p
                    where p.tenant_id = s.id
                      and coalesce(p.is_active, true)
                      and nullif(btrim(coalesce(p.image_url, '')), '') is not null
                    order by p.created_date desc nulls last, p.id
                    limit 3) x
         ), '[]'::jsonb)
    from shops s
   order by s.last_listed desc nulls last, s.id
$function$;

revoke all on function public.explore_shops(integer, text) from public;
grant execute on function public.explore_shops(integer, text) to anon, authenticated, service_role;
