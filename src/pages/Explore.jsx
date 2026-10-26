import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, X, Loader2, RefreshCw, Store, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { isNativeApp } from '@/lib/nativeApp';
import ExploreTabBar, { markExploreHome } from '@/components/explore/ExploreTabBar';
import ShopBell from '@/components/explore/ShopBell';
import { useRatingSummaries } from '@/lib/ratings';
import { RatingPill } from '@/components/ratings/RatingParts';
import { useSell } from '@/lib/sell';
import { listingUrl, ExploreDesktopTabs } from '@/components/explore/shared';

// Sellio Explore: a public, Carousell-style feed of items from Sellio shops.
// Anyone can browse without an account; tapping an item opens its listing page. Data comes from the explore_feed / explore_shops RPCs, which only
// return shops that are listed (tenants.is_public) and allowed to sell.

const LOGO_URL = '/branding/sellio-logo.webp';
// The visitor's colour: the default gradient, or a seller's own theme once chosen.
const BRAND_GRADIENT = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
// Base44's Android app already keeps pages clear of the system navigation bar.
const NATIVE_ANDROID = typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent) && isNativeApp();
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
        decoding="async"
        onError={() => setFailed(true)}
        className="sellio-photo rounded-full object-cover bg-white border border-slate-100 flex-shrink-0"
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

