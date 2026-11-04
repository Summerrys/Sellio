// Order alert sounds for the Orders page and the kitchen screen.
//
// - The setting is the signed-in person's own (app_users.order_alerts, also on the account
//   panel), read fresh each time one of these pages opens. This device keeps a copy per shop
//   so the page starts with it straight away. Turning it on plays the new-order tone once, as
//   a test. Turning it off silences everything at once.
// - A new order rings the new-order tone once. While it is still new (nobody has accepted
//   it), the urgent tone rings twice every 30 seconds, 1 minute or 2 minutes, as chosen.
//   Each order is followed on its own: accepting, cancelling or changing it stops its
//   reminders, and old orders already waiting when the page opened never start any.
//   Changing how often takes effect straight away.
// - Pages pass every realtime row to seen(), which also says what the order's status was
//   before, so "became ready" is told apart from other changes (realtime sends only the id of
//   the old row).
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { isCapacitorApp } from '@/lib/nativeApp';
import { NEW_ORDER_TONE_URL, URGENT_ORDER_TONE_URL } from '@/lib/kdsSounds';

// The account panel sends this when the setting changes there: { detail: { on } }.
export const ORDER_ALERTS_EVENT = 'sellio:order-alerts';
export const REMIND_EVERY = [30, 60, 120]; // seconds
const DEFAULT_EVERY = 60;
// How far along an order is. A list that shows an order earlier than this is older than the
// news that moved it on, so it doesn't stop that order's reminders.
const STEP = { pending: 0, confirmed: 1, preparing: 2, ready: 3, served: 4, completed: 5, cancelled: 6 };
// A list that arrives this long after an order started waiting has been fetched since then.
const LIST_GRACE_MS = 10000;

const onKey = (tenantId) => `sellio_sound_alerts_${tenantId}`;
const everyKey = (tenantId) => `sellio_alert_interval_${tenantId}`;
function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode: this visit only */ }
}
function storedOn(tenantId) {
  return !!tenantId && readLocal(onKey(tenantId)) === 'true';
}
function storedEvery(tenantId) {
  const value = Number(tenantId ? readLocal(everyKey(tenantId)) : NaN);
  return REMIND_EVERY.includes(value) ? value : DEFAULT_EVERY;
}

// ── The two tones ────────────────────────────────────────────────────────────────────────
// One <audio> element per tone for the whole visit (not the Web Audio API: iPhones and iPads
// have proven unreliable at playing that from a realtime event or a timer). `token` changes
// each time a tone is started or stopped, so a step left over from an earlier start (the
// next ring of an urgent pair, a silent start below) never acts on a newer one.
const tones = {};
function tone(kind) {
  if (!tones[kind]) {
    const el = new Audio(kind === 'urgent' ? URGENT_ORDER_TONE_URL : NEW_ORDER_TONE_URL);
    el.preload = 'auto';
    tones[kind] = { el, token: 0, ringing: false };
  }
  return tones[kind];
}

export function playTone(kind, times = kind === 'urgent' ? 2 : 1) {
  const t = tone(kind);
  const mine = ++t.token;
  let left = times;
  t.ringing = true;
  const ringOnce = () => {
    left -= 1;
    try {
      t.el.muted = false;
      t.el.currentTime = 0;
      const started = t.el.play();
      if (started?.catch) started.catch(() => { if (t.token === mine) t.ringing = false; });
    } catch {
      t.ringing = false;
    }
  };
  t.el.onended = () => {
    if (t.token !== mine) return;
    if (left > 0) ringOnce();
    else t.ringing = false;
  };
  ringOnce();
}

export function stopTones() {
  for (const t of Object.values(tones)) {
    t.token += 1;
    t.ringing = false;
    t.el.onended = null;
    try { t.el.pause(); t.el.currentTime = 0; } catch { /* not loaded yet */ }
  }
}

