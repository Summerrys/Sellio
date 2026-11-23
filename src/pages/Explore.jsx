import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Plus, X, Loader2, RefreshCw, Store, ChevronRight, SlidersHorizontal, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { isNativeApp } from '@/lib/nativeApp';
import { rememberReturnPath } from '@/lib/authNavigation';
import { likeErrorMessage, likesText, needsSignIn, setListingLike, toggleKnownLike, useKnownLike, useLikesFor } from '@/lib/likes';
import ExploreTabBar, { markExploreHome } from '@/components/explore/ExploreTabBar';
import ShopBell from '@/components/explore/ShopBell';
import CartLink from '@/components/explore/CartButton';
import { useRatingSummaries } from '@/lib/ratings';
import { RatingPill } from '@/components/ratings/RatingParts';
import { useSell } from '@/lib/sell';
import { listingUrl, ExploreDesktopTabs, timeAgo } from '@/components/explore/shared';
import { applyPageMeta, hasEdgeHead, SITE } from '@/lib/pageMeta';
import LoadingShapes from '@/components/ui-custom/LoadingShapes';
import { onReconnect, useOnline } from '@/lib/network';
import { keepSnapshot, loadSnapshot } from '@/lib/offlineStore';
import OfflineNote, { listNoteWords } from '@/components/ui-custom/OfflineNote';
import ExploreNoResults from '@/components/explore/ExploreNoResults';
import { SuggestionList, useExploreSuggestions, useSuggestionKeys } from '@/components/explore/ExploreSuggestions';
import { formatMoney } from '@/lib/money';
import { useAppText, N_ } from '@/lib/appText';

// Sellio Explore: a public, Carousell-style feed of items from Sellio shops.
// Anyone can browse without an account; tapping an item opens its listing page. Data comes from the explore_feed / explore_shops RPCs, which only
// return shops that are listed (tenants.is_public) and allowed to sell.

const LOGO_URL = '/branding/sellio-logo.webp';
// The visitor's colour: the default gradient, or a seller's own theme once chosen.
const BRAND_GRADIENT = 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))';
const PAGE_SIZE = 24;

const KINDS = [
  { key: 'all', label: N_('All') },
  { key: 'food', label: N_('Food & drinks') },
  { key: 'goods', label: N_('Goods') },
  { key: 'home', label: N_('Home sellers') },
  { key: 'merchants', label: N_('Merchants') },
];

const hideScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

// A listing's price in its shop's currency (lib/money.js): S$4.50, RM4.50, Rp15.000.
function formatPrice(amount, currency) {
  const value = Number(amount);
  if (amount == null || Number.isNaN(value)) return '';
  return formatMoney(value, currency);
}

const storeUrl = (slug) => `/store/${encodeURIComponent(slug)}`;
const rowKey = (row) => row.product_id || row.shop_id;