function ItemCard({ item, rating = null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item.image_url && !imageFailed;
  const hasDiscount = item.compare_at_price != null && Number(item.compare_at_price) > Number(item.price);
  return (
    <Link
      to={listingUrl(item.product_id)}
      className="group block bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-slate-100 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <ShopAvatar name={item.shop_name} logo={item.shop_logo_url} size={26} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{item.shop_name}</p>
          <p className="text-[11px] text-slate-400 leading-tight flex items-center gap-1 whitespace-nowrap">
            {rating && <><RatingPill summary={rating} size={11} variant="bare" /><span aria-hidden="true">·</span></>}
            <span className="truncate">{timeAgo(item.listed_at)}</span>
          </p>
        </div>
      </div>
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {showImage ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="sellio-photo w-full h-full object-cover group-hover:scale-[1.03] transition-[transform,opacity] duration-300"
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
      decoding="async"
      onError={() => setFailed(true)}
      className="sellio-photo aspect-square w-full rounded-lg object-cover bg-slate-100"
    />
  );
}

// One card per paid merchant: its storefront, not a flood of its items.
function MerchantCard({ shop, rating = null }) {
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
          <p className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
            {rating && <><RatingPill summary={rating} size={12} /><span aria-hidden="true">·</span></>}
            <span>{industryLabel(shop.industry)} · {count} {count === 1 ? 'item' : 'items'}</span>
          </p>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
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

// Explore's top: the logo row and search stay; the categories under them slide away
// behind the search bar when scrolling down (a button in the search bar brings them
// back until the next scroll down) and slide back at the top of the page. The header
// sits fixed over the page and only moves (transform and opacity), never resizing
// anything, so the slide stays smooth and the page under it never jumps. It keeps its
// own scroll state, so the feed doesn't re-render as it slides.
const FOLD_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

function ExploreHeader({ query, onQuery, kind, onKind, signedIn, hasShop }) {
  const [scrolled, setScrolled] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekRef = useRef({ open: false, fromY: 0 });
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled((was) => (was ? y > 8 : y > 40));
      const opened = peekRef.current;
      if (opened.open) {
        if (y < opened.fromY) opened.fromY = y;                                // up a little: count from here
        else if (y - opened.fromY > 12) { opened.open = false; setPeek(false); } // any scroll down folds them
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!scrolled) { peekRef.current.open = false; setPeek(false); }
  }, [scrolled]);
  const folded = scrolled && !peek;
  const openCategories = () => {
    peekRef.current = { open: true, fromY: window.scrollY };
    setPeek(true);
  };
  const pick = (key) => {
    onKind(key);
    // Picked while scrolled down: back to the top, where the new results start.
    if (scrolled) {
      peekRef.current.open = false;
      setPeek(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Room for the fixed header at the top of the page (its height never changes).
  const headerRef = useRef(null);
  const [height, setHeight] = useState(null);
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return undefined;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pickedLabel = KINDS.find((k) => k.key === kind)?.label;
  return (
    <>
      <header ref={headerRef} className="fixed top-0 inset-x-0 z-30 pointer-events-none">
        <div
          className={`relative z-[2] bg-white pointer-events-auto border-b transition-colors duration-200 ${folded ? 'border-slate-100' : 'border-transparent'}`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
              {/* In the app, Sellio's home is this page: the logo stays here instead of
                  reloading it and adding a second copy to Back. Websites keep the home link. */}
              {isNativeApp() ? (
                <Link to="/explore" replace aria-label="Sellio home" className="flex items-center gap-2">
                  <img src={LOGO_URL} alt="Sellio" className="h-10 w-auto object-contain" />
                </Link>
              ) : (
                <a href="/" aria-label="Sellio home" className="flex items-center gap-2">
                  <img src={LOGO_URL} alt="Sellio" className="h-10 w-auto object-contain" />
                </a>
              )}
              <span className="text-sm font-semibold text-slate-400 md:hidden">Explore</span>
              <ExploreDesktopTabs />
              <div className="ml-auto flex items-center gap-2">
                {signedIn ? (
                  <>
                  <Link
                    to={hasShop ? '/Dashboard' : '/Account'}
                    className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"
                  >
                    <Store className="w-4 h-4" /> {hasShop ? 'My shop' : 'My account'}
                  </Link>
                  <ShopBell />
                  </>
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
          <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-2">
            <label className="relative block">
              <span className="sr-only">Search Sellio Explore</span>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search for an item or shop"
                enterKeyHint="search"
                className={`w-full h-[38px] pl-9 ${query ? 'pr-[76px]' : 'pr-11'} rounded-[10px] bg-slate-100 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-pink-200 [&::-webkit-search-cancel-button]:hidden`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
                  style={{ transform: `translate3d(${folded ? -36 : 0}px, -50%, 0)`, transition: `transform 220ms ${FOLD_EASE}` }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={openCategories}
                tabIndex={folded ? 0 : -1}
                aria-hidden={folded ? undefined : true}
                aria-label={kind === 'all' ? 'Show categories' : `Show categories (${pickedLabel} picked)`}
                className="absolute right-1 top-1/2 w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-700"
                style={{
                  transform: `translate3d(0, -50%, 0) scale(${folded ? 1 : 0.6})`,
                  opacity: folded ? 1 : 0,
                  pointerEvents: folded ? 'auto' : 'none',
                  transition: `transform 220ms ${FOLD_EASE}, opacity 160ms ease`,
                }}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {kind !== 'all' && <span className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full" style={{ background: 'rgb(var(--color-primary, 37 99 235))' }} />}
              </button>
            </label>
          </div>
        </div>
        <div
          className="relative z-[1] bg-white border-b border-slate-100"
          aria-hidden={folded || undefined}
          style={{
            transform: folded ? 'translate3d(0, -100%, 0)' : 'translate3d(0, 0, 0)',
            opacity: folded ? 0 : 1,
            visibility: folded ? 'hidden' : 'visible',
            pointerEvents: folded ? 'none' : 'auto',
            willChange: 'transform',
            transition: `transform 240ms ${FOLD_EASE}, opacity 180ms ease, visibility 0s linear ${folded ? '240ms' : '0s'}`,
          }}
        >
          <div className="max-w-6xl mx-auto">
            <div className="flex gap-2 overflow-x-auto px-3 sm:px-4 pb-2" style={hideScrollbar} role="tablist" aria-label="Filter listings">
              {KINDS.map(({ key, label }) => {
                const active = kind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => pick(key)}
                    className={`h-[30px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${active ? 'text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    style={active ? { background: BRAND_GRADIENT } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden="true" style={{ height: height ?? 'calc(132px + env(safe-area-inset-top, 0px))' }} />
    </>
  );
}

export default function Explore() {
  const { appUser } = useAppUser() || {};
  const signedIn = !!appUser;
  const hasShop = !!appUser?.tenant_id;
  const { openSell } = useSell();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState([]);
  const [itemsKind, setItemsKind] = useState('all');
  const [shops, setShops] = useState([]);
  // Shops' ratings (3+ buyers), for the shop row and each card's seller line.
  const [ratings] = useRatingSummaries([...shops.map((s) => s.shop_id), ...items.map((i) => i.shop_id)]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Explore shops and items · Sellio';
    markExploreHome();
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
  const sellHref = hasShop ? '/explore/listings?new=1' : '/join';

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreHeader
        query={query}
        onQuery={setQuery}
        kind={kind}
        onKind={setKind}
        signedIn={signedIn}
        hasShop={hasShop}
      />

      <main className="max-w-6xl mx-auto px-2 sm:px-4 pb-32">
        {!filtered && shops.length > 0 && (
          <section className="pt-2.5 mb-3" aria-labelledby="explore-shops-heading">
            <h2 id="explore-shops-heading" className="text-[15px] font-bold text-slate-900 mb-2 px-1 sm:px-0">Shops on Sellio</h2>
            <div className="flex gap-3.5 overflow-x-auto -mx-2 px-3 sm:-mx-4 sm:px-4 pb-1" style={hideScrollbar}>
              {shops.map((shop) => (
                <Link key={shop.shop_id} to={storeUrl(shop.shop_slug)} className="w-[66px] flex-shrink-0 flex flex-col items-center gap-1 text-center">
                  <ShopAvatar name={shop.shop_name} logo={shop.shop_logo_url} size={52} />
                  <span className="text-xs font-semibold text-slate-800 w-full truncate">{shop.shop_name}</span>
                  {ratings[shop.shop_id]
                    ? <span className="-mt-0.5"><RatingPill summary={ratings[shop.shop_id]} size={11} /></span>
                    : <span className="text-[11px] text-slate-500 -mt-0.5">{shop.item_count} {Number(shop.item_count) === 1 ? 'item' : 'items'}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="explore-feed-heading" className={!filtered && shops.length > 0 ? '' : 'pt-2.5'}>
          <h2 id="explore-feed-heading" className="text-[15px] font-bold text-slate-900 mb-2 px-1 sm:px-0">{heading}</h2>

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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {items.map((shop) => <MerchantCard key={shop.shop_id} shop={shop} rating={ratings[shop.shop_id]} />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
                  {items.map((item) => <ItemCard key={item.product_id} item={item} rating={ratings[item.shop_id]} />)}
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

        {/* The same footer as the ordering page. Privacy and Terms are under Me. */}
        <footer className="mt-12" style={{ textAlign: 'center', padding: '16px 0 24px', color: '#c8d0dc', fontSize: 9, letterSpacing: '0.03em' }}>
          Powered by{' '}
          <span style={{ fontWeight: 700, background: 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Sellio
          </span>
        </footer>
      </main>

      {/* Phones use the bottom bar's Sell; wider screens keep this button. */}
      <Link
        to={sellHref}
        onClick={hasShop ? (event) => { event.preventDefault(); openSell(); } : undefined}
        className="fixed right-5 z-40 h-12 pl-4 pr-5 rounded-full text-white font-semibold text-[15px] hidden md:inline-flex items-center gap-1.5 shadow-lg shadow-black/20 active:scale-95 transition-transform"
        style={{ background: BRAND_GRADIENT, bottom: NATIVE_ANDROID ? '20px' : 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="w-5 h-5" /> Sell
      </Link>
      <ExploreTabBar active="home" />
    </div>
  );
}
