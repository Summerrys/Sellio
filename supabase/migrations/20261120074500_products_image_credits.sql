-- Credit for photos a shop didn't take (Alvin, 20 Nov 2026: "go ahead and credit Unsplash
-- photographers"). A sample photo from Unsplash is shown from Unsplash's own address (their
-- API guidelines: hotlinked, never copied) and with its photographer's credit:
--   products.image_credits = { "<image url>": { "source": "unsplash", "name": "Jane Doe",
--     "profile": "https://unsplash.com/@jane?utm_source=sellio&utm_medium=referral",
--     "photo": "https://unsplash.com/photos/abc?utm_source=sellio&utm_medium=referral" } }
-- The storefront reads it as anon (a column grant, as for the other columns it shows), and
-- Explore's item page through explore_item, which now returns it with the product.
alter table public.products add column if not exists image_credits jsonb;
comment on column public.products.image_credits is
  'Credits for photos the shop did not take, by image URL: { "<url>": { "source": "unsplash", "name", "profile", "photo" } }. Shown with the photo as "Photo by <name> on Unsplash".';
grant select (image_credits) on public.products to anon;

-- explore_item: the same, with the product's image_credits.
do $$
declare
  v text;
begin
  v := pg_get_functiondef('public.explore_item(text)'::regprocedure);
  v := replace(v, 'p.image_url, p.images, p.created_date, p.variants,', 'p.image_url, p.images, p.image_credits, p.created_date, p.variants,');
  v := replace(v, '''sold_out'', r.sold_out,', '''image_credits'', coalesce(r.image_credits, ''{}''::jsonb), ''sold_out'', r.sold_out,');
  if position('p.image_credits' in v) = 0 or position('''image_credits''' in v) = 0 then
    raise exception 'explore_item: its definition changed; image_credits not added';
  end if;
  execute v;
end $$;
