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

// One canonical order for Products management, Design Store preview and the
// public storefront. New products appear first; the ID tiebreaker makes rows
// deterministic even when an import creates several products simultaneously.
export function applyCanonicalProductOrder(query) {
  return query
    .order('created_date', { ascending: false })
    .order('id', { ascending: true });
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
