// Shared storefront catalogue queries.
//
// Design Store preview and the public storefront must use this exact loader so
// product visibility, ordering, images, inventory and variants cannot drift.
export const STOREFRONT_PRODUCT_FIELDS = [
  'id',
  'created_date',
  'name',
  'description',
  'price',
  'compare_at_price',
  'image_url',
  'images',
  'image_credits',
  'category_id',
  'is_featured',
  'is_active',
  'stock_quantity',
  'track_inventory',
  'low_stock_threshold',
  'variants',
  'tags',
].join(', ');

export const STOREFRONT_CATEGORY_FIELDS = 'id, name, slug, sort_order';

// One canonical order for Products management, the Counter, Design Store preview
// and the public storefront: the menu's own order first (sort_order: a scanned
// menu or an imported list numbers its items in their order, 20 Nov 2026), then
// new products first (an item added on its own is 0, so it stays at the top of
// its section, as before). The ID tiebreaker makes rows deterministic.
export function applyCanonicalProductOrder(query) {
  return query
    .order('sort_order', { ascending: true })
    .order('created_date', { ascending: false })
    .order('id', { ascending: true });
}

// The number after the highest sort_order in `rows` (none: 1), for items added in
// a list's own order (a scanned menu, an imported file).
export function nextSortOrder(rows) {
  return (rows || []).reduce((max, row) => Math.max(max, Number(row?.sort_order) || 0), 0) + 1;
}

export async function fetchStorefrontCatalog(supabase, tenantId) {
  const [productsRes, categoriesRes] = await Promise.all([
    applyCanonicalProductOrder(
      supabase
        .from('products')
        .select(STOREFRONT_PRODUCT_FIELDS)
        .eq('tenant_id', tenantId)
        .or('is_active.eq.true,is_active.is.null')
    ),
    supabase
      .from('categories')
      .select(STOREFRONT_CATEGORY_FIELDS)
      .eq('tenant_id', tenantId)
      .or('is_active.eq.true,is_active.is.null')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  return {
    products: productsRes.data || [],
    categories: categoriesRes.data || [],
  };
}