// Browsers play sound only after the person has tapped the page, and iPhone and iPad Safari
// need each <audio> element started from a tap once. This starts the tones muted (from a tap
// where there is one) and stops them again, leaving a tone that is ringing alone. Sellio's
// apps play sound without a tap (Capacitor allows it), so they skip this.
let lastPrimed = 0;
function primeTones({ force = false } = {}) {
  if (isCapacitorApp()) return;
  const now = Date.now();
  if (!force && now - lastPrimed < 10000) return;
  lastPrimed = now;
  for (const kind of ['new', 'urgent']) {
    const t = tone(kind);
    if (t.ringing) continue;
    const mine = ++t.token;
    const el = t.el;
    try {
      el.muted = true;
      const started = el.play();
      const done = () => {
        if (t.token !== mine) return; // rang for real meanwhile: leave it
        try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
        el.muted = false;
      };
      if (started?.then) started.then(done, () => { if (t.token === mine) el.muted = false; });
      else done();
    } catch {
      el.muted = false;
    }
  }
}

// ── The hook ─────────────────────────────────────────────────────────────────────────────
// orders: the page's current list, used for what each order's status was before a change.
export function useOrderAlerts({ tenantId, userId, orders }) {
  const [on, setOnState] = useState(() => storedOn(tenantId));
  const [every, setEveryState] = useState(() => storedEvery(tenantId));
  const onRef = useRef(on);
  const everyRef = useRef(every);
  const tenantRef = useRef(tenantId);
  const changesRef = useRef(0); // bumps on every change made here, so an older read can't undo it
  const waitingRef = useRef(new Map()); // order id → { status it is waiting in, since }
  const statusRef = useRef(new Map()); // order id → last status heard
  const ordersRef = useRef({ list: orders || [], at: Date.now() });
  const timerRef = useRef(null);

  const stopReminders = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // Backs up the realtime changes (one can be missed): the page's list shows an order past
  // the status it was waiting in, or no longer shows it (done, or deleted) although the list
  // arrived well after the order started waiting. A list from before then can lack a new
  // order or show an older status: that says nothing.
  const tidyWaiting = useCallback(() => {
    const { list, at } = ordersRef.current;
    for (const [id, waiting] of waitingRef.current) {
      const order = list.find((o) => o.id === id);
      if (!order) {
        if (at - waiting.since > LIST_GRACE_MS) waitingRef.current.delete(id);
        continue;
      }
      const step = STEP[order.status];
      if (order.is_deleted || step === undefined || step > STEP[waiting.status]) waitingRef.current.delete(id);
    }
  }, []);

  const startReminders = useCallback(() => {
    stopReminders();
    if (!onRef.current || !waitingRef.current.size) return;
    timerRef.current = setInterval(() => {
      tidyWaiting();
      if (!onRef.current || !waitingRef.current.size) { stopReminders(); return; }
      playTone('urgent');
    }, everyRef.current * 1000);
  }, [stopReminders, tidyWaiting]);

  const apply = useCallback((value) => {
    onRef.current = value;
    setOnState(value);
    if (tenantRef.current) writeLocal(onKey(tenantRef.current), value);
    if (!value) {
      waitingRef.current.clear();
      stopReminders();
      stopTones();
    }
  }, [stopReminders]);

  // This shop's copy on this device first, then the person's own setting.
  useEffect(() => {
    tenantRef.current = tenantId;
    if (!tenantId) return;
    const local = readLocal(onKey(tenantId));
    if (local === 'true' || local === 'false') {
      onRef.current = local === 'true';
      setOnState(local === 'true');
    }
    everyRef.current = storedEvery(tenantId);
    setEveryState(everyRef.current);
  }, [tenantId]);

  useEffect(() => {
    if (!userId || !tenantId) return undefined;
    let cancelled = false;
    const changesAtStart = changesRef.current;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.from('app_users').select('order_alerts').eq('id', userId).maybeSingle();
        if (cancelled || error || !data || changesRef.current !== changesAtStart) return;
        apply(data.order_alerts !== false);
      } catch { /* offline: keep this device's copy */ }
    })();
    return () => { cancelled = true; };
  }, [userId, tenantId, apply]);

  // Changed on the account panel.
  useEffect(() => {
    const onChange = (event) => {
      if (typeof event.detail?.on !== 'boolean') return;
      changesRef.current += 1;
      apply(event.detail.on);
    };
    window.addEventListener(ORDER_ALERTS_EVENT, onChange);
    return () => window.removeEventListener(ORDER_ALERTS_EVENT, onChange);
  }, [apply]);

  const setOn = useCallback((value) => {
    changesRef.current += 1;
    apply(value);
    if (value) {
      playTone('new'); // the test ring, from this tap
      primeTones({ force: true }); // and the urgent tone, from the same tap (websites only)
    }
    if (userId) {
      (async () => {
        try {
          const supabase = await getSupabase();
          const { error } = await supabase.from('app_users').update({ order_alerts: value }).eq('id', userId);
          if (error) console.warn('Order alerts setting not saved:', error.message);
        } catch (error) {
          console.warn('Order alerts setting not saved:', error?.message || error);
        }
      })();
    }
  }, [apply, userId]);

  const setEvery = useCallback((seconds) => {
    if (!REMIND_EVERY.includes(seconds)) return;
    everyRef.current = seconds;
    setEveryState(seconds);
    if (tenantRef.current) writeLocal(everyKey(tenantRef.current), seconds);
    if (timerRef.current) startReminders(); // already reminding: at the new pace from now
  }, [startReminders]);

  // Rings for an order. remind: keep reminding while it stays in its current status.
  const ring = useCallback((order, { remind = true } = {}) => {
    if (!onRef.current) return;
    playTone('new');
    if (remind && order?.id && STEP[order.status] !== undefined) {
      waitingRef.current.set(order.id, { status: order.status, since: Date.now() });
      startReminders();
    }
  }, [startReminders]);

  // Every realtime row (for a deleted order: { id }). Returns the status the order had before.
  const seen = useCallback((row) => {
    if (!row?.id) return undefined;
    const before = statusRef.current.has(row.id)
      ? statusRef.current.get(row.id)
      : ordersRef.current.list.find((o) => o.id === row.id)?.status;
    statusRef.current.set(row.id, row.status);
    const waiting = waitingRef.current.get(row.id);
    if (waiting && (row.status !== waiting.status || row.is_deleted)) {
      waitingRef.current.delete(row.id);
      if (!waitingRef.current.size) stopReminders();
    }
    return before;
  }, [stopReminders]);

  useEffect(() => {
    ordersRef.current = { list: orders || [], at: Date.now() };
    // The first status this page sees for each order, so its own quick update to the list
    // can't hide a change that realtime reports a moment later.
    for (const order of ordersRef.current.list) {
      if (order?.id && !statusRef.current.has(order.id)) statusRef.current.set(order.id, order.status);
    }
    tidyWaiting();
    if (timerRef.current && !waitingRef.current.size) stopReminders();
  }, [orders, tidyWaiting, stopReminders]);

  // Websites: start the tones silently from taps, on coming back to the page and every 20
  // seconds while sound is on, so an idle tablet can still ring (see primeTones).
  useEffect(() => {
    if (!on || isCapacitorApp()) return undefined;
    const onTap = () => primeTones();
    const onVisible = () => { if (document.visibilityState === 'visible') primeTones({ force: true }); };
    window.addEventListener('pointerdown', onTap, { capture: true, passive: true });
    window.addEventListener('touchstart', onTap, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const keepAlive = setInterval(() => {
      if (document.visibilityState === 'visible') primeTones({ force: true });
    }, 20000);
    return () => {
      window.removeEventListener('pointerdown', onTap, { capture: true });
      window.removeEventListener('touchstart', onTap, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(keepAlive);
    };
  }, [on]);

  // Leaving the page: no reminders, nothing left ringing.
  useEffect(() => () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    stopTones();
  }, []);

  return { on, setOn, every, setEvery, ring, seen };
}
