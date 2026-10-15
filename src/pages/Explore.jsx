import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, X, Loader2, RefreshCw, Store, ChevronRight } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';

// Sellio Explore: a public, Carousell-style feed of items from Sellio shops.
// Anyone can browse without an account; tapping an item opens that shop's
// storefront. Data comes from the explore_feed / explore_shops RPCs, which only
// return shops that are listed (tenants.is_public) and allowed to sell.

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png';
const BRAND_GRADIENT = 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)';
const PAGE_SIZE = 24;

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food & drinks' },
  { key: 'goods', label: 'Goods' },
  { key: 'home', label: 'Home sellers' },
  { key: 'merchants', label: 'Merchants' },
];

const hideScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

function formatPrice(amount, currency) {
  const value = Number(amount);
  if (amount == null || Number.isNaN(value)) return '';
  return `${currency === 'MYR' ? 'RM' : 'S$'}${value.toFixed(2)}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

const storeUrl = (slug) => `/store/${encodeURIComponent(slug)}`;
const rowKey = (row) => row.product_id || row.shop_id;

function industryLabel(industry) {
  const value = String(industry || '').toLowerCase();
  if (/f.?b|cafe|restaurant|food|beverage/.test(value)) return 'Food & drinks';
  if (/retail|fashion|electronics/.test(value)) return 'Retail';
  if (/service|beauty|wellness|health|education/.test(value)) return 'Services';
  return 'Merchant';
}

function ShopAvatar({ name, logo, size = 24 }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="rounded-full object-cover bg-white border border-slate-100 flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, background: BRAND_GRADIENT, fontSize: Math.max(10, size * 0.42) }}
    >
      {initial}
    </span>
  );
}

function ItemCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item.image_url && !imageFailed;
  const hasDiscount = item.compare_at_price != null && Number(item.compare_at_price) > Number(item.price);
  return (
    <Link
      to={storeUrl(item.shop_slug)}
      className="group block bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <ShopAvatar name={item.shop_name} logo={item.shop_logo_url} size={26} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{item.shop_name}</p>
          <p className="text-[11px] text-slate-400 leading-tight">{timeAgo(item.listed_at)}</p>
        </div>
      </div>
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {showImage ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.18), rgba(224,68,154,0.16), rgba(139,47,201,0.18))' }}
          >
            <span className="text-4xl font-bold text-white/90" style={{ textShadow: '0 2px 12px rgba(139,47,201,0.35)' }}>
              {(item.product_name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {item.shop_type === 'individual' && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-slate-700 shadow-sm">
            Home seller
          </span>
        )}
      </div>
      <div className="px-2.5 pt-2 pb-3">
        <p className="text-sm text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">{item.product_name}</p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          {formatPrice(item.price, item.currency)}
          {hasDiscount && (
            <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">
              {formatPrice(item.compare_at_price, item.currency)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="aspect-square rounded-lg bg-slate-100" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-lg object-cover bg-slate-100"
    />
  );
}

// One card per paid merchant: its storefront, not a flood of its items.
function MerchantCard({ shop }) {
  const images = (shop.preview_images || []).filter(Boolean).slice(0, 4);
  const count = Number(shop.item_count) || 0;
  return (
    <Link
      to={storeUrl(shop.shop_slug)}
      className="group block bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3 p-3">
        <ShopAvatar name={shop.shop_name} logo={shop.shop_logo_url} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 truncate">{shop.shop_name}</p>
          <p className="text-xs text-slate-500">{industryLabel(shop.industry)} · {count} {count === 1 ? 'item' : 'items'}</p>
        </div>
        <span className="text-xs font-semibold text-slate-700 inline-flex items-center whitespace-nowrap group-hover:text-slate-900">
          Visit store <ChevronRight className="w-4 h-4" />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1 px-3 pb-3">
        {[0, 1, 2, 3].map((i) => <Thumb key={i} src={images[i]} />)}
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="w-[26px] h-[26px] rounded-full bg-slate-200" />
            <div className="h-3 w-20 rounded bg-slate-200" />
          </div>
          <div className="aspect-square bg-slate-200" />
          <div className="px-2.5 pt-2 pb-3 space-y-2">
            <div className="h-3 w-full rounded bg-slate-200" />
            <div className="h-3 w-12 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Explore() {
  const { appUser } = useAppUser() || {};
  const signedIn = !!appUser;
  const hasShop = !!appUser?.tenant_id;

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState([]);
  const [itemsKind, setItemsKind] = useState('all');
  const [shops, setShops] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Explore shops and items · Sellio';
    return () => { document.title = previous; };
  }, []);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Items for every chip except Merchants, which lists storefronts instead.
  // The feed is interleaved by shop on the server, so one shop can't fill it.
  const fetchPage = useCallback(async (offset) => {
    const supabase = await getSupabase();
    const { data, error } = kind === 'merchants'
      ? await supabase.rpc('explore_merchants', { p_search: search || null, p_limit: PAGE_SIZE, p_offset: offset })
      : await supabase.rpc('explore_feed', {
        p_search: search || null,
        p_kind: kind === 'all' ? null : kind,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
    if (error) throw error;
    return { kind, rows: data || [] };
  }, [search, kind]);

  useEffect(() => {
    const id = ++requestId.current;
    setStatus('loading');
    setHasMore(false);
    fetchPage(0)
      .then(({ kind: forKind, rows }) => {
        if (id !== requestId.current) return;
        setItems(rows);
        setItemsKind(forKind);
        setHasMore(rows.length === PAGE_SIZE);
        setStatus('ready');
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        console.warn('Explore feed failed:', err);
        setStatus('error');
      });
  }, [fetchPage, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('explore_shops', { p_limit: 20 });
        if (!cancelled && !error) setShops(data || []);
      } catch (err) {
        console.warn('Explore shops failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || status !== 'ready') return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const { rows } = await fetchPage(items.length);
      if (id !== requestId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map(rowKey));
        return [...prev, ...rows.filter((r) => !seen.has(rowKey(r)))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.warn('Explore load more failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, items.length, loadingMore, status]);

  // Load the next page when the end of the feed scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const filtered = !!search || kind !== 'all';
  const kindLabel = kind === 'merchants' ? 'Merchants on Sellio' : KINDS.find((k) => k.key === kind)?.label;
  const heading = search ? `Results for “${search}”` : kind === 'all' ? 'Fresh finds' : kindLabel;
  const sellHref = hasShop ? '/Products' : '/join';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/" aria-label="Sellio home" className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Sellio" className="h-7 w-auto object-contain" />
          </a>
          <span className="text-sm font-semibold text-slate-400">Explore</span>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Link
                to={hasShop ? '/Dashboard' : '/Account'}
                className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"
              >
                <Store className="w-4 h-4" /> {hasShop ? 'My shop' : 'My account'}
              </Link>
            ) : (
              <>
                <Link to="/Auth" className="h-9 px-3 rounded-full text-sm font-semibold text-slate-700 inline-flex items-center hover:bg-slate-50">
                  Log in
                </Link>
                <Link
                  to="/join"
                  className="h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center"
                  style={{ background: BRAND_GRADIENT }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-3">
          <label className="relative block">
            <span className="sr-only">Search Sellio Explore</span>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for an item or shop"
              enterKeyHint="search"
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-100 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-pink-200 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-32">
        <div className="flex gap-2 overflow-x-auto py-3 -mx-4 px-4" style={hideScrollbar} role="tablist" aria-label="Filter listings">
          {KINDS.map(({ key, label }) => {
            const active = kind === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(key)}
                className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                style={active ? { background: BRAND_GRADIENT } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>

        {!filtered && shops.length > 0 && (
          <section className="mb-5" aria-labelledby="explore-shops-heading">
            <h2 id="explore-shops-heading" className="text-base font-bold text-slate-900 mb-3">Shops on Sellio</h2>
            <div className="flex gap-4 overflow-x-auto -mx-4 px-4 pb-1" style={hideScrollbar}>
              {shops.map((shop) => (
                <Link key={shop.shop_id} to={storeUrl(shop.shop_slug)} className="w-20 flex-shrink-0 flex flex-col items-center gap-1.5 text-center">
                  <ShopAvatar name={shop.shop_name} logo={shop.shop_logo_url} size={60} />
                  <span className="text-xs font-semibold text-slate-800 w-full truncate">{shop.shop_name}</span>
                  <span className="text-[11px] text-slate-400 -mt-1">{shop.item_count} {Number(shop.item_count) === 1 ? 'item' : 'items'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="explore-feed-heading">
          <h2 id="explore-feed-heading" className="text-base font-bold text-slate-900 mb-3">{heading}</h2>

          {status === 'loading' && <SkeletonGrid />}

          {status === 'error' && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <p className="text-sm text-slate-600">We couldn't load listings just now.</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" /> Try again
              </button>
            </div>
          )}

          {status === 'ready' && items.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              {filtered ? (
                <>
                  <p className="text-sm text-slate-600">Nothing matches yet.</p>
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setKind('all'); }}
                    className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Show everything
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600">No listings yet. Be the first to sell on Sellio.</p>
                  <Link to={sellHref} className="mt-3 h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
                    Start selling
                  </Link>
                </>
              )}
            </div>
          )}

          {status === 'ready' && items.length > 0 && (
            <>
              {itemsKind === 'merchants' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((shop) => <MerchantCard key={shop.shop_id} shop={shop} />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {items.map((item) => <ItemCard key={item.product_id} item={item} />)}
                </div>
              )}
              <div ref={sentinelRef} className="h-px" />
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="h-10 px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 inline-flex items-center gap-2 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Show more
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <footer className="mt-12 text-center text-xs text-slate-400 space-x-3">
          <span>Sellio Explore by Apptélier</span>
          <a href="/privacy" className="hover:text-slate-600">Privacy</a>
          <a href="/terms" className="hover:text-slate-600">Terms</a>
        </footer>
      </main>

      <Link
        to={sellHref}
        className="fixed right-5 z-40 h-12 pl-4 pr-5 rounded-full text-white font-semibold text-[15px] inline-flex items-center gap-1.5 shadow-lg shadow-pink-500/30 active:scale-95 transition-transform"
        style={{ background: BRAND_GRADIENT, bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="w-5 h-5" /> Sell
      </Link>
    </div>
  );
}