// Marked here (N_), shown through t().
function industryLabel(industry) {
  const value = String(industry || '').toLowerCase();
  if (/f.?b|cafe|restaurant|food|beverage/.test(value)) return N_('Food & drinks');
  if (/retail|fashion|electronics/.test(value)) return N_('Retail');
  if (/service|beauty|wellness|health|education/.test(value)) return N_('Services');
  return N_('Merchant');
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

const LIKE_RED = '#e11d48';

// A card's heart, on its price row: everyone sees how many likes it has; tapping it likes
// or unlikes at once (signed out: log in first, then it's liked). A seller's own listing
// shows its count with a plain heart and no button (they can't like their own). Nothing
// shows until its likes are known.
function CardHeart({ item, signedIn, onNeedSignIn }) {
  const { t } = useAppText('explore');
  const state = useKnownLike(item.product_id);
  if (!state) return null;
  const { likes, liked, own } = state;
  if (own) {
    if (!likes) return null;
    return (
      <span className="flex-shrink-0 self-start mt-[5px] mr-2.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-500" data-testid="card-likes" aria-label={t('{likes} on your listing', { likes: likesText(likes, t) })}>
        <Heart className="w-[18px] h-[18px]" fill="none" color="#94a3b8" aria-hidden="true" />
        {likes}
      </span>
    );
  }
  const named = { name: item.product_name, likes: likes ? likesText(likes, t) : '' };
  const heartLabel = likes
    ? (liked ? t('Unlike {name} ({likes})', named) : t('Like {name} ({likes})', named))
    : (liked ? t('Unlike {name}', named) : t('Like {name}', named));
  const tap = () => {
    if (!signedIn) { onNeedSignIn(item.product_id); return; }
    toggleKnownLike(item.product_id).catch((e) => {
      if (needsSignIn(e)) onNeedSignIn(item.product_id);
      else toast.error(likeErrorMessage(e, { t }));
    });
  };
  return (
    <button
      type="button"
      onClick={tap}
      aria-pressed={liked}
      aria-label={heartLabel}
      data-testid="card-heart"
      className="flex-shrink-0 self-start -mt-1.5 mr-0.5 h-10 min-w-[40px] px-2 rounded-full inline-flex items-center justify-center gap-1 text-xs font-semibold active:scale-90 transition-transform"
      style={{ color: liked ? '#be123c' : '#64748b' }}
    >
      <Heart className="w-[18px] h-[18px]" fill={liked ? LIKE_RED : 'none'} color={liked ? LIKE_RED : '#94a3b8'} aria-hidden="true" />
      {likes > 0 && <span>{likes}</span>}
    </button>
  );
}

// The card opens the listing anywhere but its heart (a button can't sit inside a link,
// so the price row is a second link to the same listing, left out of the Tab order).
function ItemCard({ item, rating = null, signedIn = false, onNeedSignIn }) {
  const { t } = useAppText('explore');
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item.image_url && !imageFailed;
  const hasDiscount = item.compare_at_price != null && Number(item.compare_at_price) > Number(item.price);
  const href = listingUrl(item.product_id);
  return (
    <div className="group bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-slate-100 hover:shadow-md transition-shadow" data-testid="item-card">
      <Link to={href} className="block">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <ShopAvatar name={item.shop_name} logo={item.shop_logo_url} size={26} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{item.shop_name}</p>
            <p className="text-[11px] text-slate-400 leading-tight flex items-center gap-1 whitespace-nowrap">
              {rating && <><RatingPill summary={rating} size={11} variant="bare" /><span aria-hidden="true">·</span></>}
              <span className="truncate">{timeAgo(item.listed_at, t)}</span>
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
              {t('Home seller')}
            </span>
          )}
        </div>
        <div className="px-2.5 pt-2">
          <p className="text-sm text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">{item.product_name}</p>
        </div>
      </Link>
      <div className="flex items-center">
        <Link to={href} tabIndex={-1} className="block flex-1 min-w-0 pl-2.5 pt-1 pb-3">
          <p className="text-sm font-bold text-slate-900">
            {formatPrice(item.price, item.currency)}
            {hasDiscount && (
              <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">
                {formatPrice(item.compare_at_price, item.currency)}
              </span>
            )}
          </p>
        </Link>
        <CardHeart item={item} signedIn={signedIn} onNeedSignIn={onNeedSignIn} />
      </div>
    </div>
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
  const { t } = useAppText('explore');
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
            <span>{t(industryLabel(shop.industry))} · {count === 1 ? t('1 item') : t('{count} items', { count })}</span>
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-700 inline-flex items-center whitespace-nowrap group-hover:text-slate-900">
          {t('Visit store')}{' '}<ChevronRight className="w-4 h-4" />
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

function ExploreHeader({ query, onQuery, onSearchNow, kind, onKind, signedIn, hasShop }) {
  const { t } = useAppText('explore');
  const [scrolled, setScrolled] = useState(false);
  // Suggestions while typing (ExploreSuggestions), under the search box while it has the focus.
  // A pick, Enter or Escape closes the list until something else is typed.
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [closedFor, setClosedFor] = useState(null);
  const suggestions = useExploreSuggestions(query, kind === 'all' ? null : kind, focused);
  const showList = focused && closedFor !== query && suggestions.length > 0;
  const pickSuggestion = (s) => {
    setClosedFor(s.type === 'search' ? s.text : query);
    searchRef.current?.blur();
    if (s.type === 'shop') navigate(storeUrl(s.slug));
    else onSearchNow(s.text);
  };
  const keys = useSuggestionKeys(showList ? suggestions : [], {
    onPick: pickSuggestion,
    onSubmit: () => { setClosedFor(query); searchRef.current?.blur(); onSearchNow(query); },
    onClose: () => setClosedFor(query),
  });
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

  const picked = KINDS.find((k) => k.key === kind)?.label;
  const pickedLabel = picked ? t(picked) : '';
  return (
    <>
      {/* Sticky, and its height never changes: the categories only slide (transform), so
          the page under it never moves. Where they were, the feed shows through. */}
      <header className="sticky top-0 z-30 pointer-events-none">
        <div
          className={`relative z-[2] bg-white pointer-events-auto border-b transition-colors duration-200 ${folded ? 'border-slate-100' : 'border-transparent'}`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
              {/* In the app, Sellio's home is this page: the logo stays here instead of
                  reloading it and adding a second copy to Back. Websites keep the home link. */}
              {isNativeApp() ? (
                <Link to="/explore" replace aria-label={t('Sellio home')} className="flex items-center gap-2">
                  <img src={LOGO_URL} alt="Sellio" className="h-10 w-auto object-contain" />
                </Link>
              ) : (
                <a href="/" aria-label={t('Sellio home')} className="flex items-center gap-2">
                  <img src={LOGO_URL} alt="Sellio" className="h-10 w-auto object-contain" />
                </a>
              )}
              <span className="text-sm font-semibold text-slate-400 md:hidden">{t('Explore')}</span>
              <ExploreDesktopTabs />
              <div className="ml-auto flex items-center gap-2">
                {signedIn ? (
                  <>
                  <Link
                    to={hasShop ? '/Dashboard' : '/Account'}
                    className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"
                  >
                    <Store className="w-4 h-4" /> {hasShop ? t('My shop') : t('My account')}
                  </Link>
                  <ShopBell />
                  </>
                ) : (
                  <>
                    <Link to="/Auth" className="h-9 px-3 rounded-full text-sm font-semibold text-slate-700 inline-flex items-center hover:bg-slate-50">
                      {t('Log in')}
                    </Link>
                    <Link
                      to="/join"
                      className="h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center"
                      style={{ background: BRAND_GRADIENT }}
                    >
                      {t('Sign up')}
                    </Link>
                  </>
                )}
              </div>
            </div>
          {/* The cart sits beside the search (the row above has no room for it on phones);
              its 44px tap area overhangs the row's padding, so the row keeps its height. */}
          <div className="relative max-w-6xl mx-auto px-3 sm:px-4 pb-2 flex items-center gap-1">
            <label className="relative block flex-1 min-w-0">
              <span className="sr-only">{t('Search Sellio Explore')}</span>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={keys.onKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-activedescendant={showList && keys.active >= 0 ? `${listId}-${keys.active}` : undefined}
                placeholder={t('Search for an item or shop')}
                enterKeyHint="search"
                className={`w-full h-[38px] pl-9 ${query ? 'pr-[76px]' : 'pr-11'} rounded-[10px] bg-slate-100 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-pink-200 [&::-webkit-search-cancel-button]:hidden`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQuery('')}
                  aria-label={t('Clear search')}
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
                aria-label={kind === 'all' ? t('Show categories') : t('Show categories ({pickedLabel} picked)', { pickedLabel })}
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
            <CartLink className="flex-shrink-0 -my-[3px] -mr-1" />
            {showList && (
              <SuggestionList id={listId} items={suggestions} typed={query} active={keys.active} onPick={pickSuggestion} onHover={keys.setActive} />
            )}
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
            <div className="flex gap-2 overflow-x-auto px-3 sm:px-4 pb-2" style={hideScrollbar} role="tablist" aria-label={t('Filter listings')}>
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
                    {t(label)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

export default function Explore() {
  const { t } = useAppText('explore');
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
  // When the feed on screen was loaded, and whether it's the copy kept on the phone (the
  // first page of everything, for opening Explore with no connection: UX states, 4).
  const online = useOnline();
  const [feedAt, setFeedAt] = useState(null);
  const [feedKept, setFeedKept] = useState(false);
  const requestId = useRef(0);
  const sentinelRef = useRef(null);
  const navigate = useNavigate();

  // The hearts on the cards: their likes, asked for as cards appear.
  useLikesFor(itemsKind === 'merchants' ? [] : items.map((i) => i.product_id), appUser?.id || null);
  const signInToLike = useCallback((productId) => {
    rememberReturnPath(`/explore?like=${encodeURIComponent(productId)}`);
    toast.info(t('Log in to like listings.'));
    navigate('/Auth');
  }, [navigate]);

  // Back from signing in to like a card: like it (the database checks it can be liked).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('like');
    if (!productId) return;
    params.delete('like');
    const rest = params.toString();
    navigate({ search: rest ? `?${rest}` : '' }, { replace: true });
    setListingLike(productId, true)
      .then(() => toast.success(t('Liked. Find it in Me › My likes.')))
      .catch((e) => { if (!needsSignIn(e)) toast.error(likeErrorMessage(e, { t })); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markExploreHome();
    // Opened at this address on the website: its head is written already (public/_worker.js).
    if (hasEdgeHead()) return undefined;
    return applyPageMeta({
      title: t('Explore shops and items · Sellio'),
      description: t('Browse shops and home sellers on Sellio, and order from them directly.'),
      canonical: `${SITE}/explore`,
    });
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
    const everything = !search && kind === 'all';
    setStatus('loading');
    setHasMore(false);
    fetchPage(0)
      .then(({ kind: forKind, rows }) => {
        if (id !== requestId.current) return;
        setItems(rows);
        setItemsKind(forKind);
        setHasMore(rows.length === PAGE_SIZE);
        setStatus('ready');
        setFeedAt(Date.now());
        setFeedKept(false);
        if (everything) keepSnapshot('explore:feed', rows);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        console.warn('Explore feed failed:', err);
        // No connection: the listings kept on the phone, when there are some.
        const kept = everything ? loadSnapshot('explore:feed') : null;
        if (Array.isArray(kept?.data) && kept.data.length) {
          setItems(kept.data);
          setItemsKind('all');
          setStatus('ready');
          setFeedAt(kept.savedAt);
          setFeedKept(true);
          return;
        }
        setStatus('error');
      });
  }, [fetchPage, reloadKey, search, kind]);

  // The connection is back: a feed that couldn't load (or is the copy) loads again.
  const feedStale = useRef(false);
  feedStale.current = status === 'error' || feedKept;
  useEffect(() => onReconnect(() => { if (feedStale.current) setReloadKey((k) => k + 1); }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('explore_shops', { p_limit: 20 });
        if (error) throw error;
        if (!cancelled) setShops(data || []);
        keepSnapshot('explore:shops', data || []);
      } catch (err) {
        console.warn('Explore shops failed:', err);
        // No connection: the shops kept on the phone, if none are on screen.
        const kept = loadSnapshot('explore:shops');
        if (!cancelled && Array.isArray(kept?.data)) setShops((prev) => (prev.length ? prev : kept.data));
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
  const picked = KINDS.find((k) => k.key === kind)?.label;
  const kindLabel = kind === 'merchants' ? t('Merchants on Sellio') : (picked ? t(picked) : '');
  const heading = search ? t('Results for “{search}”', { search }) : kind === 'all' ? t('Fresh finds') : kindLabel;
  const sellHref = hasShop ? '/explore/listings?new=1' : '/join';

  return (
    <div className="min-h-screen bg-slate-50">
      <ExploreHeader
        query={query}
        onQuery={setQuery}
        onSearchNow={(text) => { setQuery(text); setSearch(text.trim()); }}
        kind={kind}
        onKind={setKind}
        signedIn={signedIn}
        hasShop={hasShop}
      />

      <main className="max-w-6xl mx-auto px-2 sm:px-4 pb-32">
        {/* The page's heading for search engines and screen readers (the header shows the search). */}
        <h1 className="sr-only">{t('Explore shops and items on Sellio')}</h1>
        {!filtered && shops.length > 0 && (
          <section className="pt-2.5 mb-3" aria-labelledby="explore-shops-heading">
            <h2 id="explore-shops-heading" className="text-[15px] font-bold text-slate-900 mb-2 px-1 sm:px-0">{t('Shops on Sellio')}</h2>
            <div className="flex gap-3.5 overflow-x-auto -mx-2 px-3 sm:-mx-4 sm:px-4 pb-1" style={hideScrollbar}>
              {shops.map((shop) => (
                <Link key={shop.shop_id} to={storeUrl(shop.shop_slug)} className="w-[66px] flex-shrink-0 flex flex-col items-center gap-1 text-center">
                  <ShopAvatar name={shop.shop_name} logo={shop.shop_logo_url} size={52} />
                  <span className="text-xs font-semibold text-slate-800 w-full truncate">{shop.shop_name}</span>
                  {ratings[shop.shop_id]
                    ? <span className="-mt-0.5"><RatingPill summary={ratings[shop.shop_id]} size={11} /></span>
                    : <span className="text-[11px] text-slate-500 -mt-0.5">{Number(shop.item_count) === 1 ? t('1 item') : t('{count} items', { count: shop.item_count })}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="explore-feed-heading" className={!filtered && shops.length > 0 ? '' : 'pt-2.5'}>
          <h2 id="explore-feed-heading" className="text-[15px] font-bold text-slate-900 mb-2 px-1 sm:px-0">{heading}</h2>

          {status === 'loading' && <LoadingShapes label={t('Loading listings')} t={t}><SkeletonGrid /></LoadingShapes>}

          {/* Shown without a fresh load: when the listings are from, and what still works. */}
          {status === 'ready' && items.length > 0 && feedAt && (!online || feedKept) && (
            <OfflineNote className="mb-2.5" {...listNoteWords({
              online, what: t('listings'), at: feedAt,
              offlineText: t('You can look through them. Opening a listing or ordering needs the internet.'),
              failedText: t('Check your connection, then try again.'),
            }, undefined, t)} action={online ? { label: t('Try again'), onClick: () => setReloadKey((k) => k + 1) } : undefined} />
          )}

          {status === 'error' && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <p className="text-sm text-slate-600">{online ? t('We couldn’t load listings just now.') : t('You’re offline, so listings can’t load just now. They’ll load when you’re back online.')}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"
              >
                <RefreshCw className="w-4 h-4" />{' '}{t('Try again')}
              </button>
            </div>
          )}

          {/* A search that found nothing: the likely spelling, and popular listings to try. */}
          {status === 'ready' && items.length === 0 && !!search && (
            <ExploreNoResults
              search={search}
              kind={kind === 'all' ? null : kind}
              onSearch={(text) => { setQuery(text); setSearch(text.trim()); }}
              onShowAll={() => { setQuery(''); setSearch(''); setKind('all'); }}
            />
          )}

          {status === 'ready' && items.length === 0 && !search && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              {filtered ? (
                <>
                  <p className="text-sm text-slate-600">{t('Nothing matches yet.')}</p>
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setKind('all'); }}
                    className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('Show everything')}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600">{t('No listings yet. Be the first to sell on Sellio.')}</p>
                  <Link to={sellHref} className="mt-3 h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
                    {t('Start selling')}
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
                  {items.map((item) => <ItemCard key={item.product_id} item={item} rating={ratings[item.shop_id]} signedIn={signedIn} onNeedSignIn={signInToLike} />)}
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
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}{' '}{t('Show more')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* The same footer as the ordering page. Privacy and Terms are under Me. */}
        <footer className="mt-12" style={{ textAlign: 'center', padding: '16px 0 24px', color: '#c8d0dc', fontSize: 9, letterSpacing: '0.03em' }}>
          {t('Powered by')}{' '}
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
        style={{ background: BRAND_GRADIENT, bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="w-5 h-5" />{' '}{t('Sell')}
      </Link>
      <ExploreTabBar active="home" />
    </div>
  );
}
