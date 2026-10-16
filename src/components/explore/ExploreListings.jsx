import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings2, RefreshCw, Tag } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { BRAND_GRADIENT, ExploreTabHeader, ItemImage, formatPrice, listingUrl, timeAgo } from './shared';

// Explore → Listings: the signed-in seller's own items.

function Prompt({ title, text, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
      <span className="mx-auto w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: BRAND_GRADIENT }}>
        <Tag className="w-6 h-6" />
      </span>
      <p className="mt-3 text-base font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
      <div className="mt-4 flex justify-center gap-2">{children}</div>
    </div>
  );
}

export default function ExploreListings() {
  const { appUser } = useAppUser() || {};
  const tenantId = appUser?.tenant_id || null;
  const [state, setState] = useState({ status: 'loading', rows: [], currency: 'SGD' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'My listings · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    (async () => {
      const supabase = await getSupabase();
      const [products, tenant] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, compare_at_price, image_url, is_active, track_inventory, stock_quantity, created_date')
          .eq('tenant_id', tenantId)
          .order('created_date', { ascending: false })
          .order('id', { ascending: true })
          .limit(100),
        supabase.from('tenants').select('currency').eq('id', tenantId).maybeSingle(),
      ]);
      if (products.error) throw products.error;
      if (!cancelled) setState({ status: 'ready', rows: products.data || [], currency: tenant.data?.currency || 'SGD' });
    })().catch((err) => {
      console.warn('My listings failed:', err);
      if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
    });
    return () => { cancelled = true; };
  }, [tenantId, reloadKey]);

  let body;
  if (!appUser) {
    body = (
      <Prompt title="Sell on Sellio" text="Log in to see your listings, or open a free shop in a minute.">
        <Link to="/Auth" onClick={() => rememberReturnPath('/explore/listings')} className="h-10 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">Log in</Link>
        <Link to="/join" className="h-10 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>Start selling</Link>
      </Prompt>
    );
  } else if (!tenantId) {
    body = (
      <Prompt title="No shop yet" text="Open a free shop to list your first item.">
        <Link to="/join" className="h-10 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>Start selling</Link>
      </Prompt>
    );
  } else if (state.status === 'loading') {
    body = (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="aspect-square bg-slate-200" />
            <div className="p-2.5 space-y-2"><div className="h-3 rounded bg-slate-200" /><div className="h-3 w-12 rounded bg-slate-200" /></div>
          </div>
        ))}
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <p className="text-sm text-slate-600">We couldn't load your listings just now.</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    );
  } else if (!state.rows.length) {
    body = (
      <Prompt title="Nothing listed yet" text="Add a photo, a name and a price. It shows on Explore straight away.">
        <Link to="/Products?new=1" className="h-10 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center gap-1.5" style={{ background: BRAND_GRADIENT }}>
          <Plus className="w-4 h-4" /> Add a listing
        </Link>
      </Prompt>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-slate-500 mb-3">{state.rows.length} {state.rows.length === 1 ? 'listing' : 'listings'}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {state.rows.map((p) => {
            const hidden = p.is_active === false;
            const soldOut = p.track_inventory && p.stock_quantity === 0;
            return (
              <Link key={p.id} to={listingUrl(p.id)} className="block bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-md transition-shadow">
                <div className="relative aspect-square">
                  <ItemImage src={p.image_url} name={p.name} className={`w-full h-full text-4xl ${hidden ? 'opacity-50' : ''}`} />
                  {(hidden || soldOut) && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/95 text-slate-700 shadow-sm">
                      {hidden ? 'Hidden' : 'Sold out'}
                    </span>
                  )}
                </div>
                <div className="px-2.5 pt-2 pb-3">
                  <p className="text-sm text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatPrice(p.price, state.currency)}</p>
                  <p className="text-[11px] text-slate-400">{timeAgo(p.created_date)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreTabHeader
        title="My listings"
        right={tenantId ? (
          <Link to="/Products" className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50">
            <Settings2 className="w-4 h-4" /> Manage
          </Link>
        ) : null}
      />
      <main className="max-w-6xl mx-auto px-4 pt-4" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {body}
      </main>
      <ExploreTabBar active="listings" />
    </div>
  );
}
