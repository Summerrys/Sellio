import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { HOLD_REASONS, REPORT_REASONS, amIModerator, moderateComment, moderationQueue, ratingReviewQueue, reviewRating } from '@/lib/ratings';
import { Stars } from '@/components/ratings/RatingParts';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { formatPrice, storeUrl, timeAgo } from './shared';

// /moderation — Sellio's moderators (app.moderators) check:
//  · ratings on hold (they looked suspicious, so they don't count yet): keep one (it counts,
//    and the shop is told) or remove it (it never counts; no one is told);
//  · reported public comments: keep one (it shows again, and later reports wait for review)
//    or remove it (the buyer is told; their stars still count).
// Everyone else sees that the page isn't for them.

const REASON = Object.fromEntries(REPORT_REASONS);

function Header() {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-xl mx-auto px-4 h-14 flex items-center">
        <h1 className="text-lg font-bold text-slate-900">Ratings to check</h1>
      </div>
    </header>
  );
}

function SectionTitle({ children, count }) {
  return (
    <h2 className="pt-2 px-1 flex items-center gap-2 text-sm font-bold text-slate-900">
      {children}
      {count > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-bold">{count}</span>}
    </h2>
  );
}

// "1 min", "3 h", "2 days": how long after it was placed the order was done.
function gap(fromIso, toIso) {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  if (Number.isNaN(minutes)) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

const roleName = (person) => `${person.name} (${person.owner ? 'owner' : 'staff'})`;

function holdDetail(reason, item) {
  if (reason === 'shop_phone') {
    const people = Array.isArray(item.shop_people) ? item.shop_people : [];
    return people.length ? `Same phone as ${people.map(roleName).join(', ')}` : 'It was rated on one of the shop’s phones.';
  }
  if (reason === 'shared_phone') {
    const mates = Array.isArray(item.phone_mates) ? item.phone_mates : [];
    return mates.length ? `Same phone as ${mates.map((m) => `${m.name} (${m.stars}★)`).join(', ')}` : '';
  }
  if (reason === 'new_account_burst') {
    return item.burst_count ? `${item.burst_count} five-star ratings from accounts under 3 days old, within a day of each other` : '';
  }
  return '';
}

function HeldRating({ item, onDone }) {
  const [busy, setBusy] = useState(null);
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  const act = async (action) => {
    setBusy(action);
    try {
      await reviewRating(item.rating_id, action);
      toast.success(action === 'keep' ? 'Kept. It counts now, and the shop has been told.' : 'Removed. It won’t count.');
      onDone(item.rating_id);
    } catch (e) {
      toast.error(e?.message || 'That didn’t work. Please try again.');
      setBusy(null);
    }
  };
  const done = item.order_placed_at && item.order_done_at ? gap(item.order_placed_at, item.order_done_at) : '';
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="held-rating">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {item.shop_slug ? (
          <Link to={storeUrl(item.shop_slug)} className="font-semibold text-slate-800 truncate hover:underline">{item.shop_name || 'Shop'}</Link>
        ) : <span className="font-semibold text-slate-800 truncate">{item.shop_name || 'Shop'}</span>}
        <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800">On hold · not counted</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{item.rater_name || 'Sellio buyer'}</span>
        <Stars value={item.stars} size={12} />
        <span className="text-[11px] text-slate-400">{timeAgo(item.posted_at)}</span>
      </div>
      {item.note && <p className="mt-1.5 text-sm text-slate-800 leading-relaxed break-words" data-testid="held-note">“{item.note}”</p>}

      <div className="mt-3 space-y-2">
        {reasons.map((reason) => {
          const detail = holdDetail(reason, item);
          return (
            <div key={reason} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="held-reason">
              <p className="font-semibold">{HOLD_REASONS[reason] || reason}</p>
              {detail && <p className="mt-0.5 text-amber-800 break-words">{detail}</p>}
            </div>
          );
        })}
      </div>

      <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-400">Order</dt>
        <dd className="text-slate-700 break-words">
          {item.order_number ? `#${item.order_number}` : '—'}
          {item.order_total != null ? ` · ${formatPrice(item.order_total, item.shop_currency)}` : ''}
          {done ? ` · done ${done} after it was placed` : ''}
        </dd>
        <dt className="text-slate-400">Account</dt>
        <dd className="text-slate-700 break-words">
          <span className="break-all">{item.rater_email || 'No email'}</span>
          {item.rater_since ? ` · made ${timeAgo(item.rater_since)}` : ''}
        </dd>
      </dl>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => act('keep')} disabled={!!busy} data-testid="held-keep" className="flex-1 h-10 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
          {busy === 'keep' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Keep it
        </button>
        <button type="button" onClick={() => act('remove')} disabled={!!busy} data-testid="held-remove" className="flex-1 h-10 rounded-full bg-rose-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
          {busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove it
        </button>
      </div>
    </section>
  );
}

function ReportedComment({ item, onDone }) {
  const [busy, setBusy] = useState(null);
  const reports = Array.isArray(item.reports) ? item.reports : [];
  const act = async (action) => {
    setBusy(action);
    try {
      await moderateComment(item.rating_id, action);
      toast.success(action === 'keep' ? 'Kept. It shows on the shop page.' : 'Removed. The buyer has been told.');
      onDone(item.rating_id);
    } catch (e) {
      toast.error(e?.message || 'That didn’t work. Please try again.');
      setBusy(null);
    }
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="moderation-item">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {item.shop_slug ? (
          <Link to={storeUrl(item.shop_slug)} className="font-semibold text-slate-800 truncate hover:underline">{item.shop_name || 'Shop'}</Link>
        ) : <span className="font-semibold text-slate-800 truncate">{item.shop_name || 'Shop'}</span>}
        <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-full font-semibold ${item.note_state === 'reported' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
          {item.note_state === 'reported' ? 'Hidden for now' : 'Still shown'}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{item.rater_name || 'Sellio buyer'}</span>
        <Stars value={item.stars} size={12} />
        <span className="text-[11px] text-slate-400">{timeAgo(item.posted_at)}</span>
      </div>
      <p className="mt-1.5 text-sm text-slate-800 leading-relaxed break-words" data-testid="moderation-note">“{item.note}”</p>

      <div className="mt-3 space-y-2">
        {reports.map((r, i) => (
          <div key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">{REASON[r.reason] || r.reason}</span>
              {r.by_shop ? ' · by the shop' : ''} · {timeAgo(r.at)}
            </p>
            {r.details && <p className="mt-0.5 break-words">{r.details}</p>}
            {r.note && r.note !== item.note && <p className="mt-0.5 text-slate-400 break-words">When reported: “{r.note}”</p>}
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => act('keep')} disabled={!!busy} data-testid="moderation-keep" className="flex-1 h-10 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
          {busy === 'keep' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Keep it
        </button>
        <button type="button" onClick={() => act('remove')} disabled={!!busy} data-testid="moderation-remove" className="flex-1 h-10 rounded-full bg-rose-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
          {busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove it
        </button>
      </div>
    </section>
  );
}

function Empty({ title, children, testId }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-6 text-center" data-testid={testId}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{children}</p>
    </section>
  );
}

export default function ExploreModeration() {
  const { appUser } = useAppUser() || {};
  const [state, setState] = useState('loading'); // loading | ready | error | denied
  const [held, setHeld] = useState([]);
  const [items, setItems] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Ratings to check · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!appUser) { setState('denied'); return undefined; }
    let cancelled = false;
    (async () => {
      if (!(await amIModerator())) { if (!cancelled) setState('denied'); return; }
      try {
        const [onHold, reported] = await Promise.all([ratingReviewQueue(0, 100), moderationQueue(0, 100)]);
        if (!cancelled) { setHeld(onHold); setItems(reported); setState('ready'); }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="moderation-page">
      <Header />
      <main className="max-w-xl mx-auto px-4 pt-3 space-y-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
        {state === 'denied' && (
          <section className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="moderation-denied">
            <p className="text-sm font-semibold text-slate-900">This page is for Sellio’s moderators.</p>
          </section>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-600">We couldn’t load them just now.</p>
            <button type="button" onClick={reload} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            <SectionTitle count={held.length}>Ratings on hold</SectionTitle>
            <p className="text-xs text-slate-500 leading-relaxed px-1">
              These looked suspicious, so they don’t count yet. Keep one if it looks like a real buyer’s: it counts, and the shop is told.
              Remove it if it looks like the shop, or someone close to it, rating itself: it never counts, and no one is told.
            </p>
            {held.length === 0 ? (
              <Empty title="No ratings on hold" testId="held-empty">Ratings that look suspicious show up here.</Empty>
            ) : held.map((item) => (
              <HeldRating key={item.rating_id} item={item} onDone={(id) => setHeld((prev) => prev.filter((x) => x.rating_id !== id))} />
            ))}

            <div className="pt-3">
              <SectionTitle count={items.length}>Reported comments</SectionTitle>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed px-1">
              Remove a comment that shares someone’s personal details, harasses or abuses anyone, is spam, or isn’t about a real order.
              Keep honest criticism, even when it’s harsh. Removing a comment doesn’t remove the buyer’s stars.
            </p>
            {items.length === 0 ? (
              <Empty title="Nothing to review" testId="moderation-empty">Reported comments show up here.</Empty>
            ) : items.map((item) => (
              <ReportedComment key={item.rating_id} item={item} onDone={(id) => setItems((prev) => prev.filter((x) => x.rating_id !== id))} />
            ))}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}
