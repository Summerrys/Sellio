import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabaseClient';
import PublicMenuView from '../components/public-order/PublicMenuView';
import PublicCartSheet from '../components/public-order/PublicCartSheet';
import PublicOrderConfirmation from '../components/public-order/PublicOrderConfirmation';

export default function PublicOrder() {
  const { tenantSlug, tableId } = useParams();
  const [tenant, setTenant] = useState(null);
  const [table, setTable] = useState(null);
  const [theme, setTheme] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  useEffect(() => {
    loadData();
  }, [tenantSlug, tableId]);

  const loadData = async () => {
    try {
      const supabase = await getSupabase();

      // Load tenant
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, name, slug, logo_url, currency, settings')
        .eq('slug', tenantSlug)
        .single();
      if (tenantErr || !tenantData) throw new Error('Restaurant not found');

      // Load table + theme in parallel
      const [tableRes, themeRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('tables').select('id, name, zone, capacity').eq('id', tableId).eq('tenant_id', tenantData.id).single(),
        supabase.from('theme_configs').select('*').eq('tenant_id', tenantData.id).maybeSingle(),
        supabase.from('categories').select('id, name, slug, sort_order').eq('tenant_id', tenantData.id).eq('is_active', true).order('sort_order'),
        supabase.from('products').select('id, name, description, price, image_url, category_id, variants, tags').eq('tenant_id', tenantData.id).eq('is_active', true).order('name'),
      ]);

      if (tableRes.error || !tableRes.data) throw new Error('Table not found');

      setTenant(tenantData);
      setTable(tableRes.data);
      setTheme(themeRes.data || null);
      setCategories(categoriesRes.data || []);
      setProducts(productsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = theme?.primary_color || '#3b82f6';
  const accentColor = theme?.accent_color || '#9333ea';
  const gradientStyle = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-slate-400 text-4xl mb-3">😕</p>
          <h2 className="text-lg font-semibold text-slate-700 mb-1">Oops!</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (confirmedOrder) {
    return (
      <PublicOrderConfirmation
        order={confirmedOrder}
        tenant={tenant}
        table={table}
        gradientStyle={gradientStyle}
        currency={tenant.currency || 'SGD'}
        onNewOrder={() => {
          setConfirmedOrder(null);
          setCart([]);
        }}
      />
    );
  }

  return (
    <>
      <style>{`
        :root {
          --pub-primary: ${primaryColor};
          --pub-accent: ${accentColor};
          --pub-gradient: ${gradientStyle};
        }
        .pub-btn-primary { background: var(--pub-gradient); }
        .pub-pill-active { background: var(--pub-gradient); color: white; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <PublicMenuView
        tenant={tenant}
        table={table}
        categories={categories}
        products={products}
        cart={cart}
        setCart={setCart}
        currency={tenant.currency || 'SGD'}
        gradientStyle={gradientStyle}
        onViewCart={() => setShowCart(true)}
      />

      <PublicCartSheet
        open={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        setCart={setCart}
        tenant={tenant}
        table={table}
        currency={tenant.currency || 'SGD'}
        gradientStyle={gradientStyle}
        onOrderPlaced={(order) => {
          setShowCart(false);
          setConfirmedOrder(order);
        }}
      />
    </>
  );
}