import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Mail, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { showError } from '@/lib/plainError';
import { useAppUser } from '@/lib/AppUserContext';
import { useAppRefreshHandler } from '@/lib/AppRefreshContext';
import { outsideLinkProps } from '@/lib/nativeApp';
import { whatsappLink } from '@/lib/shopSelling';
import { FEEDBACK_TOPICS, amISellioAdmin, feedbackList, feedbackSummary, markFeedback, noteTestPhone } from '@/lib/appFeedback';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';
import { timeAgo } from '@/components/explore/shared';

// /admin/feedback — Admin → Feedback: how people rate the Sellio app (lib/appFeedback.js), for
// Sellio's admins (app.is_sellio_admin(): the account, checked by the database). 1–3 star ratings
// also send the admins a push alert. Opening this page on a phone tags everything sent from that
// phone as a test (Alvin tries the app on test accounts on his own phone), so tests stay out of
// the numbers unless "Show tests" is on. English only: it's for Sellio's own team.

const PAGE = 50;
const PURPLE = '#8b2fc9';
const PINK = '#e0449a';
const TOPIC = Object.fromEntries(FEEDBACK_TOPICS);
const ROLE = { guest: 'Not signed in', buyer: 'Buyer', seller: 'Business', home_seller: 'Home seller', staff: 'Staff' };
const LANGUAGE = { en: 'EN', zh: '中文', ms: 'BM', id: 'ID' };
const LANG_ATTR = { en: 'en', zh: 'zh-Hans', ms: 'ms', id: 'id' };
const PLATFORM = { android: 'Android', ios: 'iPhone', web: 'Website' };
const FILTERS = [
  ['all', 'All'],
  ['low', '1–3★'],
  ['four', '4★'],
  ['five', '5★'],
  ['open', 'To do'],
];

