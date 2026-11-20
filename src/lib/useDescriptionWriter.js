import { useCallback, useEffect, useRef, useState } from 'react';
import { appT } from '@/lib/appText';
import { explainError } from '@/lib/plainError';
import { describeItems, DESCRIBE_BATCH, CANT_WRITE, TYPE_STEP_MS, typeStep } from '@/lib/menuDescriptions';

// Scan Menu's review fills in descriptions one by one (Alvin, 20 Nov 2026): start(items) asks
// describeMenuItems for them a few at a time, in the order given (the menu's), the next few
// while these are typed out. Each item's state is on the item itself:
//   _desc: 'waiting' (asked for), 'writing' (being typed, _typed so far), 'done' (an AI draft
//          in place), 'own' (the shop's own words: never written over), or none.
// release(id) when the shop types its own description or removes the item: it's skipped.
// stop() ends it: the one being typed is put in full (it came already; stop() returns it,
// { id, text }, for a save that can't wait for the screen), those still waiting stay blank. Typing is shown only where the phone allows motion; otherwise each appears whole.
// progress: { status: 'idle' | 'writing' | 'done' | 'stopped' | 'failed', total, done, error }:
// items asked for, and finished so far (written or not).
export const IDLE = { status: 'idle', total: 0, done: 0, error: null };
const busy = (item) => item._desc === 'waiting' || item._desc === 'writing';

function canAnimate() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function useDescriptionWriter({ tenantId, setItems }) {
  // waiting: ids still to be written (decided here, not from the items on screen, which can be a
  // render behind); typing: the one being typed out.
  const run = useRef({ id: 0, controller: null, waiting: new Set(), typing: null, timer: null });
  const [progress, setProgress] = useState(IDLE);

  // The text in place, an AI draft, unless the shop has typed its own.
  const put = useCallback((id, text) => {
    setItems((prev) => prev.map((item) => (item._id === id && item._desc !== 'own'
      ? { ...item, description: text, _desc: 'done', _typed: undefined }
      : item)));
  }, [setItems]);

  const halt = useCallback(() => {
    const r = run.current;
    r.id += 1;
    r.controller?.abort();
    r.controller = null;
    clearTimeout(r.timer);
    let finished = null;
    if (r.typing) {
      const { id, text, resolve } = r.typing;
      r.typing = null;
      put(id, text);
      resolve(true);
      finished = { id, text };
    }
    r.waiting = new Set();
    setItems((prev) => (prev.some(busy) ? prev.map((item) => (busy(item) ? { ...item, _desc: undefined, _typed: undefined } : item)) : prev));
    return finished;
  }, [put, setItems]);

  const stop = useCallback(() => {
    const finished = halt();
    setProgress((p) => (p.status === 'writing' ? { ...p, status: 'stopped' } : p));
    return finished;
  }, [halt]);

  const reset = useCallback(() => {
    halt();
    setProgress(IDLE);
  }, [halt]);

  // The shop typed its own description, or removed the item: not written.
  const release = useCallback((id) => {
    const r = run.current;
    r.waiting.delete(id);
    if (r.typing?.id === id) {
      const { resolve } = r.typing;
      r.typing = null;
      clearTimeout(r.timer);
      resolve(false);
    }
  }, []);

  useEffect(() => () => halt(), [halt]);

  // Types `text` into the item, then puts it in place; true if it was put.
  const typeOut = useCallback((id, text, animate) => new Promise((resolve) => {
    const r = run.current;
    if (!r.waiting.has(id)) { resolve(false); return; }
    r.waiting.delete(id);
    if (!animate) { put(id, text); resolve(true); return; }
    const step = typeStep(text);
    let shown = 0;
    r.typing = { id, text, resolve };
    const tick = () => {
      if (r.typing?.id !== id) return; // stopped or released
      shown = Math.min(text.length, shown + step);
      if (shown >= text.length) {
        r.typing = null;
        put(id, text);
        resolve(true);
        return;
      }
      setItems((prev) => prev.map((i) => (i._id === id && i._desc !== 'own' ? { ...i, _desc: 'writing', _typed: text.slice(0, shown) } : i)));
      r.timer = setTimeout(tick, TYPE_STEP_MS);
    };
    tick();
  }), [put, setItems]);

  const start = useCallback(async (queue) => {
    halt();
    const r = run.current;
    const id = r.id;
    const controller = new AbortController();
    r.controller = controller;
    const alive = () => run.current.id === id;
    const list = (queue || []).filter((item) => String(item?.name || '').trim());
    if (!list.length) { setProgress(IDLE); return; }
    const animate = canAnimate();
    r.waiting = new Set(list.map((item) => item._id));
    setItems((prev) => prev.map((item) => (r.waiting.has(item._id) ? { ...item, _desc: 'waiting', _typed: undefined } : item)));
    let done = 0;
    setProgress({ status: 'writing', total: list.length, done, error: null });
    const batches = [];
    for (let i = 0; i < list.length; i += DESCRIBE_BATCH) batches.push(list.slice(i, i + DESCRIBE_BATCH));
    const ask = (batch) => describeItems({ tenantId, items: batch, signal: controller.signal });
    let pending = ask(batches[0]);
    for (let b = 0; b < batches.length; b++) {
      let texts;
      try {
        texts = await pending;
      } catch (error) {
        if (!alive()) return;
        // Those still waiting stay blank; Try again picks them up.
        halt();
        // In plain words: the service's own reason, or what went wrong (offline, no connection…).
        setProgress((p) => ({ ...p, status: 'failed', error: explainError(error, { t: appT, fallback: appT(CANT_WRITE) }).description }));
        return;
      }
      if (!alive()) return;
      // The next few are asked for while these are typed out.
      pending = b + 1 < batches.length ? ask(batches[b + 1]) : null;
      pending?.catch(() => {});
      for (let k = 0; k < batches[b].length; k++) {
        const item = batches[b][k];
        const text = texts[k];
        if (text) {
          await typeOut(item._id, text, animate);
          if (!alive()) return;
        } else {
          r.waiting.delete(item._id);
          setItems((prev) => prev.map((i) => (i._id === item._id && busy(i) ? { ...i, _desc: undefined, _typed: undefined } : i)));
        }
        done += 1;
        setProgress((p) => ({ ...p, done }));
      }
    }
    if (alive()) setProgress((p) => ({ ...p, status: 'done' }));
  }, [halt, put, setItems, tenantId, typeOut]);

  return { progress, start, stop, reset, release };
}
