import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Loader2, MessageCircle, RefreshCw, ShoppingBag, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { exploreItem } from '@/lib/chat';
import { buyerStatusLabel, formatShopDate, shopMethod } from '@/lib/shopSelling';
import { myOrderRatings } from '@/lib/ratings';
import { cancelMyOrder, claimDeviceOrders, fetchPurchase, fetchPurchases } from '@/lib/purchases';
import { OrderRateRow, RateOrderSheet } from '@/components/ratings/RatingParts';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { BRAND_COLOR, BRAND_GRADIENT, ShopAvatar, chatUrl, formatPrice, goBack, newChatUrl, storeUrl } from './shared';

// My purchases (Me → My purchases): the signed-in buyer's orders from every shop,
// Ongoing and Past, and each order's page: where it's at (a step-by-step timeline),
// how it's collected or delivered, the items, paying the seller, chatting with them,
// cancelling a home seller's order before it's accepted, and rating it once done.

const PAGE = 20;

// A business's order (its ordering page) has no collection or delivery details.
const isHomeSeller = (o) => o?.shop_type === 'individual';
const BUSINESS_STATUS = {
  pending: 'Waiting for the shop', confirmed: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  served: 'Served', completed: 'Completed', cancelled: 'Cancelled',
};
export function purchaseStatus(o) {
  if (!o) return '';
  return isHomeSeller(o) ? buyerStatusLabel('en', o.status, shopMethod(o)) : (BUSINESS_STATUS[o.status] || o.status);
}

const CHIP = {
  pending: 'bg-amber-50 text-amber-800',
  confirmed: 'bg-blue-50 text-blue-800',
  preparing: 'bg-violet-50 text-violet-800',
  ready: 'bg-emerald-50 text-emerald-800',
  served: 'bg-emerald-50 text-emerald-800',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-rose-50 text-rose-700',
};