function Stars({ value, size = 16 }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className="inline-flex" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.46l-5.8 3.06 1.1-6.47-4.7-4.6 6.5-.95L12 2.6z"
            fill={n <= value ? (value <= 3 ? PINK : PURPLE) : 'none'}
            stroke={n <= value ? (value <= 3 ? PINK : PURPLE) : '#cbd5e1'}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

function Summary({ summary }) {
  const byStars = summary?.by_stars || {};
  const ratings = Number(summary?.ratings) || 0;
  const most = Math.max(1, ...[1, 2, 3, 4, 5].map((n) => Number(byStars[n]) || 0));
  return (
    <section aria-label="Rating summary" className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 flex items-center gap-[18px]">
      <div className="flex flex-col items-start" style={{ width: 96 }}>
        <span className="text-4xl leading-10 font-extrabold text-slate-900">{ratings ? Number(summary.average).toFixed(1) : '–'}</span>
        <span className="text-[13px] leading-[18px] text-slate-600">{ratings === 1 ? 'from 1 rating' : `from ${ratings} ratings`}</span>
      </div>
      <div className="flex-1 flex flex-col gap-[5px]">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = Number(byStars[n]) || 0;
          return (
            <div key={n} className="flex items-center gap-2 text-xs leading-[14px] text-slate-600">
              <span style={{ width: 18 }}>{n}★</span>
              <span className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                <span className="block h-2" style={{ width: `${Math.round((count / most) * 100)}%`, background: n <= 3 ? PINK : PURPLE }} />
              </span>
              <span className="text-right" style={{ width: 22 }}>{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Tag({ children, tone = 'plain' }) {
  const tones = {
    plain: { background: '#f1f5f9', color: '#334155', fontWeight: 500 },
    green: { background: '#ecfdf5', color: '#047857', fontWeight: 600 },
    purple: { background: '#f3e8ff', color: '#6b21a8', fontWeight: 600 },
    amber: { background: '#fef3c7', color: '#92400e', fontWeight: 600 },
  };
  return <span className="h-6 px-[9px] rounded-full text-xs leading-6" style={tones[tone]}>{children}</span>;
}

function FeedbackCard({ item, onMarked }) {
  const [busy, setBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const done = item.status === 'done';
  const phone = item.contact_phone || '';
  const email = item.contact_email || '';
  const canContact = item.contact_ok && (phone || email);
  const meta = [
    ROLE[item.role] || item.role,
    item.shop_name,
    LANGUAGE[item.language],
    PLATFORM[item.platform],
    item.app_version ? `v${item.app_version}` : null,
  ].filter(Boolean).join(' · ');

  const mark = async () => {
    setBusy(true);
    try {
      await markFeedback(item.id, !done);
      onMarked(item.id, done ? 'new' : 'done');
      toast.success(done ? 'Moved back to to-do' : 'Marked done');
    } catch (e) {
      showError(e, 'Couldn’t update it');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="p-3.5 bg-white border border-slate-200 rounded-2xl flex flex-col gap-2" data-testid="feedback-item" data-status={item.status}>
      <div className="flex items-center justify-between">
        <Stars value={Number(item.stars) || 0} />
        <span className="flex items-center gap-1.5 text-xs leading-4 text-slate-500">
          {timeAgo(item.created_at)}
          {!done && <span role="img" aria-label="Not done yet" className="block w-2 h-2 rounded-full" style={{ background: PURPLE }} />}
        </span>
      </div>
      {item.comment
        ? <p lang={LANG_ATTR[item.language]} className="m-0 text-[15px] leading-[21px] text-slate-900 whitespace-pre-wrap break-words">{item.comment}</p>
        : <p className="m-0 text-sm text-slate-400">No comment</p>}
      {(item.topics?.length > 0 || item.contact_ok || item.opened_play || item.is_test) && (
        <div className="flex flex-wrap gap-1.5">
          {(item.topics || []).map((key) => <Tag key={key}>{TOPIC[key] || key}</Tag>)}
          {item.contact_ok && <Tag tone="green">Contact OK</Tag>}
          {item.opened_play && <Tag tone="purple">Opened Google Play</Tag>}
          {item.is_test && <Tag tone="amber">Test</Tag>}
        </div>
      )}
      <span className="text-xs leading-4 text-slate-500">{meta}</span>
      {contactOpen && canContact && (
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50 p-2 text-sm" data-testid="feedback-contact">
          {item.contact_name && <span className="px-2 pt-1 font-semibold text-slate-900">{item.contact_name}</span>}
          {phone && (
            <>
              <a {...outsideLinkProps(whatsappLink(phone))} className="flex items-center gap-2 px-2 py-2 rounded-lg text-slate-700 active:bg-slate-100">
                <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp {phone}
              </a>
              <a href={`tel:${phone}`} className="flex items-center gap-2 px-2 py-2 rounded-lg text-slate-700 active:bg-slate-100">
                <Phone className="w-4 h-4 text-slate-500" /> Call {phone}
              </a>
            </>
          )}
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent('Your Sellio feedback')}`} className="flex items-center gap-2 px-2 py-2 rounded-lg text-slate-700 active:bg-slate-100 break-all">
              <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" /> {email}
            </a>
          )}
        </div>
      )}
      <div className="flex gap-2 mt-0.5">
        {canContact && (
          <button
            type="button"
            onClick={() => setContactOpen((v) => !v)}
            aria-expanded={contactOpen}
            className="h-9 px-4 rounded-[10px] border bg-white text-sm font-semibold"
            style={{ borderColor: PURPLE, color: '#6b21a8' }}
          >
            Contact
          </button>
        )}
        <button type="button" onClick={mark} disabled={busy} className="h-9 px-3 rounded-[10px] text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-60">
          {done ? 'Not done yet' : 'Mark done'}
        </button>
      </div>
    </article>
  );
}

export default function AppFeedbackInbox() {
  const { appUser } = useAppUser() || {};
  const [state, setState] = useState('loading'); // loading | ready | error | denied
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('all');
  const [includeTest, setIncludeTest] = useState(false);
  const [items, setItems] = useState([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Feedback · Sellio';
    return () => { document.title = previous; };
  }, []);

  // Sellio's admins only (the database checks again on every call). This phone's answers become tests.
  const account = String(appUser?.email || '').trim().toLowerCase();
  const [admin, setAdmin] = useState(null); // null while checking
  useEffect(() => {
    if (!account) { setAdmin(false); return undefined; }
    let cancelled = false;
    setAdmin(null);
    amISellioAdmin().then((yes) => {
      if (cancelled) return;
      setAdmin(yes);
      if (yes) noteTestPhone();
    });
    return () => { cancelled = true; };
  }, [account]);

  useEffect(() => {
    if (admin === null) { setState('loading'); return undefined; }
    if (!admin) { setState('denied'); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const [nextSummary, list] = await Promise.all([feedbackSummary({ includeTest }), feedbackList({ filter, includeTest, limit: PAGE })]);
        if (cancelled) return;
        setSummary(nextSummary);
        setItems(list);
        setMore(list.length === PAGE);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [admin, filter, includeTest, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useAppRefreshHandler(reload);

  const loadMore = async () => {
    if (loadingMore || !items.length) return;
    setLoadingMore(true);
    try {
      const next = await feedbackList({ filter, includeTest, before: items[items.length - 1].created_at, limit: PAGE });
      setItems((now) => [...now, ...next.filter((n) => !now.some((o) => o.id === n.id))]);
      setMore(next.length === PAGE);
    } catch (e) {
      showError(e, 'Couldn’t load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const onMarked = (id, status) => {
    setItems((now) => (filter === 'open' && status === 'done'
      ? now.filter((i) => i.id !== id)
      : now.map((i) => (i.id === id ? { ...i, status } : i))));
    feedbackSummary({ includeTest }).then(setSummary).catch(() => {});
  };

  const byStars = summary?.by_stars || {};
  const count = {
    all: Number(summary?.ratings) || 0,
    low: [1, 2, 3].reduce((sum, n) => sum + (Number(byStars[n]) || 0), 0),
    four: Number(byStars[4]) || 0,
    five: Number(byStars[5]) || 0,
    open: Number(summary?.low_open) || 0,
  };
  const extras = [
    summary?.dismissed ? `Maybe later: ${summary.dismissed}` : null,
    summary?.opened_play ? `Opened Google Play: ${summary.opened_play}` : null,
    !includeTest && summary?.tests ? `${summary.tests} test ${summary.tests === 1 ? 'answer' : 'answers'} left out` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="feedback-inbox">
      <header className="bg-slate-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-xl mx-auto px-5 pt-4">
          <h1 className="m-0 text-[28px] leading-[34px] font-extrabold text-slate-900">Feedback</h1>
          <p className="mt-0.5 mb-0 text-sm text-slate-600">How people rate the Sellio app</p>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-5 pt-3 space-y-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-200 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
        {state === 'denied' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="feedback-denied">
            <p className="m-0 text-sm font-semibold text-slate-900">This page is for Sellio’s admins.</p>
          </section>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="m-0 text-sm text-slate-600">We couldn’t load the feedback just now.</p>
            <button type="button" onClick={reload} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-[14px] text-[13px] leading-[18px] text-slate-600">
              <Bell className="w-4 h-4 flex-shrink-0" style={{ color: PURPLE }} />
              <span>Each 1–3★ rating sends Sellio’s admins a push alert.</span>
            </div>
            <Summary summary={summary} />
            {extras.length > 0 && <p className="m-0 px-1 text-xs text-slate-500">{extras.join(' · ')}</p>}
            <div role="group" aria-label="Filter by rating" className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {FILTERS.map(([key, label]) => {
                const on = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(key)}
                    className="h-9 px-3.5 rounded-full border text-[13px] whitespace-nowrap flex-shrink-0"
                    style={on
                      ? { borderColor: '#0f172a', background: '#0f172a', color: '#fff', fontWeight: 600 }
                      : { borderColor: '#cbd5e1', background: '#fff', color: '#334155', fontWeight: 500 }}
                  >
                    {label} · {count[key]}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 px-1 text-sm text-slate-600">
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} className="w-4 h-4" style={{ accentColor: PURPLE }} />
              Show tests (sent from admin accounts, or from a phone that opened this page)
            </label>
            {items.length === 0 ? (
              <section className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="feedback-empty">
                <p className="m-0 text-sm font-semibold text-slate-900">{filter === 'open' ? 'Nothing to do' : 'No ratings here yet'}</p>
                <p className="mt-1 mb-0 text-xs text-slate-500">People are asked on the third day they open the Android app.</p>
              </section>
            ) : (
              <div className="flex flex-col gap-2.5">
                {items.map((item) => <FeedbackCard key={item.id} item={item} onMarked={onMarked} />)}
              </div>
            )}
            {more && (
              <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more
              </button>
            )}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}
