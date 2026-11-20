-- Products keep the order they were entered in (20 Nov 2026).
--
-- A scanned menu saves all its items in one go, so they all had the same created_date, and the
-- lists (newest first, then by id) showed them in a random order: Cafelicious's drinks came out
-- Lemonade, Iced Tea, Coffee… instead of the menu's Soft Drinks, Iced Tea, Lemonade…. A CSV
-- import came out in reverse (one row at a time, newest first).
--
-- Now the scan and the CSV import number their items in order, after the shop's highest number,
-- and the lists sort by sort_order, then newest first, then id (src/lib/storefrontCatalog.js,
-- applyCanonicalProductOrder: Products, Counter, Design Store and the storefront). Items added
-- one at a time keep 0, so they stay at the top of their section as before; every existing
-- product is 0, so nothing moves until it is numbered.
alter table public.products add column if not exists sort_order integer not null default 0;

comment on column public.products.sort_order is
  'Place in the shop''s menu. Lists sort by sort_order, then created_date desc, then id. A scanned menu or an imported list numbers its items in their order; an item added on its own is 0.';

-- The public storefront reads products as anon, which may read only the columns granted to it.
-- Sorting by sort_order needs it too, or every storefront's catalogue would fail to load.
grant select (sort_order) on public.products to anon;
