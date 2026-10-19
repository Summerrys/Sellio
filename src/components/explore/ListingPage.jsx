import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Share2, MessageCircle, ShoppingBag, Store, MapPin, Truck, CalendarClock,
  ChevronLeft, ChevronRight, Pencil, X, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { exploreItem, getChatUser } from '@/lib/chat';
import { rememberReturnPath } from '@/lib/authNavigation';
import { useBackToClose } from '@/lib/useBackToClose';
import { useRatingSummaries } from '@/lib/ratings';
import { RatingPill, RatingSheet } from '@/components/ratings/RatingParts';
import {
  BRAND_COLOR, BRAND_GRADIENT, BOTTOM_INSET, PUBLIC_ORIGIN, hideScrollbar, formatPrice, timeAgo,
  ShopAvatar, ItemImage, storeUrl, listingUrl, chatUrl, newChatUrl, goBack,
} from './shared';

// One Explore listing. The photo fills the screen from the very top (behind the
// phone's status bar); scrolling down turns the floating buttons into a solid header
// that sits below the status bar.

const clamp = (n) => Math.min(1, Math.max(0, n));

function listedLabel(iso) {
  const ago = timeAgo(iso);
  return ago ? `Listed ${ago.charAt(0).toLowerCase()}${ago.slice(1)}` : '';
}

function sinceLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `On Sellio since ${d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}`;
}

function shopKind(shop) {
  if (shop?.type === 'individual') return 'Home seller';
  const v = String(shop?.industry || '').toLowerCase();
  if (/f.?b|cafe|restaurant|food|beverage/.test(v)) return 'Food & drinks';
  if (/retail|fashion|electronics/.test(v)) return 'Retail';
  return 'Merchant';
}

function dealOptions(selling, currency) {
  if (!selling) return [];
  const out = [];
  if (selling.collection?.enabled) {
    out.push({ icon: MapPin, title: 'Collection', detail: selling.collection.area || 'Arrange with the seller' });
  }
  if (selling.delivery?.enabled) {
    const fee = Number(selling.delivery.fee) || 0;
    let detail = selling.delivery.fee_mode === 'extra' && fee > 0 ? `${formatPrice(fee, currency)} delivery fee` : 'Delivery included';
    if (selling.delivery.fee_mode === 'extra' && Number(selling.delivery.free_above) > 0) {
      detail += ` · free above ${formatPrice(selling.delivery.free_above, currency)}`;
    }
    out.push({ icon: Truck, title: 'Delivery', detail });
  }
  if (selling.preorder?.enabled) {
    const days = Number(selling.preorder.min_days) || 1;
    out.push({ icon: CalendarClock, title: 'Pre-order', detail: `Order at least ${days} ${days === 1 ? 'day' : 'days'} ahead` });
  }
  return out;
}

function RoundButton({ label, onClick, solid, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 rounded-full flex items-center justify-center text-slate-900 active:scale-95 transition-transform"
      style={{
        background: `rgba(255,255,255,${0.92 * solid})`,
        boxShadow: solid > 0.05 ? `0 1px 6px rgba(15,23,42,${0.18 * solid})` : 'none',
      }}
    >
      {children}
    </button>
  );
}

