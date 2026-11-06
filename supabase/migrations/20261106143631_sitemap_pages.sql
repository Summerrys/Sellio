-- sellio.sg/sitemap.xml lists every public shop and item, so search engines find each seller,
-- home or shop (Alvin, 6 Nov 2026: "every user, free home sellers or shop sellers, should be
-- discoverable on Google"). The website's worker (public/_worker.js) asks this function for the
-- addresses at most once an hour per Cloudflare location and writes the sitemap.
--
-- Listed:
--   - every shop that can sell (app.can_sell: open, plan in good standing, not closed for
--     deletion) and has at least one active item: its storefront, /store/<slug>. A shop hidden
--     from Sellio Explore is still listed: its storefront is public either way;
--   - the active items with a photo of shops listed on Explore (tenants.is_public), the items
--     Explore itself shows: /listing/<id>. An item page only opens for a listed shop.
-- Only slugs, item ids and dates, all already public through Explore and the storefronts.
-- At most 45,000 items, so the sitemap stays under Google's 50,000 addresses.
create or replace function public.sitemap_pages()
returns table (kind text, key text, lastmod timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  with shops as (
    select t.id, t.slug, coalesce(t.is_public, false) as listed,
           greatest(t.updated_date, max(p.updated_date)) as lastmod
      from public.tenants t
      join public.products p on p.tenant_id = t.id and coalesce(p.is_active, true)
     where nullif(btrim(coalesce(t.slug, '')), '') is not null and app.can_sell(t.id)
     group by t.id, t.slug, t.is_public, t.updated_date
  )
  (select 'shop'::text, s.slug, s.lastmod from shops s order by s.lastmod desc nulls last, s.slug)
  union all
  (select 'item'::text, p.id, p.updated_date
     from public.products p
     join shops s on s.id = p.tenant_id and s.listed
    where coalesce(p.is_active, true) and nullif(btrim(coalesce(p.image_url, '')), '') is not null
    order by p.updated_date desc nulls last, p.id
    limit 45000)
$$;

revoke all on function public.sitemap_pages() from public;
grant execute on function public.sitemap_pages() to anon, authenticated, service_role;
