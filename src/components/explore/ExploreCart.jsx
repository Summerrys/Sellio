import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Minus, Plus } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { cartCount, heldInCart, setShopCartQuantity, stockLeft, stockLimit, useShopCarts } from '@/lib/shopCart';
import { useStockInfo } from '@/lib/stockInfo';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { BRAND_COLOR, BRAND_GRADIENT, ExploreTabHeader, ItemImage, ShopAvatar, formatPrice, storeUrl } from './shared';
import { useAppText } from '@/lib/appText';

// Cart (the cart icon on Explore and on listings): what's in this phone's carts, one card
// per shop. These are the shops' own carts, so the same items show on each shop's page.
// Each shop checks out on its own page; its checkout prices everything itself.

const itemsText = (n, t) => (n === 1 ? t('1 item') : t('{count} items', { count: n }));

// Each shop's name, logo, currency and whether it takes orders, once per visit.
const shopDetails = new Map();
function loadShop(slug) {
  if (!shopDetails.has(slug)) {
    shopDetails.set(slug, (async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('get_storefront_tenant', { p_slug: slug }).maybeSingle();
      if (error) throw error;
      return data || null;
    })().catch((e) => { shopDetails.delete(slug); throw e; }));
  }
  return shopDetails.get(slug);
}

function useShopDetails(slugs) {
  const [found, setFound] = useState({});
  const key = slugs.join('\n');
  useEffect(() => {
    let cancelled = false;
    slugs.forEach((slug) => {
      loadShop(slug)
        .then((shop) => { if (!cancelled) setFound((prev) => ({ ...prev, [slug]: shop ? { ...shop, state: 'ok' } : { state: 'missing' } })); })
        .catch(() => { if (!cancelled) setFound((prev) => ({ ...prev, [slug]: prev[slug] || { state: 'unknown' } })); });
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return found;
}

// most: how many this line can hold, from the seller's stock and the item's other lines.
function Stepper({ line, most, onChange }) {
  const { t } = useAppText('explore');
  const qty = Number(line.quantity) || 0;
  const item = line.name || t('item');
  return (
    <div className="flex items-center h-9 rounded-full border border-slate-200 flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        aria-label={qty <= 1 ? t('Remove {item}', { item }) : t('One less {item}', { item })}
        className="w-10 h-9 flex items-center justify-center text-slate-700"
      >
        {qty <= 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
      </button>
      <span className="min-w-[20px] text-center text-sm font-semibold text-slate-900">{qty}</span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= most}
        aria-label={t('One more {item}', { item })}
        className="w-10 h-9 flex items-center justify-center text-slate-700 disabled:text-slate-300"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function ShopCart({ cart, details, stock = {} }) {
  const { t } = useAppText('explore');
  const navigate = useNavigate();
  const { slug, lines } = cart;
  const known = details?.state === 'ok' ? details : null;
  const name = String(known?.name || cart.shop?.name || slug).trim();
  const logo = known ? known.logo_url : cart.shop?.logo_url;
  const currency = known?.currency || cart.shop?.currency || 'SGD';
  const count = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const subtotal = lines.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0);
  const unavailable = details?.state === 'missing'
    ? t('This shop isn’t on Sellio any more.')
    : known?.is_available === false ? t('This shop isn’t taking orders right now.') : null;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 px-3.5 pt-3 pb-3.5" data-testid="cart-shop">
      <div className="flex items-center gap-2.5 pb-2.5">
        <Link to={storeUrl(slug)} className="flex items-center gap-2.5 min-w-0 flex-1">
          <ShopAvatar name={name} logo={logo} size={28} />
          <span className="text-[15px] font-bold text-slate-900 truncate">{name}</span>
        </Link>
        <span className="text-xs text-slate-500 whitespace-nowrap">{itemsText(count, t)}</span>
      </div>
      <ul>
        {lines.map((line) => {
          const qty = Number(line.quantity) || 0;
          const price = Number(line.price) || 0;
          // The seller's stock, when they count it (and once it's loaded), across the item's lines.
          const limit = stockLimit(stock[line.product_id]);
          const left = stockLeft(stock[line.product_id]) ?? limit;
          const most = Math.max(0, limit - heldInCart(lines, line.product_id, line.key));
          const over = heldInCart(lines, line.product_id) > limit;
          return (
            <li key={line.key} className="flex gap-3 py-3 border-t border-slate-100">
              <ItemImage src={line.image_url} name={line.name} className="w-16 h-16 text-2xl flex-shrink-0" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 break-words">{line.name || t('Item')}</p>
                {line.variant && <p className="mt-0.5 text-xs text-slate-500 break-words">{line.variant}</p>}
                {line.notes && <p className="mt-0.5 text-xs text-slate-500 break-words">{t('Note: {notes}', { notes: line.notes })}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{formatPrice(price * qty, currency)}</p>
                    {qty > 1 && <p className="text-[11px] text-slate-500">{t('{price} each', { price: formatPrice(price, currency) })}</p>}
                  </div>
                  <Stepper line={line} most={most} onChange={(n) => setShopCartQuantity(slug, line.key, n, limit)} />
                </div>
                {over && (
                  <p className="mt-1.5 text-xs text-amber-800" data-testid="cart-line-stock">
                    {left === 0 ? t('Sold out') : left === 1 ? t('Only 1 item left') : t('Only {count} items left', { count: left })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {unavailable && <p className="mb-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-2">{unavailable}</p>}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs text-slate-500">{t('Subtotal')}</p>
          <p className="text-base font-bold text-slate-900">{formatPrice(subtotal, currency)}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${storeUrl(slug)}?buy=1`)}
          disabled={!!unavailable}
          className="h-11 px-5 rounded-xl text-[15px] font-bold disabled:cursor-default"
          style={unavailable ? { background: '#e2e8f0', color: '#64748b' } : { background: BRAND_GRADIENT, color: '#fff' }}
        >
          {t('Checkout')}
        </button>
      </div>
    </section>
  );
}

export default function ExploreCart() {
  const { t, textKey } = useAppText('explore');
  const carts = useShopCarts();
  const details = useShopDetails(carts.map((c) => c.slug));
  const stock = useStockInfo(carts.flatMap((c) => c.lines.map((l) => l.product_id)));
  const total = cartCount(carts);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('Cart')} · Sellio`;
    return () => { document.title = previous; };
  }, [textKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50" data-testid="cart-page">
      <ExploreTabHeader
        title={<>{t('Cart')}{total > 0 && <span className="ml-2 text-[13px] font-medium text-slate-500">{itemsText(total, t)}</span>}</>}
      />
      <main className="max-w-xl mx-auto px-3 pt-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {carts.length === 0 ? (
          <section className="mt-16 text-center px-6" data-testid="cart-empty">
            <span className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--color-primary, 59 130 246) / 0.1)', color: BRAND_COLOR }}>
              <ShoppingCart className="w-[26px] h-[26px]" />
            </span>
            <p className="mt-3.5 text-base font-bold text-slate-900">{t('Your cart is empty')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('Items you add from any shop on Explore show up here.')}</p>
            <Link to="/explore" className="mt-5 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
              {t('Browse Explore')}
            </Link>
          </section>
        ) : (
          <>
            <div className="space-y-3">
              {carts.map((cart) => <ShopCart key={cart.slug} cart={cart} details={details[cart.slug]} stock={stock} />)}
            </div>
            <p className="mt-3 mx-1 text-xs leading-relaxed text-slate-500">
              {t('Each shop checks out on its own, and you pay that seller directly. Prices are confirmed when you check out.')}
            </p>
            <div className="mt-2 text-center">
              <Link to="/explore" className="inline-block px-4 py-2.5 text-sm font-semibold" style={{ color: BRAND_COLOR }}>{t('Continue shopping')}</Link>
            </div>
          </>
        )}
      </main>
      <ExploreTabBar />
    </div>
  );
}
