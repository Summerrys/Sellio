import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppText } from '@/lib/appText';
import { RatingPill } from '@/components/ratings/RatingParts';
import { ItemImage, ShopAvatar, formatPrice, hideScrollbar, listingUrl, storeUrl } from '@/components/explore/shared';

// Shops on Sellio, as cards in a row that scrolls sideways (Alvin, 28 Nov 2026, after Taobao's
// shop cards; of the carousel and the grid he picked the carousel). A card has the shop's logo,
// name, rating (3+ buyers) and item count, whether it's a home seller or a shop, a Visit button,
// and its three newest listings with a photo and their prices (explore_shops' picks), each
// opening the listing. A shop with fewer than three has a "See shop" tile in the gap. A card
// snaps to the left edge with the next one peeking in; with a mouse, arrows beside the heading
// move one card at a time.
//
// The Visit button and the Shop tag are in Sellio's violet, or in the theme a seller chose for
// their shop (--color-wash is set only then, components/theme/themeUtils.jsx), as the rest of
// Explore's colours are.
const ACCENT_TEXT = 'var(--color-wash, #6d28d9)';
const ACCENT_LINE = 'var(--color-wash, #8b5cf6)';
const ACCENT_TAG = { color: 'var(--color-wash, #5b21b6)', backgroundColor: 'color-mix(in srgb, var(--color-wash, #8b5cf6) 14%, white)' };
const PICKS = 3;
const GAP = 10; // the gap between cards (gap-2.5)

const reduceMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
};

function PickTile({ pick, currency }) {
  return (
    <Link to={listingUrl(pick.id)} data-testid="shop-pick" className="group block min-w-0">
      <span className="block aspect-square rounded-[10px] overflow-hidden bg-slate-100 text-2xl">
        <ItemImage src={pick.image_url} name={pick.name} className="w-full h-full group-hover:scale-[1.03] transition-[transform,opacity] duration-300" />
      </span>
      <span className="sr-only">{pick.name}</span>
      <span className="block mt-1 h-[18px] text-[13px] leading-[18px] font-extrabold text-slate-900 truncate">{formatPrice(pick.price, currency)}</span>
    </Link>
  );
}

// The gap left by a shop with fewer than three listings to show: one tile across it, as tall as
// the photos beside it (a line the height of their prices stays under it).
function SeeShopTile({ href, span, count }) {
  const { t } = useAppText('explore');
  return (
    <Link to={href} tabIndex={-1} data-testid="shop-see-shop" className="flex flex-col min-w-0" style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className={`${span === PICKS ? 'aspect-[3/1]' : 'flex-1'} rounded-[10px] border-[1.5px] border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-0.5 px-1.5 text-center text-xs font-semibold text-slate-500`}>
        <span>{count === 1 ? t('1 item') : t('{count} items', { count })}</span>{' '}
        <span className="text-[13px] font-bold" style={{ color: ACCENT_TEXT }}>{t('See shop')}</span>
      </span>
      <span aria-hidden="true" className="block mt-1 h-[18px]" />
    </Link>
  );
}

function ShopCard({ shop, rating }) {
  const { t } = useAppText('explore');
  const href = storeUrl(shop.shop_slug);
  const count = Number(shop.item_count) || 0;
  const home = shop.shop_type === 'individual';
  // A copy kept on the phone from before cards had them has no picks: its cards say See shop.
  const picks = (Array.isArray(shop.picks) ? shop.picks : []).filter((p) => p?.id).slice(0, PICKS);
  return (
    <li data-shop-card data-testid="shop-card" className="w-[86%] max-w-[330px] flex-shrink-0 snap-start bg-white rounded-2xl p-3">
      <div className="flex items-center gap-2.5">
        {/* The logo and name open the shop too; Visit is the one to Tab to. */}
        <Link to={href} tabIndex={-1} className="flex-1 min-w-0 flex items-center gap-2.5">
          <ShopAvatar name={shop.shop_name} logo={shop.shop_logo_url} size={44} />
          <span className="min-w-0">
            <span className="block text-[15px] leading-tight font-bold text-slate-900 truncate">{shop.shop_name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
              {rating && <><RatingPill summary={rating} size={12} t={t} /><span aria-hidden="true">·</span></>}
              <span className="truncate">{count === 1 ? t('1 item') : t('{count} items', { count })}</span>
            </span>
            <span
              data-testid="shop-kind"
              className={`inline-block mt-1 px-2 py-px rounded-full text-[11px] font-semibold ${home ? 'bg-slate-100 text-slate-700' : 'bg-violet-100 text-violet-800'}`}
              style={home ? undefined : ACCENT_TAG}
            >
              {home ? t('Home seller') : t('Shop')}
            </span>
          </span>
        </Link>
        <Link
          to={href}
          aria-label={t('Visit {shop}', { shop: shop.shop_name })}
          data-testid="shop-visit"
          className="flex-shrink-0 h-[34px] px-[15px] rounded-full border-[1.5px] bg-white text-[13px] font-bold whitespace-nowrap inline-flex items-center hover:bg-slate-50 active:scale-95 transition-transform"
          style={{ color: ACCENT_TEXT, borderColor: ACCENT_LINE }}
        >
          {t('Visit')}
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-[11px]">
        {picks.map((pick) => <PickTile key={pick.id} pick={pick} currency={shop.currency} />)}
        {picks.length < PICKS && <SeeShopTile href={href} span={PICKS - picks.length} count={count} />}
      </div>
    </li>
  );
}

export default function ShopCarousel({ shops, ratings = {} }) {
  const { t } = useAppText('explore');
  const railRef = useRef(null);
  // Whether the row scrolls, and whether it's at either end (for the arrows).
  const [edges, setEdges] = useState({ scrolls: false, start: true, end: true });
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const next = { scrolls: max > 1, start: rail.scrollLeft <= 1, end: rail.scrollLeft >= max - 1 };
    setEdges((was) => (was.scrolls === next.scrolls && was.start === next.start && was.end === next.end ? was : next));
  }, []);
  useEffect(() => { measure(); }, [measure, shops]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  const frame = useRef(0);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  const onScroll = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; measure(); });
  };
  const step = (dir) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector('[data-shop-card]');
    rail.scrollBy({ left: dir * ((card?.offsetWidth || 300) + GAP), behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  const arrow = 'w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 inline-flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <section className="pt-2.5 mb-3" aria-labelledby="explore-shops-heading" data-testid="explore-shops">
      <div className="flex items-center justify-between gap-2 mb-2 px-1 sm:px-0">
        <h2 id="explore-shops-heading" className="text-[15px] font-bold text-slate-900">{t('Shops on Sellio')}</h2>
        {edges.scrolls && (
          <div className="hidden [@media(hover:hover)]:flex items-center gap-1.5" data-testid="explore-shops-arrows">
            <button type="button" onClick={() => step(-1)} disabled={edges.start} aria-label={t('Previous shop')} className={arrow}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => step(1)} disabled={edges.end} aria-label={t('Next shop')} className={arrow}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <ul
        ref={railRef}
        onScroll={onScroll}
        data-testid="explore-shops-rail"
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-3 sm:scroll-px-4 -mx-2 px-3 sm:-mx-4 sm:px-4 pb-1"
        style={hideScrollbar}
      >
        {shops.map((shop) => <ShopCard key={shop.shop_id} shop={shop} rating={ratings[shop.shop_id] || null} />)}
      </ul>
    </section>
  );
}
