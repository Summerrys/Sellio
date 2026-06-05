import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabaseClient';
import StorefrontView from '@/components/storefront/StorefrontView';
import MenuAssistantWidget from '@/components/storefront/MenuAssistantWidget';

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  preparing: { bg: '#dbeafe', color: '#1e40af' },
  ready: { bg: '#d1fae5', color: '#065f46' },
  completed: { bg: '#f1f5f9', color: '#475569' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

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

  const CART_KEY = `sf_cart_${tenantSlug}`;
  const [cart, setCart] = useState(() => {
    try { const s = localStorage.getItem(`sf_cart_${tenantSlug}`); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCart, setLastCart] = useState([]);
  const [lastCartTotal, setLastCartTotal] = useState(0);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    name: '', phone: '', notes: '', orderType: isDineIn ? 'dine_in' : 'takeaway', tableNumber: '', address: ''
  });

  useEffect(() => {
    async function loadData() {
      const supabase = await getSupabase();
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, name, slug, logo_url, industry, currency, country, phone, payment_qr_url, payment_qr_label, payment_reference, settings')
        .eq('slug', tenantSlug).single();
      if (!tenantData) { setNotFound(true); setLoading(false); return; }
      setTenant(tenantData);
      const tenantId = tenantData.id;
      const [themeRes, storefrontRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('theme_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('storefront_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('categories').select('id, name, slug, sort_order').eq('tenant_id', tenantId).or('is_active.eq.true,is_active.is.null').order('sort_order'),
        supabase.from('products').select('id, name, description, price, compare_at_price, image_url, images, category_id, is_featured, is_active, stock_quantity, track_inventory, low_stock_threshold, variants, tags').eq('tenant_id', tenantId).or('is_active.eq.true,is_active.is.null'),
      ]);
      setTheme(themeRes.data);
      setStorefrontConfig(storefrontRes.data);
      setCategories(categoriesRes.data || []);
      setProducts(productsRes.data || []);
      if (tableId) {
        const { data: tableData } = await supabase.from('tables').select('id, name, zone, capacity').eq('id', tableId).eq('tenant_id', tenantId).single();
        setTable(tableData);
      }
      setLoading(false);
    }
    loadData();
  }, [tenantSlug, tableId]);

  useEffect(() => {
    if (!tenant) return;
    const primaryColor = storefrontConfig?.banner_bg_color || theme?.primary_color || '#6366f1';
    document.documentElement.style.setProperty('--sf-primary', primaryColor);
    document.title = `${tenant.name} — Order Online`;
  }, [storefrontConfig, theme, tenant]);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart, CART_KEY]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const primaryColor = storefrontConfig?.banner_bg_color || theme?.primary_color || '#6366f1';
  const currency = tenant?.currency || 'SGD';
  const isFnB = /f&b|cafe|restaurant|food|beverage/i.test(tenant?.industry || '');

  const addToCart = (product, variant = null) => {
    const key = `${product.id}-${variant?.label || 'default'}`;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { key, product_id: product.id, name: product.name, price: product.price + (variant?.price_modifier || 0), image_url: product.image_url, quantity: 1, variant: variant?.label || null }];
    });
  };

  const updateQuantity = (key, qty) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.key !== key));
    else setCart(prev => prev.map(i => i.key === key ? { ...i, quantity: qty } : i));
  };

  const loadOrderHistory = async () => {
    if (!tenant) return;
    const supabase = await getSupabase();
    let query = supabase.from('orders').select('*').eq('tenant_id', tenant.id).order('created_date', { ascending: false }).limit(20);
    if (tableId) query = query.eq('table_id', tableId);
    const { data } = await query;
    setOrderHistory(data || []);
  };

  const handleSubmitOrder = async () => {
    if (!checkoutForm.name || !checkoutForm.phone) return;
    setIsSubmitting(true);
    const supabase = await getSupabase();
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const savedCartTotal = cartTotal;
    const savedCart = [...cart];
    const { data: order, error } = await supabase.from('orders').insert({
      tenant_id: tenant.id, order_number: orderNumber, status: 'pending',
      type: isDineIn ? 'dine_in' : checkoutForm.orderType,
      table_id: tableId || null, table_name: table?.name || checkoutForm.tableNumber || null,
      customer_name: checkoutForm.name, customer_phone: checkoutForm.phone,
      notes: checkoutForm.notes || null, items: savedCart,
      subtotal: savedCartTotal, total_amount: savedCartTotal,
      payment_status: 'unpaid', payment_method: 'pending',
    }).select().single();
    if (!error && order) {
      await supabase.from('order_items').insert(savedCart.map(item => ({
        tenant_id: tenant.id, order_id: order.id, product_id: item.product_id,
        product_name: item.name, variant_name: item.variant || null,
        quantity: item.quantity, unit_price: item.price, total_price: item.price * item.quantity,
      })));
      setLastCart(savedCart); setLastCartTotal(savedCartTotal);
      setPlacedOrderNumber(orderNumber); setCart([]);
      try { localStorage.removeItem(CART_KEY); } catch {}
      setShowCheckout(false); setIsSubmitting(false); setOrderSuccess(true);
    } else { setIsSubmitting(false); }
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
    <>
      <StorefrontView
        tenant={tenant}
        storefrontConfig={storefrontConfig}
        theme={theme}
        products={products}
        categories={categories}
        cart={cart}
        setCart={setCart}
        showCart={showCart}
        setShowCart={setShowCart}
        showOrderHistory={showOrderHistory}
        setShowOrderHistory={(v) => { setShowOrderHistory(v); if (v) loadOrderHistory(); }}
        onAddToCart={addToCart}
        cartCount={cartCount}
        cartTotal={cartTotal}
      />

      {/* ── FLOATING CART BUTTON ── */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>
          <button onClick={() => setShowCart(true)} style={{
            background: primaryColor, color: 'white', border: 'none',
            borderRadius: 999, padding: '14px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{cartCount}</span>
            View order · {currency} {cartTotal.toFixed(2)}
          </button>
        </div>
      )}

      {/* ── CART DRAWER ── */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setShowCart(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px', maxHeight: '80vh', overflowY: 'auto' }}>
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
                      <button onClick={() => updateQuantity(item.key, item.quantity - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid #e5e7eb', background: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.key, item.quantity + 1)} style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: primaryColor }}>{currency} {cartTotal.toFixed(2)}</span>
                </div>
                <button onClick={() => { setShowCart(false); setShowCheckout(true); }} style={{ width: '100%', padding: 14, background: primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Proceed to checkout</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ORDER HISTORY ── */}
      {showOrderHistory && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setShowOrderHistory(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>Order History</p>
              <button onClick={() => setShowOrderHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>
            {orderHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}><p style={{ fontSize: 36, margin: '0 0 8px' }}>🍽️</p><p style={{ color: '#94a3b8', fontSize: 14 }}>No orders yet</p></div>
            ) : (
              orderHistory.map(order => {
                const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
                return (
                  <div key={order.id} style={{ marginBottom: 14, padding: 14, background: '#f8fafc', borderRadius: 12, border: '0.5px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>#{order.order_number}</p>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{new Date(order.created_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.color }}>{order.status}</span>
                    </div>
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 2 }}>
                        <span>{item.name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span>
                        <span style={{ fontWeight: 600 }}>{currency} {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '0.5px solid #e5e7eb', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                      <span>Total</span>
                      <span style={{ color: primaryColor }}>{currency} {parseFloat(order.total_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── CHECKOUT ── */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setShowCheckout(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px', maxHeight: '85vh', overflowY: 'auto' }}>
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
                        style={{ flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: checkoutForm.orderType === type.value ? `2px solid ${primaryColor}` : '0.5px solid #e5e7eb', background: checkoutForm.orderType === type.value ? '#f1f5f9' : 'none', color: '#0f172a' }}>
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                <textarea value={checkoutForm.notes} onChange={e => setCheckoutForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any special requests?" rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button onClick={handleSubmitOrder} disabled={isSubmitting || !checkoutForm.name || !checkoutForm.phone}
              style={{ width: '100%', padding: 14, background: isSubmitting || !checkoutForm.name || !checkoutForm.phone ? '#94a3b8' : primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
              {isSubmitting ? 'Placing order...' : `Place order · ${currency} ${cartTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* ── ORDER SUCCESS ── */}
      {orderSuccess && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#fff', overflowY: 'auto' }}>
          <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <p style={{ fontWeight: 700, fontSize: 22, margin: '0 0 4px', textAlign: 'center' }}>Order placed!</p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>Order #{placedOrderNumber}</p>
            {tenant.payment_qr_url && (
              <div style={{ width: '100%', maxWidth: 320, background: '#f8fafc', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 20, border: '0.5px solid #e5e7eb' }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>{tenant.payment_qr_label || 'Scan to pay'}</p>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>Amount: <strong style={{ color: primaryColor }}>{currency} {lastCartTotal.toFixed(2)}</strong></p>
                <img src={tenant.payment_qr_url} style={{ width: 180, height: 180, objectFit: 'contain', borderRadius: 12, border: '0.5px solid #e5e7eb', background: 'white', padding: 8, marginBottom: 12 }} />
                {tenant.payment_reference && (
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '0.5px solid #e5e7eb' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{tenant.payment_reference}</span>
                    <button onClick={() => { navigator.clipboard.writeText(tenant.payment_reference); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      style={{ fontSize: 11, color: primaryColor, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => { setOrderSuccess(false); setLastCart([]); setLastCartTotal(0); }}
              style={{ width: '100%', maxWidth: 320, padding: 14, background: 'none', border: '0.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#0f172a' }}>
              Back to menu
            </button>
          </div>
        </div>
      )}

      {products.length > 0 && (
        <MenuAssistantWidget products={products} tenant={tenant} storefront={storefrontConfig} onProductSelect={() => {}} addToCart={addToCart} tableId={tableId} />
      )}
    </>
  );
}