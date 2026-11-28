import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Store, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { amISellioAdmin } from '@/lib/appFeedback';
import { ACTION_ERRORS, daysUntil, deletionAction, deletionRequests } from '@/lib/adminDeletions';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';

// /admin/deletions — Admin → Deletion requests, for Sellio's admins (Alvin, 29 Nov 2026: "me as
// an admin should be able to approve on her delete as well and if I have not manually approved
// immediate removal, it will remain as how it is now which is given a certain days of store
// restoration"). A waiting request can be deleted now (as "Start again" does: Stripe ends, then
// the shop's files, its rows and the login) or restored; one nobody touches stays closed, and
// its owner can still keep it, until its date. A deleted account's leftover files can be removed.
// English only: it's for Sellio's own team.

const WAITING = new Set(['requested', 'failed', 'processing']);
const day = (when) => {
  const at = Date.parse(when || '');
  return Number.isFinite(at)
    ? new Date(at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
    : '';
};
const shopNames = (shops) => (shops || []).map((s) => s?.name).filter(Boolean);
const LOG_WORDS = { delete_now: 'Deleted now', restore: 'Restored', remove_files: 'Files removed' };

function leftLine(days) {
  if (days === null) return '';
  if (days > 1) return `${days} days left`;
  if (days === 1) return '1 day left';
  if (days === 0) return 'due today';
  return 'past its date';
}

function LastAction({ log }) {
  const last = Array.isArray(log) && log.length ? log[log.length - 1] : null;
  if (!last) return null;
  const what = LOG_WORDS[last.action] || last.action;
  return (
    <p className="m-0 mt-1 text-[12px] leading-4 text-slate-500" data-testid="deletion-last-action">
      {last.ok ? what : `${what}: didn’t finish`} by {last.by || 'an admin'}, {day(last.at)}
    </p>
  );
}

function WaitingCard({ item, busy, onAct }) {
  const [confirming, setConfirming] = useState(null); // 'delete' | 'restore' | null
  const [typed, setTyped] = useState('');
  const shops = shopNames(item.shops);
  const days = daysUntil(item.deleteAfter);
  const who = item.name || item.email || item.phone || 'An account';
  const stripeTrouble = (item.stripe || []).some((s) => s && s.ok === false);
  const close = () => { setConfirming(null); setTyped(''); };

  return (
    <article className="px-4 py-3.5" data-testid={`deletion-${item.id}`}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
          <UserX className="w-[18px] h-[18px]" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[15px] leading-5 font-semibold text-slate-900 truncate">{who}</p>
          <p className="m-0 text-[13px] leading-[18px] text-slate-500 truncate">
            {[item.name ? item.email : null, item.phone].filter(Boolean).join(' · ') || ' '}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[18px] text-slate-700 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{shops.length ? `Owner of ${shops.join(', ')}` : 'No shop'}</span>
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[18px] text-slate-600" data-testid="deletion-dates">
            Asked {day(item.requestedAt)} · deletes {day(item.deleteAfter)}
            {days !== null && <b className={`font-semibold ${days <= 3 ? 'text-red-600' : 'text-slate-800'}`}> ({leftLine(days)})</b>}
          </p>
          {item.reason && <p className="m-0 mt-1.5 text-[13px] leading-[18px] text-slate-600 italic break-words">“{item.reason}”</p>}
          {item.status === 'failed' && <p className="m-0 mt-1.5 text-[13px] font-semibold text-red-600">Its deletion stopped part-way. Delete now runs it again.</p>}
          {stripeTrouble && <p className="m-0 mt-1.5 text-[13px] font-semibold text-amber-700">A Stripe plan couldn’t be stopped when this was asked for: check it in Stripe.</p>}
          {item.staffLocked > 0 && <p className="m-0 mt-1 text-[12px] text-slate-500">{item.staffLocked} staff {item.staffLocked === 1 ? 'login is' : 'logins are'} locked with it.</p>}
          <LastAction log={item.adminLog} />
        </div>
      </div>

      {!confirming && (
        <div className="mt-3 flex gap-2 justify-end">
          <button type="button" disabled={busy || !item.accountExists} onClick={() => setConfirming('restore')}
            className="h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-40" data-testid="deletion-restore">
            Restore
          </button>
          <button type="button" disabled={busy || !item.accountExists} onClick={() => setConfirming('delete')}
            className="h-9 px-4 rounded-full bg-red-600 text-white text-sm font-semibold disabled:opacity-40" data-testid="deletion-delete-now">
            Delete now
          </button>
        </div>
      )}

      {confirming === 'restore' && (
        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3" data-testid="deletion-confirm-restore">
          <p className="m-0 text-[13px] leading-[18px] text-slate-700">
            Open this account{shops.length ? ` and ${shops.join(', ')}` : ''} again now? They can sign in straight away, and a paid plan set to end renews again.
          </p>
          <div className="mt-2.5 flex gap-2 justify-end">
            <button type="button" onClick={close} disabled={busy} className="h-9 px-4 rounded-full text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" disabled={busy} onClick={() => onAct('restore', item, {}, close)}
              className="h-9 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40" data-testid="deletion-restore-confirm">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Restore
            </button>
          </div>
        </div>
      )}

      {confirming === 'delete' && (
        <div className="mt-3 rounded-xl bg-red-50/60 border border-red-200 p-3" data-testid="deletion-confirm-delete">
          <p className="m-0 text-[13px] leading-[18px] text-red-800">
            This deletes the account{shops.length ? `, ${shops.join(', ')}` : ''}{item.staffLocked > 0 ? ' and its staff logins' : ''} for good, now: its Stripe plan ends, and its photos, orders and login go. It can’t be undone.
          </p>
          <label className="block mt-2.5 text-[12px] font-semibold text-red-800" htmlFor={`confirm-${item.id}`}>Type DELETE to confirm</label>
          <input id={`confirm-${item.id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters"
            className="mt-1 w-full h-10 px-3 rounded-xl border border-red-200 bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-red-200" data-testid="deletion-confirm-input" />
          <div className="mt-2.5 flex gap-2 justify-end">
            <button type="button" onClick={close} disabled={busy} className="h-9 px-4 rounded-full text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" disabled={busy || typed.trim() !== 'DELETE'} onClick={() => onAct('delete_now', item, { confirmation: 'DELETE' }, close)}
              className="h-9 px-4 rounded-full bg-red-600 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40" data-testid="deletion-delete-confirm">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Delete for good
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function DoneCard({ item, busy, onAct }) {
  const shops = shopNames(item.shops);
  const deleted = item.status === 'completed';
  const who = deleted ? 'Deleted account' : (item.name || item.email || item.phone || 'An account');
  return (
    <article className="px-4 py-3" data-testid={`deletion-${item.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[15px] leading-5 font-semibold text-slate-900 truncate">{who}</p>
          <p className="m-0 text-[13px] leading-[18px] text-slate-500 truncate">
            {shops.length ? shops.join(', ') : (item.shops?.length ? 'A shop' : 'No shop')}
            {' · '}
            {deleted ? `deleted ${day(item.completedAt)}` : item.status === 'reinstated' ? `restored ${day(item.reinstatedAt)}` : item.status}
          </p>
          {item.leftoverFiles > 0 && (
            <p className="m-0 mt-1 text-[13px] font-semibold text-amber-700" data-testid="deletion-leftover">
              {item.leftoverFiles} {item.leftoverFiles === 1 ? 'file is' : 'files are'} still in storage.
            </p>
          )}
          <LastAction log={item.adminLog} />
        </div>
        {item.leftoverFiles > 0 && (
          <button type="button" disabled={busy} onClick={() => onAct('remove_files', item, {}, () => {})}
            className="h-9 px-3.5 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-2 flex-shrink-0 disabled:opacity-40" data-testid="deletion-remove-files">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Remove files
          </button>
        )}
      </div>
    </article>
  );
}

export default function DeletionsAdmin() {
  const { appUser } = useAppUser() || {};
  const account = String(appUser?.email || '').trim().toLowerCase();
  const [admin, setAdmin] = useState(null); // null while checking
  const [state, setState] = useState('loading'); // loading | denied | error | ready
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Deletion requests · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!account) { setAdmin(false); return undefined; }
    let cancelled = false;
    setAdmin(null);
    amISellioAdmin().then((yes) => { if (!cancelled) setAdmin(yes); });
    return () => { cancelled = true; };
  }, [account]);

  useEffect(() => {
    if (admin === null) { setState('loading'); return undefined; }
    if (!admin) { setState('denied'); return undefined; }
    let cancelled = false;
    setState('loading');
    deletionRequests().then((list) => { if (!cancelled) { setItems(list); setState('ready'); } }, () => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [admin, reloadKey]);

  const act = useCallback(async (action, item, extra, done) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const answer = await deletionAction(action, item.id, extra);
      if (answer?.ok) {
        if (action === 'delete_now') toast.success('Deleted for good.');
        else if (action === 'restore') {
          toast.success('Restored: the account is open again.');
          if (answer.needsAHand) toast.warning(`Check its plan in Stripe: ${answer.needsAHand}`, { duration: 15000 });
        } else toast.success(answer.removed === 1 ? 'Removed 1 file.' : `Removed ${answer.removed || 0} files.`);
        done?.();
      } else {
        toast.error(ACTION_ERRORS[answer?.code] || ACTION_ERRORS.unavailable);
      }
      setItems(await deletionRequests());
    } catch {
      toast.error(ACTION_ERRORS.unavailable);
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const waiting = items.filter((i) => WAITING.has(i.status));
  const done = items.filter((i) => !WAITING.has(i.status));

  return (
    <div className="min-h-screen bg-slate-50" data-testid="deletions-admin">
      <header className="bg-slate-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-xl mx-auto px-5 pt-4">
          <h1 className="m-0 text-[28px] leading-[34px] font-extrabold text-slate-900">Deletion requests</h1>
          <p className="mt-0.5 mb-0 text-sm text-slate-600">
            Until its date, the person can still keep their account: 6 months for a shop owner, 30 days for anyone else.
          </p>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-5 pt-3 space-y-3" style={{ paddingBottom: `calc(${TAB_BAR_SPACE} + 24px)` }}>
        {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-200 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
        {state === 'denied' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="deletions-admin-denied">
            <p className="m-0 text-sm font-semibold text-slate-900">This page is for Sellio’s admins.</p>
          </section>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="m-0 text-sm text-slate-600">We couldn’t load the deletion requests just now.</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100" data-testid="deletions-waiting">
              <h2 className="m-0 px-4 pt-3.5 pb-2 text-[15px] font-bold text-slate-900">Waiting ({waiting.length})</h2>
              {waiting.length === 0
                ? <p className="m-0 px-4 py-4 text-sm text-slate-500">No account is waiting to be deleted.</p>
                : waiting.map((item) => <WaitingCard key={item.id} item={item} busy={busyId === item.id} onAct={act} />)}
            </section>
            {done.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100" data-testid="deletions-done">
                <h2 className="m-0 px-4 pt-3.5 pb-2 text-[15px] font-bold text-slate-900">Deleted or restored</h2>
                {done.map((item) => <DoneCard key={item.id} item={item} busy={busyId === item.id} onAct={act} />)}
              </section>
            )}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}
