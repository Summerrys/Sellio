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
        .select('id, name, slug, logo_url, industry, currency, country, phone, address, payment_qr_url, payment_qr_label, payment_reference, settings')
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
        if (tableData) {
          // Mark table as occupied
          await supabase.from('tables').update({ status: 'occupied', updated_date: new Date().toISOString() }).eq('id', tableId).eq('tenant_id', tenantId);
          // Create table session if none active
          const { data: existingSession } = await supabase.from('table_sessions').select('id').eq('table_id', tableId).eq('tenant_id', tenantId).eq('status', 'active').maybeSingle();
          if (!existingSession) {
            await supabase.from('table_sessions').insert({ table_id: tableId, tenant_id: tenantId, status: 'active', started_at: new Date().toISOString(), total_amount: 0 });
          }
        }
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
    setIsSubmitting(true);
    const supabase = await getSupabase();
    const savedCartTotal = cartTotal;
    const savedCart = [...cart];

    // Get sequential order number from Supabase RPC
    let orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    try {
      const { data: rpcResult } = await supabase.rpc('get_next_order_number', { p_tenant_id: tenant.id });
      if (rpcResult) orderNumber = rpcResult;
    } catch (e) {
      console.warn('RPC get_next_order_number failed, using fallback:', e.message);
    }

    const { data: order, error } = await supabase.from('orders').insert({
      tenant_id: tenant.id, order_number: orderNumber, status: 'pending',
      type: isDineIn ? 'dine_in' : 'takeaway',
      table_id: tableId || null, table_name: table?.name || null,
      customer_name: null, customer_phone: null,
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

      // Update table session: append order ID and increment total
      if (tableId) {
        const { data: session } = await supabase.from('table_sessions')
          .select('id, order_ids, total_amount')
          .eq('table_id', tableId).eq('tenant_id', tenant.id).eq('status', 'active')
          .maybeSingle();
        if (session) {
          const existingIds = Array.isArray(session.order_ids) ? session.order_ids : [];
          await supabase.from('table_sessions').update({
            order_ids: [...existingIds, order.id],
            table_name: table?.name || null,
            total_amount: (parseFloat(session.total_amount) || 0) + savedCartTotal,
            updated_date: new Date().toISOString(),
          }).eq('id', session.id);
        }
      }

      setLastCart(savedCart); setLastCartTotal(savedCartTotal);
      setPlacedOrderNumber(orderNumber); setCart([]);
      try { localStorage.removeItem(CART_KEY); } catch {}
      setShowCheckout(false); setIsSubmitting(false); setOrderSuccess(true);
    } else {
      setIsSubmitting(false);
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
    <>
      <StorefrontView
        tenant={tenant}
        storefrontConfig={storefrontConfig}
        theme={theme}
        products={products}
        categories={categories}
        showBackButton={!isDineIn}
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
            borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{cartCount}</span>
            {currency} {cartTotal.toFixed(2)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                      <button onClick={() => updateQuantity(item.key, item.quantity - 1)} style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300, lineHeight: 1 }}>−</button>
                                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: `${primaryColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: primaryColor }}>{item.quantity}</span>
                                      <button onClick={() => updateQuantity(item.key, item.quantity + 1)} style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300, lineHeight: 1 }}>+</button>
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
              <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>Confirm order</p>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }}>✕</button>
            </div>
            {isDineIn && table && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                <span style={{ fontSize: 14 }}>🪑</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{table.name}</span>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              {cart.map(item => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '0.5px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {item.image_url && <img src={item.image_url} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: '#0f172a' }}>{item.name}{item.variant ? ` (${item.variant})` : ''}</p>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>× {item.quantity}</p>
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: primaryColor }}>{currency} {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Total</span>
                <span style={{ fontWeight: 700, fontSize: 17, color: primaryColor }}>{currency} {cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea
                value={checkoutForm.notes}
                onChange={e => setCheckoutForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any special requests?"
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              style={{ width: '100%', padding: 14, background: isSubmitting ? '#94a3b8' : primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
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
                <img src={tenant.payment_qr_url} style={{ width: 180, height: 180, objectFit: 'contain', borderRadius: 12, border: '0.5px solid #e5e7eb', background: 'white', padding: 8, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
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
            <>
                      {tenant.country !== 'Malaysia' && (
                        <a
                          href={tenant.payment_reference
                            ? `paynowto://uen?uen=${encodeURIComponent(tenant.payment_reference)}&amount=${lastCartTotal.toFixed(2)}&editable=0`
                            : 'paynowto://'
                          }
                          style={{
                            display: 'block', width: '100%', maxWidth: 320,
                            padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600,
                            textAlign: 'center', textDecoration: 'none',
                            background: '#e2001a', color: 'white', marginBottom: 12,
                          }}
                        >
                          💳 Pay via PayNow
                        </a>
                      )}
                      {tenant.country === 'Malaysia' && (
                        <a
                          href="tngd://"
                          style={{
                            display: 'block', width: '100%', maxWidth: 320,
                            padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600,
                            textAlign: 'center', textDecoration: 'none',
                            background: '#0070ba', color: 'white', marginBottom: 12,
                          }}
                        >
                          💳 Pay via Touch 'n Go
                        </a>
                      )}
                      <button onClick={() => { setOrderSuccess(false); setLastCart([]); setLastCartTotal(0); }}
                        style={{ width: '100%', maxWidth: 320, padding: 14, background: 'none', border: '0.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#0f172a' }}>
                        Back to menu
                      </button>
                    </>
          </div>
        </div>
      )}

      {products.length > 0 && !showCart && !showCheckout && !showOrderHistory && (
        <MenuAssistantWidget products={products} tenant={tenant} storefront={storefrontConfig} onProductSelect={() => {}} onAddToCart={addToCart} />
      )}
    </>
  );
}