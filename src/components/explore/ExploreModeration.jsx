import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { REPORT_REASONS, amIModerator, moderateComment, moderationQueue } from '@/lib/ratings';
import { Stars } from '@/components/ratings/RatingParts';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { goBack, storeUrl, timeAgo } from './shared';

// /moderation — Sellio's moderators (app.moderators) review reported public comments:
// keep one (it shows again, and later reports wait for review) or remove it (the buyer is
// told; their stars still count). Everyone else sees that the page isn't for them.

const REASON = Object.fromEntries(REPORT_REASONS);

function Header({ onBack }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-xl mx-auto px-2 h-14 flex items-center gap-1">
        <button type="button" onClick={onBack} aria-label="Back" className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900">Reported comments</h1>
      </div>
    </header>
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

export default function ExploreModeration() {
  const navigate = useNavigate();
  const { appUser } = useAppUser() || {};
  const [state, setState] = useState('loading'); // loading | ready | error | denied
  const [items, setItems] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Reported comments · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!appUser) { setState('denied'); return undefined; }
    let cancelled = false;
    (async () => {
      if (!(await amIModerator())) { if (!cancelled) setState('denied'); return; }
      try {
        const list = await moderationQueue(0, 100);
        if (!cancelled) { setItems(list); setState('ready'); }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="moderation-page">
      <Header onBack={() => goBack(navigate, '/explore/me')} />
      <main className="max-w-xl mx-auto px-4 pt-3 space-y-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
        {state === 'denied' && (
          <section className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="moderation-denied">
            <p className="text-sm font-semibold text-slate-900">This page is for Sellio’s moderators.</p>
          </section>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-600">We couldn’t load the reports just now.</p>
            <button type="button" onClick={reload} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            <p className="text-xs text-slate-500 leading-relaxed px-1">
              Remove a comment that shares someone’s personal details, harasses or abuses anyone, is spam, or isn’t about a real order.
              Keep honest criticism, even when it’s harsh. Removing a comment doesn’t remove the buyer’s stars.
            </p>
            {items.length === 0 ? (
              <section className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="moderation-empty">
                <p className="text-sm font-semibold text-slate-900">Nothing to review</p>
                <p className="mt-1 text-xs text-slate-500">Reported comments show up here.</p>
              </section>
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
