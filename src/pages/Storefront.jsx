import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabaseClient';

export default function Storefront() {
  const { tenantSlug, tableId } = useParams();
  const isDineIn = !!tableId;

  const [tenant, setTenant] = useState(null);
  const [theme, setTheme] = useState(null);
  const [storefrontConfig, setStorefrontConfig] = useState(null);
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCart, setLastCart] = useState([]);
  const [lastCartTotal, setLastCartTotal] = useState(0);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [checkoutForm, setCheckoutForm] = useState({
    name: '', phone: '', notes: '', orderType: isDineIn ? 'dine_in' : 'takeaway', tableNumber: '', address: ''
  });

  useEffect(() => {
    async function loadData() {
      const supabase = await getSupabase();

      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, name, slug, logo_url, industry, currency, country, phone, payment_qr_url, payment_qr_label, payment_reference, settings')
        .eq('slug', tenantSlug)
        .single();

      if (!tenantData) { setNotFound(true); setLoading(false); return; }
      setTenant(tenantData);
      const tenantId = tenantData.id;

      const [themeRes, storefrontRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('theme_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('storefront_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('categories').select('id, name, slug, sort_order').eq('tenant_id', tenantId).or('is_active.eq.true,is_active.is.null').order('sort_order'),
        supabase.from('products')
          .select('id, name, description, price, compare_at_price, image_url, images, category_id, is_featured, is_active, stock_quantity, track_inventory, low_stock_threshold, variants, tags')
          .eq('tenant_id', tenantId)
          .or('is_active.eq.true,is_active.is.null'),
      ]);

      setTheme(themeRes.data);
      setStorefrontConfig(storefrontRes.data);
      setCategories(categoriesRes.data || []);
      setProducts(productsRes.data || []);
      console.log('[Storefront] tenant.id:', tenantId, 'products:', productsRes.data?.length ?? 0, productsRes.error || '');
      console.log('PRODUCTS RAW:', JSON.stringify(productsRes.data?.slice(0,2)));
      console.log('PRODUCTS ERROR FULL:', JSON.stringify(productsRes.error));
      console.log('CATEGORIES RAW:', JSON.stringify(categoriesRes.data));
      if (productsRes.error) console.error('[Storefront] products error:', productsRes.error);

      if (tableId) {
        const { data: tableData } = await supabase
          .from('tables').select('id, name, zone, capacity')
          .eq('id', tableId).eq('tenant_id', tenantId).single();
        setTable(tableData);
      }

      setLoading(false);
    }
    loadData();
  }, [tenantSlug, tableId]);

  const primaryColor = theme?.primary_color || '#6366f1';
  const accentColor = theme?.accent_color || '#f59e0b';
  const fontFamily = storefrontConfig?.font_family || theme?.font_family || 'Inter';
  const currency = tenant?.currency || 'SGD';
  const isFnB = /f&b|cafe|restaurant|food|beverage/i.test(tenant?.industry || '');
  const showStockBadge = storefrontConfig?.show_stock_badge !== false;

  // Init table session when customer lands on ordering page
  useEffect(() => {
    const initSession = async () => {
      if (!tableId || !tenantSlug) return;
      const supabase = await getSupabase();
      const { data: tenantData } = await supabase
        .from('tenants').select('id').eq('slug', tenantSlug).single();
      if (!tenantData) return;
      const tenantId = tenantData.id;

      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('table_id', tableId)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle();

      if (!existingSession) {
        const { data: newSession } = await supabase
          .from('table_sessions')
          .insert({
            tenant_id: tenantId,
            table_id: tableId,
            table_name: table?.name || null,
            status: 'active',
            started_at: new Date().toISOString(),
            order_ids: [],
            total_amount: 0,
          })
          .select()
          .single();

        await supabase
          .from('tables')
          .update({
            status: 'occupied',
            current_order_id: newSession?.id || null,
            updated_date: new Date().toISOString(),
          })
          .eq('id', tableId)
          .eq('tenant_id', tenantId)
          .eq('status', 'available');
      }
    };
    initSession();
  }, [tableId, tenantSlug, table?.name]);

  useEffect(() => {
    if (!tenant) return;
    document.documentElement.style.setProperty('--sf-primary', primaryColor);
    document.documentElement.style.setProperty('--sf-accent', accentColor);
    document.documentElement.style.setProperty('--sf-font', fontFamily);
    document.title = `${tenant.name} — Order Online`;
  }, [primaryColor, accentColor, fontFamily, tenant]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  const featuredProducts = products.filter(p => p.is_featured === true);
  const filteredProducts = products.filter(p =>
    p.is_featured !== true && (selectedCategory === null || p.category_id === selectedCategory)
  );

  const addToCart = (product, variant = null) => {
    const key = `${product.id}-${variant?.label || 'default'}`;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        key, product_id: product.id, name: product.name,
        price: product.price + (variant?.price_modifier || 0),
        image_url: product.image_url, quantity: 1,
        variant: variant?.label || null,
      }];
    });
  };

  const updateQuantity = (key, qty) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.key !== key));
    else setCart(prev => prev.map(i => i.key === key ? { ...i, quantity: qty } : i));
  };

  const handleSubmitOrder = async () => {
    if (!checkoutForm.name || !checkoutForm.phone) return;
    setIsSubmitting(true);
    const supabase = await getSupabase();
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const savedCartTotal = cartTotal;
    const savedCart = [...cart];

    const { data: order, error } = await supabase.from('orders').insert({
      tenant_id: tenant.id,
      order_number: orderNumber,
      status: 'pending',
      type: isDineIn ? 'dine_in' : checkoutForm.orderType,
      table_id: tableId || null,
      table_name: table?.name || checkoutForm.tableNumber || null,
      customer_name: checkoutForm.name,
      customer_phone: checkoutForm.phone,
      notes: checkoutForm.notes || null,
      items: savedCart,
      subtotal: savedCartTotal,
      total_amount: savedCartTotal,
      payment_status: 'unpaid',
      payment_method: 'pending',
    }).select().single();

    if (!error && order) {
      await supabase.from('order_items').insert(
        savedCart.map(item => ({
          tenant_id: tenant.id,
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.name,
          variant_name: item.variant || null,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
        }))
      );
      setLastCart(savedCart);
      setLastCartTotal(savedCartTotal);
      setPlacedOrderNumber(orderNumber);
      setCart([]);
      setShowCheckout(false);
      setIsSubmitting(false);
      setOrderSuccess(true);
    } else {
      setIsSubmitting(false);
      alert('Something went wrong. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading menu...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 48, margin: 0 }}>🔍</p>
        <p style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>Store not found</p>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>The store you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: `var(--sf-font, Inter), sans-serif`, maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#ffffff', position: 'relative' }}>

      {/* Announcement bar */}
      {storefrontConfig?.show_announcement_bar && storefrontConfig?.announcement_text && (
        <div style={{ background: primaryColor, color: 'white', textAlign: 'center', padding: '8px 16px', fontSize: 12, fontWeight: 500 }}>
          {storefrontConfig.announcement_text}
        </div>
      )}

      {/* Hero banner */}
      <div style={{
        background: storefrontConfig?.banner_bg_image_url
          ? `url(${storefrontConfig.banner_bg_image_url}) center/cover no-repeat`
          : (storefrontConfig?.banner_bg_color || primaryColor),
        padding: storefrontConfig?.banner_height === 'large' ? '48px 20px 32px'
               : storefrontConfig?.banner_height === 'small' ? '20px 20px 16px'
               : '32px 20px 20px',
        position: 'relative',
      }}>
        {storefrontConfig?.banner_bg_image_url && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 0 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {tenant.logo_url && (
                <img src={tenant.logo_url} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
              )}
              <div>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 17, margin: 0 }}>{tenant.name}</p>
                {storefrontConfig?.banner_tagline && (
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '2px 0 0' }}>{storefrontConfig.banner_tagline}</p>
                )}
              </div>
            </div>
            <button onClick={() => setShowCart(true)} style={{
              position: 'relative', background: 'rgba(255,255,255,0.2)',
              border: 'none', borderRadius: '50%', width: 42, height: 42,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              {cartCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  background: accentColor, color: 'white', borderRadius: '50%',
                  width: 18, height: 18, fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{cartCount}</span>
              )}
            </button>
          </div>

          {isDineIn && table && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.2)', borderRadius: 999,
              padding: '4px 12px', marginBottom: 8
            }}>
              <span style={{ color: 'white', fontSize: 13 }}>🪑</span>
              <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{table.name}</span>
            </div>
          )}

          {storefrontConfig?.banner_headline && (
            <p style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '8px 0 0', lineHeight: 1.3 }}>
              {storefrontConfig.banner_headline}
            </p>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {storefrontConfig?.show_category_tabs !== false && categories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '0.5px solid #e5e7eb' }}>
          {[{ id: null, name: 'All' }, ...categories].map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
              flexShrink: 0, padding: '6px 16px', borderRadius: 999,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
              background: selectedCategory === cat.id ? primaryColor : '#f1f5f9',
              color: selectedCategory === cat.id ? 'white' : '#64748b',
              transition: 'all 0.15s ease'
            }}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Featured section */}
      {storefrontConfig?.show_featured !== false && featuredProducts.length > 0 && (
        <div style={{ padding: '16px 16px 8px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
            {storefrontConfig?.featured_section_title || "Today's Picks"} ⭐
          </p>
          {featuredProducts.map(product => {
            const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
            return (
              <div key={product.id} onClick={() => setSelectedProduct(product)} style={{
                display: 'flex', background: '#f8fafc',
                borderRadius: 14, overflow: 'hidden', marginBottom: 10,
                border: '0.5px solid #e5e7eb', cursor: 'pointer'
              }}>
                {product.image_url && (
                  <img src={product.image_url} style={{ width: 110, height: 110, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 3px', color: '#0f172a' }}>{product.name}</p>
                    {storefrontConfig?.show_product_description !== false && product.description && (
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <div>
                      {product.compare_at_price > product.price && (
                        <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through', marginRight: 4 }}>
                          {currency} {parseFloat(product.compare_at_price).toFixed(2)}
                        </span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 700, color: primaryColor }}>
                        {currency} {parseFloat(product.price).toFixed(2)}
                      </span>
                    </div>
                    {isOutOfStock && showStockBadge ? (
                      <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '4px 10px', borderRadius: 999 }}>Sold out</span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); addToCart(product); }} style={{
                        background: primaryColor, color: 'white', border: 'none',
                        borderRadius: 8, padding: '6px 14px', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer'
                      }}>Add +</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Products section */}
      <div style={{ padding: '8px 16px 100px' }}>
        {featuredProducts.length > 0 && filteredProducts.length > 0 && (
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>All items</p>
        )}

        {/* Grid layout (default) */}
        {(storefrontConfig?.product_layout === 'grid' || !storefrontConfig?.product_layout) && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${storefrontConfig?.products_per_row || 2}, 1fr)`, gap: 10 }}>
            {filteredProducts.map(product => {
                const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
                const isLowStock = showStockBadge && product.track_inventory && product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold;
               return (
                 <div key={product.id} onClick={() => setSelectedProduct(product)}
                   style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer' }}>
                   <div style={{ position: 'relative' }}>
                     {product.image_url
                       ? <img src={product.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                       : <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛍️</div>
                     }
                     {isOutOfStock && showStockBadge && (
                       <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <span style={{ color: 'white', fontWeight: 700, fontSize: 12 }}>Sold out</span>
                       </div>
                     )}
                     {isLowStock && (
                       <div style={{ position: 'absolute', top: 6, right: 6 }}>
                         <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>Low stock</span>
                       </div>
                     )}
                   </div>
                  <div style={{ padding: 10 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{product.name}</p>
                    {storefrontConfig?.show_product_description !== false && product.description && (
                      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.description}</p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
                      {!isOutOfStock && (
                        <button onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, color: 'white', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List layout */}
        {storefrontConfig?.product_layout === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredProducts.map(product => {
              const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
              return (
                <div key={product.id} onClick={() => setSelectedProduct(product)}
                  style={{ display: 'flex', gap: 12, background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer' }}>
                  {product.image_url
                    ? <img src={product.image_url} style={{ width: 88, height: 88, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 88, height: 88, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🛍️</div>
                  }
                  <div style={{ flex: 1, padding: '10px 10px 10px 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 2px', color: '#0f172a' }}>{product.name}</p>
                      {storefrontConfig?.show_product_description !== false && product.description && (
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.description}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
                      {isOutOfStock
                        ? <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Sold out</span>
                        : <button onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                            style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add +</button>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Carousel layout */}
        {storefrontConfig?.product_layout === 'carousel' && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 8 }}>
            {filteredProducts.map(product => {
              const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
              return (
                <div key={product.id} onClick={() => setSelectedProduct(product)}
                  style={{ flexShrink: 0, width: 160, background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer' }}>
                  {product.image_url
                    ? <img src={product.image_url} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: 140, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛍️</div>
                  }
                  <div style={{ padding: 10 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{product.name}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
                      {!isOutOfStock && (
                        <button onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                          style={{ width: 26, height: 26, borderRadius: '50%', background: primaryColor, color: 'white', border: 'none', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredProducts.length === 0 && featuredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}>🛍️</p>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No products found</p>
          </div>
        )}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>
          <button onClick={() => setShowCart(true)} style={{
            background: primaryColor, color: 'white', border: 'none',
            borderRadius: 999, padding: '14px 28px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{cartCount}</span>
            View order · {currency} {cartTotal.toFixed(2)}
          </button>
        </div>
      )}

      {/* Product detail modal */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => { setSelectedProduct(null); setSelectedVariants({}); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#fff', borderRadius: '20px 20px 0 0',
            maxHeight: '85vh', overflowY: 'auto'
          }}>
            {selectedProduct.image_url && (
              <img src={selectedProduct.image_url} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
            )}
            <div style={{ padding: '20px 16px' }}>
              <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px', color: '#0f172a' }}>{selectedProduct.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {selectedProduct.compare_at_price > selectedProduct.price && (
                  <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' }}>
                    {currency} {parseFloat(selectedProduct.compare_at_price).toFixed(2)}
                  </span>
                )}
                <span style={{ fontSize: 20, fontWeight: 700, color: primaryColor }}>
                  {currency} {parseFloat(selectedProduct.price).toFixed(2)}
                </span>
              </div>
              {selectedProduct.description && (
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>{selectedProduct.description}</p>
              )}

              {/* Variants */}
              {selectedProduct.variants?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {selectedProduct.variants.map((group, gi) => (
                    <div key={gi} style={{ marginBottom: 14 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: '#0f172a' }}>{group.name}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {group.options?.map((opt, oi) => (
                          <button key={oi} onClick={() => setSelectedVariants(prev => ({ ...prev, [gi]: opt }))}
                            style={{
                              padding: '6px 14px', borderRadius: 8, fontSize: 13,
                              border: selectedVariants[gi]?.label === opt.label ? `2px solid ${primaryColor}` : '0.5px solid #e5e7eb',
                              background: selectedVariants[gi]?.label === opt.label ? '#f1f5f9' : 'none',
                              cursor: 'pointer', fontWeight: 500, color: '#0f172a'
                            }}>
                            {opt.label}{opt.price_modifier > 0 ? ` +${currency} ${opt.price_modifier.toFixed(2)}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  const combinedVariant = Object.values(selectedVariants).length > 0
                    ? { label: Object.values(selectedVariants).map(v => v.label).join(', '), price_modifier: Object.values(selectedVariants).reduce((sum, v) => sum + (v.price_modifier || 0), 0) }
                    : null;
                  addToCart(selectedProduct, combinedVariant);
                  setSelectedProduct(null);
                  setSelectedVariants({});
                }}
                style={{
                  width: '100%', padding: 14, background: primaryColor, color: 'white',
                  border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer'
                }}>
                Add to order · {currency} {(parseFloat(selectedProduct.price) + Object.values(selectedVariants).reduce((sum, v) => sum + (v.price_modifier || 0), 0)).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setShowCart(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px',
            maxHeight: '80vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>Your order</p>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>
            {isDineIn && table && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>🪑</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{table.name}</span>
              </div>
            )}
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🛒</p>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>Your cart is empty</p>
              </div>
            ) : (
              <>
                {cart.map(item => (
                  <div key={item.key} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '0.5px solid #e5e7eb' }}>
                    {item.image_url && <img src={item.image_url} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', color: '#0f172a' }}>{item.name}</p>
                      {item.variant && <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px' }}>{item.variant}</p>}
                      <p style={{ fontWeight: 700, fontSize: 13, color: primaryColor, margin: 0 }}>{currency} {(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => updateQuantity(item.key, item.quantity - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid #e5e7eb', background: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 16, textAlign: 'center', color: '#0f172a' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.key, item.quantity + 1)} style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: primaryColor }}>{currency} {cartTotal.toFixed(2)}</span>
                </div>
                <button onClick={() => { setShowCart(false); setShowCheckout(true); }} style={{
                  width: '100%', padding: 14, background: primaryColor, color: 'white',
                  border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer'
                }}>Proceed to checkout</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Checkout form */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setShowCheckout(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px',
            maxHeight: '85vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>Your details</p>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Name *</label>
                <input value={checkoutForm.name} onChange={e => setCheckoutForm(p => ({ ...p, name: e.target.value }))} placeholder="Your name"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Phone *</label>
                <input value={checkoutForm.phone} onChange={e => setCheckoutForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 9123 4567" inputMode="tel"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {!isDineIn && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Order type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(isFnB
                      ? [{ value: 'dine_in', label: '🪑 Dine in' }, { value: 'takeaway', label: '🥡 Takeaway' }]
                      : [{ value: 'takeaway', label: '🏪 Pickup' }, { value: 'delivery', label: '🚚 Delivery' }]
                    ).map(type => (
                      <button key={type.value} onClick={() => setCheckoutForm(p => ({ ...p, orderType: type.value }))}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13,
                          fontWeight: 500, cursor: 'pointer',
                          border: checkoutForm.orderType === type.value ? `2px solid ${primaryColor}` : '0.5px solid #e5e7eb',
                          background: checkoutForm.orderType === type.value ? '#f1f5f9' : 'none',
                          color: '#0f172a'
                        }}>
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isDineIn && checkoutForm.orderType === 'dine_in' && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Table number</label>
                  <input value={checkoutForm.tableNumber} onChange={e => setCheckoutForm(p => ({ ...p, tableNumber: e.target.value }))} placeholder="e.g. Table 3"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}

              {checkoutForm.orderType === 'delivery' && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Delivery address</label>
                  <textarea value={checkoutForm.address} onChange={e => setCheckoutForm(p => ({ ...p, address: e.target.value }))} placeholder="Your full address" rows={2}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                <textarea value={checkoutForm.notes} onChange={e => setCheckoutForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any special requests?" rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Order summary */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px', fontWeight: 600 }}>Order summary</p>
              {cart.map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: '#0f172a' }}>
                  <span>{item.name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span>
                  <span style={{ fontWeight: 600 }}>{currency} {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: '0.5px solid #e5e7eb', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span style={{ color: '#0f172a' }}>Total</span>
                <span style={{ color: primaryColor }}>{currency} {cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <button onClick={handleSubmitOrder} disabled={isSubmitting || !checkoutForm.name || !checkoutForm.phone}
              style={{
                width: '100%', padding: 14,
                background: isSubmitting || !checkoutForm.name || !checkoutForm.phone ? '#94a3b8' : primaryColor,
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}>
              {isSubmitting ? 'Placing order...' : `Place order · ${currency} ${cartTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* Order success */}
      {orderSuccess && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#fff', overflowY: 'auto' }}>
          <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <p style={{ fontWeight: 700, fontSize: 22, margin: '0 0 4px', textAlign: 'center', color: '#0f172a' }}>Order placed!</p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 4px' }}>Order #{placedOrderNumber}</p>
            {isDineIn && table && (
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>{table.name}</p>
            )}
            <p style={{ color: '#64748b', textAlign: 'center', margin: '0 0 24px', fontSize: 13, maxWidth: 280 }}>
              We've received your order and will prepare it shortly.
            </p>

            {tenant.payment_qr_url && (
              <div style={{ width: '100%', maxWidth: 320, background: '#f8fafc', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 20, border: '0.5px solid #e5e7eb' }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 4px', color: '#0f172a' }}>
                  {tenant.payment_qr_label || 'Scan to pay'}
                </p>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>
                  Amount: <strong style={{ color: primaryColor }}>{currency} {lastCartTotal.toFixed(2)}</strong>
                </p>
                <img src={tenant.payment_qr_url} style={{ width: 180, height: 180, objectFit: 'contain', borderRadius: 12, border: '0.5px solid #e5e7eb', background: 'white', padding: 8, marginBottom: 12 }} />
                {tenant.payment_reference && (
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '0.5px solid #e5e7eb' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{tenant.payment_reference}</span>
                    <button onClick={() => { navigator.clipboard.writeText(tenant.payment_reference); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      style={{ fontSize: 11, color: primaryColor, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <a href={tenant.payment_qr_url} download="payment-qr.png"
                  style={{ display: 'block', width: '100%', padding: 10, borderRadius: 10, background: primaryColor, color: 'white', textAlign: 'center', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 6 }}>
                  Save QR to phone
                </a>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Screenshot or save the QR to complete payment</p>
              </div>
            )}

            <div style={{ width: '100%', maxWidth: 320, background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', fontWeight: 600 }}>Order summary</p>
              {lastCart.map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#0f172a' }}>
                  <span>{item.name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span>
                  <span style={{ fontWeight: 600 }}>{currency} {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: '0.5px solid #e5e7eb', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span style={{ color: '#0f172a' }}>Total</span>
                <span style={{ color: primaryColor }}>{currency} {lastCartTotal.toFixed(2)}</span>
              </div>
            </div>

            <button onClick={() => { setOrderSuccess(false); setLastCart([]); setLastCartTotal(0); }}
              style={{ width: '100%', maxWidth: 320, padding: 14, background: 'none', border: '0.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#0f172a' }}>
              Back to menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}