function StatusChip({ order }) {
  return (
    <span data-testid="purchase-status" className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${CHIP[order.status] || CHIP.pending}`}>
      {purchaseStatus(order)}
    </span>
  );
}

const itemName = (i) => i?.name || i?.product_name || 'Item';
const itemsLine = (items) => (items || []).map((i) => `${Number(i.quantity) || 1}× ${itemName(i)}${i.variant ? ` (${i.variant})` : ''}`).join(', ');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const unpaid = (o) => o.payment_status !== 'paid' && o.status !== 'cancelled';

function SubHeader({ title, onBack }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-xl mx-auto px-2 h-14 flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label="Back" className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
      </div>
    </header>
  );
}

function SignInCard({ returnPath }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
      <ShoppingBag className="w-8 h-8 mx-auto text-slate-300" />
      <p className="mt-3 text-base font-bold text-slate-900">Your purchases</p>
      <p className="mt-1 text-sm text-slate-500">Log in to see the orders you’ve placed and where they’re at.</p>
      <Link to="/Auth" onClick={() => rememberReturnPath(returnPath)} className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
        Log in
      </Link>
    </section>
  );
}

function LoadError({ onRetry }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
      <p className="text-sm text-slate-600">We couldn’t load your orders just now.</p>
      <button type="button" onClick={onRetry} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}

// Reload when the person comes back to the app (an order may have moved on).
function useOnReturn(callback) {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') callback(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [callback]);
}

function PurchaseCard({ order }) {
  return (
    <Link
      to={`/explore/purchases/${encodeURIComponent(order.id)}`}
      data-testid="purchase-card"
      className="block bg-white rounded-2xl border border-slate-100 p-4 hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="flex items-center gap-2">
        <ShopAvatar name={order.shop_name} logo={order.shop_logo_url} size={28} />
        <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-slate-900">{order.shop_name || 'Shop'}</span>
        <StatusChip order={order} />
      </div>
      <p className="mt-2 text-sm text-slate-600 line-clamp-2">{itemsLine(order.items) || 'Your order'}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="truncate">#{order.order_number} · {when(order.created_date)}</span>
        {unpaid(order) && <span className="text-amber-700 font-medium whitespace-nowrap">· Not paid yet</span>}
        <span className="ml-auto text-sm font-semibold text-slate-900 whitespace-nowrap">{formatPrice(order.total_amount, order.currency)}</span>
      </div>
    </Link>
  );
}

// ── /explore/purchases ───────────────────────────────────────────────────────────────
export default function ExplorePurchases() {
  const navigate = useNavigate();
  const { appUser } = useAppUser() || {};
  const [box, setBox] = useState('ongoing');
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error | signin
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [claimable, setClaimable] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'My purchases · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!appUser) { setState('signin'); return undefined; }
    let cancelled = false;
    setState((s) => (s === 'ready' ? s : 'loading'));
    fetchPurchases(box, 0, PAGE)
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setHasMore(list.length === PAGE);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('Purchases failed to load:', e?.message || e);
        setState(e?.code === '42501' ? 'signin' : 'error');
      });
    return () => { cancelled = true; };
  }, [appUser, box, reloadKey]);

  // Orders placed on this phone before logging in.
  useEffect(() => {
    if (!appUser) return undefined;
    let cancelled = false;
    claimDeviceOrders(false).then((n) => { if (!cancelled) setClaimable(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [appUser, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useOnReturn(reload);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const list = await fetchPurchases(box, rows.length, PAGE);
      setRows((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE);
    } catch { /* the button stays for another try */ }
    setLoadingMore(false);
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const n = await claimDeviceOrders(true);
      setClaimable(0);
      toast.success(n === 1 ? '1 order added to your purchases' : `${n} orders added to your purchases`);
      reload();
    } catch {
      toast.error('Couldn’t add them just now. Please try again.');
    }
    setClaiming(false);
  };

  const pick = (next) => { if (next !== box) { setBox(next); setRows([]); setState('loading'); } };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="purchases-page">
      <SubHeader title="My purchases" onBack={() => goBack(navigate, '/explore/me')} />
      <main className="max-w-xl mx-auto px-4 pt-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {state === 'signin' ? <SignInCard returnPath="/explore/purchases" /> : (
          <>
            {claimable > 0 && (
              <section data-testid="claim-banner" className="mb-3 bg-white rounded-2xl border border-slate-100 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {claimable === 1 ? '1 order' : `${claimable} orders`} you placed on this phone before logging in
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Add them to your purchases to follow them here.</p>
                <button type="button" onClick={claim} disabled={claiming} data-testid="claim-orders" className="mt-3 h-9 px-4 rounded-full text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60" style={{ background: BRAND_GRADIENT }}>
                  {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Add to my purchases
                </button>
              </section>
            )}

            <div role="tablist" aria-label="Purchases" className="grid grid-cols-2 gap-1 p-1 rounded-full bg-slate-100 mb-3">
              {[['ongoing', 'Ongoing'], ['past', 'Past']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={box === key}
                  onClick={() => pick(key)}
                  className={`h-9 rounded-full text-sm font-semibold ${box === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {state === 'loading' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
            )}
            {state === 'error' && <LoadError onRetry={reload} />}
            {state === 'ready' && rows.length === 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="purchases-empty">
                <ShoppingBag className="w-8 h-8 mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-900">{box === 'ongoing' ? 'Nothing on its way' : 'No past orders yet'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {box === 'ongoing' ? 'Orders you place while logged in show up here until they’re done.' : 'Finished and cancelled orders show up here.'}
                </p>
                {box === 'ongoing' && (
                  <Link to="/explore" className="mt-4 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">Browse Sellio</Link>
                )}
              </section>
            )}
            {state === 'ready' && rows.length > 0 && (
              <div className="space-y-3">
                {rows.map((o) => <PurchaseCard key={o.id} order={o} />)}
                {hasMore && (
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full h-10 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5">
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Show more
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}

// ── The order's steps ─────────────────────────────────────────────────────────────────
function steps(order) {
  const home = isHomeSeller(order);
  const method = shopMethod(order);
  const list = [
    { key: 'pending', label: 'Order placed' },
    { key: 'confirmed', label: 'Accepted' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready', label: home ? (method === 'delivery' ? 'Out for delivery' : 'Ready for collection') : 'Ready', also: home ? [] : ['served'] },
    { key: 'completed', label: home ? (method === 'delivery' ? 'Delivered' : 'Collected') : 'Completed' },
  ];
  const times = order.status_times || {};
  const timeOf = (s) => [s.key, ...(s.also || [])].map((k) => times[k]).find(Boolean) || null;
  if (order.status === 'cancelled') {
    const reached = list.filter((s) => s.key === 'pending' || timeOf(s));
    return [...reached.map((s) => ({ ...s, done: true, at: timeOf(s) })), { key: 'cancelled', label: 'Cancelled', done: true, at: times.cancelled || null, cancelled: true }];
  }
  const current = list.findIndex((s) => s.key === order.status || (s.also || []).includes(order.status));
  return list.map((s, i) => ({ ...s, done: i <= current, current: i === current, at: i <= current ? timeOf(s) : null }));
}

function Timeline({ order }) {
  const all = steps(order);
  return (
    <ol className="mt-3" data-testid="purchase-timeline">
      {all.map((s, i) => {
        const last = i === all.length - 1;
        const color = s.cancelled ? '#e11d48' : s.done ? BRAND_COLOR : '#cbd5e1';
        return (
          <li key={s.key} className="flex gap-3" data-testid="timeline-step" data-done={s.done ? 'yes' : 'no'}>
            <div className="flex flex-col items-center">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: s.done ? color : '#fff', border: `2px solid ${color}` }}
              >
                {s.done && (s.cancelled ? <X className="w-3 h-3 text-white" /> : <Check className="w-3 h-3 text-white" />)}
              </span>
              {!last && <span className="w-0.5 flex-1 min-h-[18px]" style={{ background: all[i + 1].done ? color : '#e2e8f0' }} />}
            </div>
            <div className={`pb-3 -mt-0.5 ${last ? '' : 'min-h-[36px]'}`}>
              <p className={`text-sm ${s.current || s.cancelled ? 'font-bold' : 'font-medium'} ${s.done ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</p>
              {s.at && <p className="text-xs text-slate-500">{when(s.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, children, testId }) {
  return (
    <section className="mt-3 bg-white rounded-2xl border border-slate-100 p-4" data-testid={testId}>
      {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h2>}
      {children}
    </section>
  );
}

function HowYouGetIt({ order }) {
  const f = order.fulfilment || {};
  const method = shopMethod(order);
  return (
    <Card title={method === 'delivery' ? 'Delivery' : 'Self-collection'} testId="purchase-fulfilment">
      <div className="text-sm text-slate-700 space-y-1 leading-relaxed">
        {f.date && <p><span className="text-slate-500">For</span> {formatShopDate(f.date)}</p>}
        {method === 'delivery' && f.address && <p>{f.address}</p>}
        {method === 'collection' && (f.collection_address
          ? <p data-testid="purchase-collection-address"><span className="text-slate-500">Collect at</span> {f.collection_address}</p>
          : <p>{f.area ? `${f.area}. ` : ''}<span className="text-slate-500">The seller shares the exact address once they accept your order.</span></p>)}
        {f.seller_notes && <p className="text-slate-500">{f.seller_notes}</p>}
      </div>
    </Card>
  );
}

// ── /explore/purchases/:orderId ───────────────────────────────────────────────────────
export function PurchaseDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { appUser } = useAppUser() || {};
  const [order, setOrder] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error | missing | signin
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [rating, setRating] = useState(null);
  const [rateStars, setRateStars] = useState(null);
  const [opening, setOpening] = useState(false);
  const confirmRef = useRef(null);
  // Bring "Cancel this order?" into view above the bottom bar.
  useEffect(() => {
    if (confirmCancel) confirmRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [confirmCancel]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Order · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!appUser) { setState('signin'); return undefined; }
    let cancelled = false;
    fetchPurchase(orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        setState(o ? 'ready' : 'missing');
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('Order failed to load:', e?.message || e);
        setState((s) => (s === 'ready' ? s : e?.code === '42501' ? 'signin' : 'error'));
      });
    return () => { cancelled = true; };
  }, [appUser, orderId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useOnReturn(reload);
  // While the order is on its way, check for news every 30 seconds.
  const ongoing = !!order && order.status !== 'completed' && order.status !== 'cancelled';
  useEffect(() => {
    if (!ongoing) return undefined;
    const id = setInterval(reload, 30 * 1000);
    return () => clearInterval(id);
  }, [ongoing, reload]);

  // The buyer's rating, once the order is done.
  const done = order?.status === 'completed';
  useEffect(() => {
    if (!done) return undefined;
    let cancelled = false;
    myOrderRatings([order.id]).then((map) => { if (!cancelled) setRating(map[order.id] || null); });
    return () => { cancelled = true; };
  }, [done, order?.id]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await cancelMyOrder(order.id);
      toast.success('Order cancelled. The seller has been told.');
      setConfirmCancel(false);
      reload();
    } catch (e) {
      toast.error(e.message);
      setConfirmCancel(false);
      reload();
    }
    setCancelling(false);
  };

  const chatProduct = (order?.items || []).map((i) => i.product_id).find(Boolean) || null;
  const openChat = async () => {
    if (!chatProduct || opening) return;
    setOpening(true);
    try {
      const data = await exploreItem(chatProduct);
      const conversation = data?.viewer?.conversation_id;
      navigate(conversation ? chatUrl(conversation) : newChatUrl(chatProduct));
    } catch {
      toast.error('This seller can’t be messaged from this order. Visit their shop to get in touch.');
    }
    setOpening(false);
  };

  const back = () => goBack(navigate, '/explore/purchases');

  if (state !== 'ready') {
    return (
      <div className="min-h-screen bg-slate-50">
        <SubHeader title="Order" onBack={back} />
        <main className="max-w-xl mx-auto px-4 pt-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
          {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
          {state === 'signin' && <SignInCard returnPath={`/explore/purchases/${encodeURIComponent(orderId)}`} />}
          {state === 'error' && <LoadError onRetry={reload} />}
          {state === 'missing' && (
            <section className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="purchase-missing">
              <p className="text-sm font-semibold text-slate-900">This order isn’t in your purchases</p>
              <p className="mt-1 text-xs text-slate-500">It may have been placed with another account.</p>
              <Link to="/explore/purchases" className="mt-4 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center">My purchases</Link>
            </section>
          )}
        </main>
        <ExploreTabBar active="me" />
      </div>
    );
  }

  const fee = Number(order.fulfilment?.fee) || 0;
  const items = order.items || [];
  const home = isHomeSeller(order);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="purchase-page">
      <SubHeader title={`Order #${order.order_number}`} onBack={back} />
      <main className="max-w-xl mx-auto px-4 pt-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        <section className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <ShopAvatar name={order.shop_name} logo={order.shop_logo_url} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-slate-900 truncate">{order.shop_name || 'Shop'}</p>
              <p className="text-xs text-slate-500">Placed {when(order.created_date)}</p>
            </div>
            {order.shop_slug && (
              <Link to={storeUrl(order.shop_slug)} className="h-8 px-3 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> Shop
              </Link>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <p className="text-lg font-bold text-slate-900" data-testid="purchase-headline">{purchaseStatus(order)}</p>
          </div>
          {order.status === 'pending' && (
            <p className="text-xs text-slate-500">{home ? 'The seller will accept your order soon.' : 'The shop will accept your order soon.'}</p>
          )}
          <Timeline order={order} />
        </section>

        {home && order.fulfilment && <HowYouGetIt order={order} />}
        {!home && order.table_name && (
          <Card title="Table"><p className="text-sm text-slate-700">{order.table_name}</p></Card>
        )}

        <Card title="Items" testId="purchase-items">
          <ul className="space-y-1.5">
            {items.map((i, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="text-slate-500 w-7 flex-shrink-0">{Number(i.quantity) || 1}×</span>
                <span className="flex-1 min-w-0 text-slate-800">
                  {itemName(i)}{i.variant ? <span className="text-slate-500"> ({i.variant})</span> : null}
                  {i.notes ? <span className="block text-xs text-slate-500">{i.notes}</span> : null}
                </span>
                <span className="text-slate-700 whitespace-nowrap">{formatPrice((Number(i.price) || 0) * (Number(i.quantity) || 1), order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-sm">
            {fee > 0 && (
              <div className="flex justify-between text-slate-600"><span>Delivery</span><span>{formatPrice(fee, order.currency)}</span></div>
            )}
            <div className="flex justify-between items-center font-bold text-slate-900">
              <span>
                Total{' '}
                <span className={`text-xs font-semibold ${order.payment_status === 'paid' ? 'text-emerald-600' : order.status === 'cancelled' ? 'text-slate-400' : 'text-amber-700'}`}>
                  · {order.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}
                </span>
              </span>
              <span>{formatPrice(order.total_amount, order.currency)}</span>
            </div>
          </div>
          {unpaid(order) && order.payment_qr_url && (
            showQr ? (
              <div className="mt-3 text-center">
                <img src={order.payment_qr_url} alt="The seller’s payment QR" className="w-48 h-48 object-contain mx-auto bg-white rounded-xl border border-slate-200 p-2" />
                {order.payment_qr_label && <p className="mt-1 text-xs text-slate-500">{order.payment_qr_label}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setShowQr(true)} data-testid="purchase-show-qr" className="mt-3 text-sm font-semibold" style={{ color: BRAND_COLOR }}>
                Show the seller’s payment QR
              </button>
            )
          )}
        </Card>

        {done && (
          <OrderRateRow order={order} rating={rating} onPick={(n) => setRateStars(n)} accent={BRAND_COLOR} />
        )}

        <div className="mt-3 space-y-2">
          {chatProduct && (
            <button type="button" onClick={openChat} disabled={opening} data-testid="purchase-chat" className="w-full h-11 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2">
              {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Chat with the seller
            </button>
          )}
          {order.can_cancel && order.status === 'pending' && (
            confirmCancel ? (
              <div ref={confirmRef} className="bg-white rounded-2xl border border-rose-100 p-4" data-testid="purchase-cancel-confirm">
                <p className="text-sm font-semibold text-slate-900">Cancel this order?</p>
                <p className="mt-0.5 text-xs text-slate-500">The seller hasn’t accepted it yet. They’ll be told it’s cancelled.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelling} className="flex-1 h-10 rounded-full border border-slate-200 text-sm font-semibold text-slate-700">Keep order</button>
                  <button type="button" onClick={cancel} disabled={cancelling} data-testid="purchase-cancel-yes" className="flex-1 h-10 rounded-full bg-rose-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                    {cancelling && <Loader2 className="w-4 h-4 animate-spin" />} Yes, cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(true)} data-testid="purchase-cancel" className="w-full h-11 rounded-full text-sm font-semibold text-rose-600 hover:bg-rose-50">
                Cancel order
              </button>
            )
          )}
          {order.shop_slug && (
            <Link to={storeUrl(order.shop_slug)} className="w-full h-11 rounded-full text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-1 hover:bg-slate-100">
              Visit {order.shop_name || 'the shop'} <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </main>
      <ExploreTabBar active="me" />

      <RateOrderSheet
        open={!!rateStars}
        onClose={() => setRateStars(null)}
        order={order}
        shopName={order.shop_name || 'the shop'}
        initialStars={rateStars || 0}
        existing={rating}
        signedIn
        returnPath={`/explore/purchases/${encodeURIComponent(order.id)}`}
        accent={BRAND_COLOR}
        onRated={(saved) => {
          setRating({ stars: saved.stars, note: saved.note, can_change: true });
          setRateStars(null);
          toast.success('Thanks for rating!');
        }}
      />
    </div>
  );
}