function PhotoViewer({ images, start, name, onClose }) {
  const scroller = useRef(null);
  const [index, setIndex] = useState(start);
  useBackToClose(true, onClose);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Photos of ${name}`} className="fixed inset-0 z-[60] bg-black flex flex-col" data-pull-refresh-block>
      <div className="flex items-center justify-between px-3 text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
        <span className="text-sm font-semibold pl-2">{images.length > 1 ? `${index + 1} / ${images.length}` : ''}</span>
        <button type="button" onClick={onClose} aria-label="Close photos" autoFocus className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div
        ref={scroller}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        style={hideScrollbar}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {images.map((src) => (
          <div key={src} className="w-full h-full flex-shrink-0 snap-center flex items-center justify-center">
            <img src={src} alt="" className="max-w-full max-h-full object-contain" />
          </div>
        ))}
      </div>
      <div style={{ height: BOTTOM_INSET }} />
    </div>
  );
}

function Gallery({ images, name, onOpen }) {
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);
  const go = (step) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(images.length - 1, Math.max(0, index + step));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="relative bg-slate-100">
      <div
        ref={scroller}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={hideScrollbar}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {images.length ? images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}`}
            className="w-full flex-shrink-0 snap-center aspect-square block"
          >
            <img src={src} alt={i === 0 ? name : ''} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="sellio-photo w-full h-full object-cover" />
          </button>
        )) : (
          <ItemImage name={name} className="w-full aspect-square text-7xl" />
        )}
      </div>
      {/* Keeps the phone's status bar and the floating buttons readable on bright photos. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/35 via-black/10 to-transparent"
        style={{ height: 'calc(96px + env(safe-area-inset-top, 0px))' }}
      />
      {images.length > 1 && (
        <>
          <span className="absolute right-3 bottom-3 text-xs font-semibold text-white bg-black/55 rounded-full px-2.5 py-1">
            {index + 1}/{images.length}
          </span>
          <div className="hidden md:flex absolute inset-y-0 left-2 items-center">
            <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className="w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="hidden md:flex absolute inset-y-0 right-2 items-center">
            <button type="button" onClick={() => go(1)} disabled={index === images.length - 1} aria-label="Next photo" className="w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-0">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen animate-pulse" aria-hidden="true">
      <div className="aspect-square bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="h-7 w-28 rounded bg-slate-200" />
        <div className="h-5 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-24 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export default function ListingPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ status: 'loading', data: null });
  const [progress, setProgress] = useState(0);
  const [viewerAt, setViewerAt] = useState(null);
  const [showFullText, setShowFullText] = useState(false);
  const galleryRef = useRef(null);
  const headerRef = useRef(null);

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null });
    try {
      const data = await exploreItem(productId);
      setState(data ? { status: 'ready', data } : { status: 'missing', data: null });
    } catch (err) {
      console.warn('Listing failed to load:', err);
      setState({ status: 'error', data: null });
    }
  }, [productId]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowFullText(false);
    load();
  }, [load]);

  const item = state.data?.product;
  const shop = state.data?.shop;
  const viewer = state.data?.viewer;
  const [shopRatings] = useRatingSummaries(shop?.id ? [shop.id] : []);
  const shopRating = shop?.id ? shopRatings[shop.id] || null : null;
  const [ratingOpen, setRatingOpen] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    const previous = document.title;
    document.title = `${item.name} · ${shop?.name || 'Sellio'}`;
    return () => { document.title = previous; };
  }, [item, shop]);

  // Photo → header as the photo scrolls away.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = galleryRef.current?.offsetHeight || window.innerWidth;
      const header = headerRef.current?.offsetHeight || 56;
      const start = h * 0.45;
      const end = Math.max(start + 1, h - header);
      setProgress(clamp((window.scrollY - start) / (end - start)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [state.status]);

  const openChat = useCallback(async () => {
    if (!item) return;
    const user = await getChatUser().catch(() => null);
    if (!user) {
      rememberReturnPath(`${listingUrl(item.id)}?chat=1`);
      toast.info('Sign in to chat with the seller.');
      navigate('/Auth');
      return;
    }
    navigate(viewer?.conversation_id ? chatUrl(viewer.conversation_id) : newChatUrl(item.id));
  }, [item, viewer, navigate]);

  // Back from signing in to chat: go straight to the chat.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const params = new URLSearchParams(location.search);
    if (params.get('chat') !== '1') return;
    params.delete('chat');
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
    if (!viewer?.is_own) openChat();
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    if (!item) return;
    const url = `${PUBLIC_ORIGIN}${listingUrl(item.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: item.name, text: `${item.name} on Sellio`, url }); return; }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.info(url);
    }
  };

  const back = () => goBack(navigate);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="fixed top-0 inset-x-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
            <RoundButton label="Back" onClick={back} solid={1}><ArrowLeft className="w-5 h-5" /></RoundButton>
          </div>
        </div>
        <Skeleton />
      </div>
    );
  }

  if (state.status !== 'ready') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
            <RoundButton label="Back" onClick={back} solid={0}><ArrowLeft className="w-5 h-5" /></RoundButton>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <p className="text-base font-semibold text-slate-900">
            {state.status === 'missing' ? "This listing isn't available" : "We couldn't load this listing"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {state.status === 'missing' ? 'It may have been sold or removed.' : 'Check your connection and try again.'}
          </p>
          <div className="mt-4 flex gap-2">
            {state.status === 'error' && (
              <button type="button" onClick={load} className="h-10 px-4 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">Try again</button>
            )}
            <Link to="/explore" replace className="h-10 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
              Browse Explore
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const images = item.images || [];
  const currency = shop.currency;
  const hasDiscount = item.compare_at_price != null && Number(item.compare_at_price) > Number(item.price);
  const percentOff = hasDiscount ? Math.round((1 - Number(item.price) / Number(item.compare_at_price)) * 100) : 0;
  const isOwn = !!viewer?.is_own;
  const deals = dealOptions(state.data.selling, currency);
  const description = String(item.description || '').trim();
  const longText = description.length > 280 || description.split('\n').length > 6;
  const more = state.data.more || [];
  const buyHref = `${storeUrl(shop.slug)}?item=${encodeURIComponent(item.id)}`;
  const itemCount = Number(shop.item_count) || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-40"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: `rgba(255,255,255,${progress})`,
          boxShadow: progress > 0.98 ? '0 1px 0 rgba(15,23,42,0.08)' : 'none',
        }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center gap-2">
          <RoundButton label="Back" onClick={back} solid={1 - progress}><ArrowLeft className="w-5 h-5" /></RoundButton>
          <p className="flex-1 min-w-0 truncate text-[15px] font-semibold text-slate-900" style={{ opacity: progress }} aria-hidden={progress < 0.5}>
            {item.name}
          </p>
          <RoundButton label="Share" onClick={share} solid={1 - progress}><Share2 className="w-5 h-5" /></RoundButton>
        </div>
      </header>

      <div className="max-w-2xl mx-auto bg-white" style={{ paddingBottom: `calc(88px + ${BOTTOM_INSET})` }}>
        <div ref={galleryRef}>
          <Gallery images={images} name={item.name} onOpen={setViewerAt} />
        </div>

        {isOwn && state.data.visible === false && (
          <div className="mx-4 mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2 text-sm text-amber-900">
            <EyeOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Only you can see this. It shows on Explore once your shop is listed and the item is active.</span>
          </div>
        )}

        <section className="px-4 pt-4 pb-4">
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
            <span className="text-2xl font-bold text-slate-900">{formatPrice(item.price, currency)}</span>
            {hasDiscount && (
              <>
                <span className="text-sm text-slate-400 line-through">{formatPrice(item.compare_at_price, currency)}</span>
                {percentOff > 0 && <span className="text-xs font-bold text-rose-600 bg-rose-50 rounded px-1.5 py-0.5">-{percentOff}%</span>}
              </>
            )}
          </div>
          <h1 className="mt-1.5 text-lg font-semibold text-slate-900 leading-snug break-words">{item.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {item.sold_out && <span className="font-semibold text-red-700 bg-red-50 rounded-full px-2.5 py-1">Sold out</span>}
            <span className="text-slate-500">{listedLabel(item.listed_at)}</span>
          </div>
        </section>

        <div className="h-2 bg-slate-50" />

        <section className="px-4 py-4">
          <Link to={storeUrl(shop.slug)} className="flex items-center gap-3 group">
            <ShopAvatar name={shop.name} logo={shop.logo_url} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-slate-900 truncate">{shop.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {shopKind(shop)} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </p>
              {sinceLabel(shop.since) && <p className="text-xs text-slate-400 truncate">{sinceLabel(shop.since)}</p>}
            </div>
            <span className="h-9 px-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1 group-hover:bg-slate-50">
              <Store className="w-4 h-4" /> View shop
            </span>
          </Link>
          {shopRating && (
            <button
              type="button"
              onClick={() => setRatingOpen(true)}
              className="mt-2 ml-[60px] inline-flex items-center gap-1 rounded-full px-2 py-1 -mx-2 hover:bg-slate-50"
            >
              <RatingPill summary={shopRating} size={13} variant="long" />
              <span className="text-slate-400 text-sm" aria-hidden="true">›</span>
            </button>
          )}
          <RatingSheet open={ratingOpen} onClose={() => setRatingOpen(false)} shopName={shop.name} summary={shopRating} shopId={shop.id} />
        </section>

        {deals.length > 0 && (
          <>
            <div className="h-2 bg-slate-50" />
            <section className="px-4 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Deal options</h2>
              <ul className="mt-3 space-y-3">
                {deals.map(({ icon: Icon, title, detail }) => (
                  <li key={title} className="flex gap-3">
                    <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4.5 h-4.5 text-slate-600" style={{ width: 18, height: 18 }} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="text-sm text-slate-500 break-words">{detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {description && (
          <>
            <div className="h-2 bg-slate-50" />
            <section className="px-4 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Description</h2>
              <p className={`mt-2 text-[15px] leading-relaxed text-slate-700 whitespace-pre-line break-words ${longText && !showFullText ? 'line-clamp-6' : ''}`}>
                {description}
              </p>
              {longText && (
                <button type="button" onClick={() => setShowFullText((v) => !v)} className="mt-2 text-sm font-semibold" style={{ color: BRAND_COLOR }}>
                  {showFullText ? 'Show less' : 'Read more'}
                </button>
              )}
            </section>
          </>
        )}

        {more.length > 0 && (
          <>
            <div className="h-2 bg-slate-50" />
            <section className="py-4">
              <div className="px-4 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-slate-900">More from {shop.name}</h2>
                <Link to={storeUrl(shop.slug)} className="text-sm font-semibold" style={{ color: BRAND_COLOR }}>See all</Link>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1" style={hideScrollbar}>
                {more.map((m) => (
                  <Link key={m.id} to={listingUrl(m.id)} className="w-36 flex-shrink-0">
                    <ItemImage src={m.image_url} name={m.name} className="w-36 h-36 text-3xl" rounded="rounded-xl" />
                    <p className="mt-1.5 text-sm text-slate-800 line-clamp-2 leading-snug">{m.name}</p>
                    <p className="text-sm font-bold text-slate-900">{formatPrice(m.price, currency)}</p>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200" style={{ paddingBottom: BOTTOM_INSET }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-3">
          {isOwn ? (
            <>
              <Link
                to={`/explore/listings?edit=${encodeURIComponent(item.id)}`}
                className="flex-1 h-12 rounded-xl border-2 text-[15px] font-semibold inline-flex items-center justify-center gap-2"
                style={{ borderColor: BRAND_COLOR, color: BRAND_COLOR }}
              >
                <Pencil className="w-4 h-4" /> Edit listing
              </Link>
              <Link
                to={storeUrl(shop.slug)}
                className="flex-1 h-12 rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
                style={{ background: BRAND_GRADIENT }}
              >
                <Store className="w-4 h-4" /> View in shop
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={openChat}
                className="flex-1 h-12 rounded-xl border-2 bg-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ borderColor: BRAND_COLOR, color: BRAND_COLOR }}
              >
                <MessageCircle className="w-5 h-5" /> Chat
              </button>
              {item.sold_out ? (
                <span className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-400 text-[15px] font-semibold inline-flex items-center justify-center">
                  Sold out
                </span>
              ) : (
                <Link
                  to={buyHref}
                  className="flex-1 h-12 rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: BRAND_GRADIENT }}
                >
                  <ShoppingBag className="w-5 h-5" /> Buy
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {viewerAt != null && images.length > 0 && (
        <PhotoViewer images={images} start={viewerAt} name={item.name} onClose={() => setViewerAt(null)} />
      )}
    </div>
  );
}
