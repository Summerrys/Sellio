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
  const isPreview = new URLSearchParams(window.location.search).get('preview') === 'true';

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
  const [showProductModal, setShowProductModal] = useState(false);
  const [businessHours, setBusinessHours] = useState([]);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [todayHours, setTodayHours] = useState(null);
  const SESSION_ORDERS_KEY = `sf_session_orders_${tenantSlug}_${tableId || 'notab'}`;
  const [customerId, setCustomerId] = useState(null);
  const DEVICE_ID_KEY = 'sellio_device_id';
  const getOrCreateDeviceId = () => {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch { return null; }
  };
  const [sessionOrderIds, setSessionOrderIds] = useState(() => {
    try { const s = localStorage.getItem(`sf_session_orders_${tenantSlug}_${tableId || 'notab'}`); return s ? JSON.parse(s) : []; } catch { return []; }
  });
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
      // Fetch business hours for all visitors — skip enforcement only for merchant preview
      if (!isPreview && tenantData?.id) {
        const { data: hoursData } = await supabase
          .from('business_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('tenant_id', tenantData.id);
        if (hoursData?.length) {
          setBusinessHours(hoursData);
          const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
          const now = new Date();
          const todayName = days[now.getDay()];
          const todayHours = hoursData.find(h => h.day_of_week === todayName);
          if (todayHours) {
            setTodayHours(todayHours);
            if (todayHours.is_closed) {
              setIsStoreOpen(false);
            } else if (todayHours.open_time && todayHours.close_time) {
              const [openH, openM] = todayHours.open_time.split(':').map(Number);
              const [closeH, closeM] = todayHours.close_time.split(':').map(Number);
              const currentMins = now.getHours() * 60 + now.getMinutes();
              const openMins = openH * 60 + openM;
              const closeMins = closeH * 60 + closeM;
              setIsStoreOpen(currentMins >= openMins && currentMins < closeMins);
            }
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

  useEffect(() => {
    if (!tenant?.id) return;
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    getSupabase().then(async supabase => {
      try {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('device_id', deviceId)
          .maybeSingle();
        if (existing) {
          setCustomerId(existing.id);
        } else {
          const { data: newCustomer } = await supabase
            .from('customers')
            .insert({ tenant_id: tenant.id, device_id: deviceId })
            .select('id')
            .single();
          if (newCustomer) setCustomerId(newCustomer.id);
        }
      } catch (e) {
        console.warn('Customer tracking error:', e.message);
      }
    });
  }, [tenant?.id]);

  const loadOrderHistory = async () => {
    if (!tenant) return;
    const supabase = await getSupabase();
    const currentSessionOrders = (() => { try { const s = localStorage.getItem(SESSION_ORDERS_KEY); return s ? JSON.parse(s) : []; } catch { return []; } })();
    if (!currentSessionOrders.length) { setOrderHistory([]); return; }
    const { data } = await supabase.from('orders').select('*').in('id', currentSessionOrders).order('created_date', { ascending: false });
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
      customer_id: customerId || null,
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

      // Update customer stats
    if (customerId && order) {
      getSupabase().then(async supabase => {
        try {
          const { data: cust } = await supabase.from('customers').select('total_orders, total_spent, first_order_at').eq('id', customerId).single();
          await supabase.from('customers').update({
            total_orders: (cust?.total_orders || 0) + 1,
            total_spent: (parseFloat(cust?.total_spent) || 0) + savedCartTotal,
            last_order_at: new Date().toISOString(),
            first_order_at: cust?.first_order_at || new Date().toISOString(),
            updated_date: new Date().toISOString(),
          }).eq('id', customerId);
        } catch (e) { console.warn('Customer stats update error:', e.message); }
      });
    }
    setLastCart(savedCart); setLastCartTotal(savedCartTotal);
      setPlacedOrderNumber(orderNumber); setCart([]);
      try { localStorage.removeItem(CART_KEY); } catch {}
      // Track this order in session
      const updatedSessionOrders = [...sessionOrderIds, order.id];
      setSessionOrderIds(updatedSessionOrders);
      try { localStorage.setItem(SESSION_ORDERS_KEY, JSON.stringify(updatedSessionOrders)); } catch {}
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
      {!isStoreOpen && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
          background: 'rgba(15,23,42,0.95)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="14" width="22" height="16" rx="1.5" stroke="white" strokeWidth="1.8" fill="none"/>
              <path d="M4 14 L8 8 H26 L30 14" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="none"/>
              <rect x="13" y="20" width="8" height="10" rx="1" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M4 14 H30" stroke="white" strokeWidth="1.5"/>
              <circle cx="30" cy="30" r="8" fill="#0f172a" stroke="white" strokeWidth="1.5"/>
              <circle cx="30" cy="30" r="6" fill="#334155"/>
              <path d="M30 26.5 V30 L32.5 32.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white', lineHeight: 1.3 }}>The store is closed.</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              {(() => {
                if (!businessHours?.length) return null;
                const DAY_SHORT = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' };
                const ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
                const fmt = (t) => {
                  if (!t) return '';
                  const [h, m] = t.split(':').map(Number);
                  const ampm = h >= 12 ? 'PM' : 'AM';
                  const h12 = h % 12 || 12;
                  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
                };
                const open = ORDER.map(d => businessHours.find(h => h.day_of_week === d)).filter(h => h && !h.is_closed);
                if (!open.length) return 'Closed all week';
                const groups = [];
                let cur = null;
                for (const h of open) {
                  if (cur && cur.open_time === h.open_time && cur.close_time === h.close_time) {
                    cur.days.push(h.day_of_week);
                  } else {
                    if (cur) groups.push(cur);
                    cur = { days: [h.day_of_week], open_time: h.open_time, close_time: h.close_time };
                  }
                }
                if (cur) groups.push(cur);
                return groups.map(g => {
                  const dayStr = g.days.length === 1
                    ? DAY_SHORT[g.days[0]]
                    : `${DAY_SHORT[g.days[0]]} – ${DAY_SHORT[g.days[g.days.length - 1]]}`;
                  return `Open ${dayStr}, ${fmt(g.open_time)} – ${fmt(g.close_time)}`;
                }).join(' · ');
              })()}
            </p>
          </div>
        </div>
      )}
      <div style={!isStoreOpen ? { paddingBottom: 68 } : {}}>
        <StorefrontView
          tenant={tenant}
          storefrontConfig={storefrontConfig}
          theme={theme}
          products={products}
          categories={categories}
          showBackButton={!isDineIn}
          onProductModalChange={setShowProductModal}
          cart={cart}
          setCart={setCart}
          showCart={showCart}
          setShowCart={setShowCart}
          showOrderHistory={showOrderHistory}
          setShowOrderHistory={(v) => { setShowOrderHistory(v); if (v) loadOrderHistory(); }}
          onAddToCart={!isStoreOpen ? () => {} : addToCart}
          cartCount={cartCount}
          cartTotal={cartTotal}
        />
      </div>

      {/* ── FLOATING CART BUTTON ── */}
      {cartCount > 0 && !showCart && !showCheckout && isStoreOpen && (
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
                {!isStoreOpen ? (
                  <div style={{ width: '100%', padding: 14, background: '#f1f5f9', color: '#94a3b8', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, textAlign: 'center' }}>
                    🔒 Store is closed
                  </div>
                ) : (
                  <button onClick={() => { setShowCart(false); setShowCheckout(true); }} style={{ width: '100%', padding: 14, background: primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Proceed to checkout</button>
                )}
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
            {!isStoreOpen ? (
              <div style={{ width: '100%', padding: 14, background: '#f1f5f9', color: '#94a3b8', borderRadius: 12, fontSize: 15, fontWeight: 600, textAlign: 'center' }}>
                🔒 Store is closed — cannot place order
              </div>
            ) : (
              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting}
                style={{ width: '100%', padding: 14, background: isSubmitting ? '#94a3b8' : primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isSubmitting ? 'Placing order...' : `Place order · ${currency} ${cartTotal.toFixed(2)}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── ORDER SUCCESS ── */}
      {orderSuccess && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#f8fafc', overflowY: 'auto' }}>
          <div style={{ padding: '40px 16px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', maxWidth: 400, margin: '0 auto' }}>

            {/* Success icon */}
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, flexShrink: 0 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <p style={{ fontWeight: 800, fontSize: 24, margin: '0 0 6px', textAlign: 'center', color: '#0f172a', letterSpacing: '-0.01em' }}>Order placed!</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>#{placedOrderNumber}</span>
              {table && (
                <>
                  <span style={{ color: '#cbd5e1', fontSize: 12 }}>·</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>🪑 {table.name}</span>
                </>
              )}
            </div>

            {/* Order summary card */}
            <div style={{ width: '100%', background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Your Order</p>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {lastCart.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: idx < lastCart.length - 1 ? 10 : 0, paddingBottom: idx < lastCart.length - 1 ? 10 : 0, borderBottom: idx < lastCart.length - 1 ? '1px dashed #f1f5f9' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.quantity}× {item.name}
                      </p>
                      {item.variant && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{item.variant}</p>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flexShrink: 0 }}>{currency} {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: primaryColor }}>{currency} {lastCartTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment QR card */}
            {tenant.payment_qr_url && (
              <div style={{ width: '100%', background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    {tenant.payment_qr_label || 'Pay via QR Code'}
                  </p>
                  <span style={{ fontSize: 15, fontWeight: 800, color: primaryColor }}>{currency} {lastCartTotal.toFixed(2)}</span>
                </div>
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* QR code with long-press hint */}
                  <div style={{ position: 'relative', marginBottom: 20 }}>
                    <img
                      src={tenant.payment_qr_url}
                      alt="Payment QR Code"
                      style={{ width: 200, height: 200, objectFit: 'contain', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', padding: 10, display: 'block' }}
                    />
                    <div style={{
                      position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(15,23,42,0.8)', borderRadius: 999, padding: '4px 10px',
                      whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
                    }}>
                      <span style={{ fontSize: 10, color: 'white', fontWeight: 600, letterSpacing: '0.02em' }}>
                        👆 Long press to save &amp; scan
                      </span>
                    </div>
                  </div>

                  {/* Reference number */}
                  {tenant.payment_reference && (
                    <div style={{ width: '100%', background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1f5f9' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference</p>
                        <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{tenant.payment_reference}</p>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(tenant.payment_reference); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        style={{ fontSize: 12, color: copied ? '#16a34a' : primaryColor, background: copied ? '#dcfce7' : `${primaryColor}15`, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', minHeight: 32, minWidth: 60 }}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )}

                  {/* Step-by-step instructions */}
                  <div style={{ width: '100%', background: '#fffbeb', borderRadius: 12, padding: '14px 16px', border: '1px solid #fde68a' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How to pay</p>
                    {[
                      { step: '1', text: 'Open your banking app (DBS PayLah, OCBC, UOB etc.)' },
                      { step: '2', text: 'Long press the QR code above → Save image → Scan from photo' },
                      { step: '3', text: `Enter ${currency} ${lastCartTotal.toFixed(2)} and confirm your payment` },
                    ].map(({ step, text }) => (
                      <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: step !== '3' ? 8 : 0 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'white' }}>{step}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Back to menu */}
            <button
              onClick={() => { setOrderSuccess(false); setLastCart([]); setLastCartTotal(0); }}
              style={{ width: '100%', minHeight: 52, padding: '14px 16px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#374151', touchAction: 'manipulation', transition: 'background 0.15s' }}
            >
              Back to menu
            </button>
          </div>
        </div>
      )}

      {products.length > 0 && !showCart && !showCheckout && !showOrderHistory && !showProductModal && (isPreview || isStoreOpen) && (
        <MenuAssistantWidget
          products={products}
          tenant={tenant}
          storefront={storefrontConfig}
          onProductSelect={() => {}}
          onAddToCart={addToCart}
          isStoreOpen={isStoreOpen}
          isPreview={isPreview}
        />
      )}
    </>
  );
}