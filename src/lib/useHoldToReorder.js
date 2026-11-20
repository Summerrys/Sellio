// Hold an item to lift it (Alvin, 20 Nov 2026). Drag it, still holding, to move it within its
// list: onMove(from, to). Let go without moving and onHold(id) runs (hold to select). In select
// mode a handle drags at once (handleProps); the arrow keys move a handle's item too.
//
// A finger that moves before the hold is up is the page's own scroll, untouched. Once an item is
// up, its moves can't scroll the page: the list keeps a touchmove listener that can stop them
// from the start (Chrome and Android's web view decide as a finger lands whether its moves can be
// stopped, and a listener added then comes too late for that finger). Pull to refresh (the app's
// own, and the page's) only starts from the very top of the page: as an item lifts the page is
// nudged 2 px down (made 8 px taller first if it couldn't scroll), and kept off its top while
// dragging, so a drag down never becomes a refresh. The nudge is put back when the item is let go.
// A handle never starts a pull (data-pull-refresh-block).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const HOLD_MS = 450;
const SLOP = 10;        // px a finger may wander while holding
const DRAG_START = 6;   // px after the lift before the item follows the finger
const EDGE_TOP = 130;   // px from the top of the screen where the page scrolls up by itself
const EDGE_BOTTOM = 150;
const MAX_SPEED = 16;   // px a frame
const LIFTED_SHADOW = '0 16px 32px rgba(15,23,42,0.18), 0 3px 8px rgba(15,23,42,0.08)';

const page = () => document.scrollingElement || document.documentElement;
const scrollTo = (top) => window.scrollTo({ top, behavior: 'instant' });
const prevent = (event) => event.preventDefault();

// Where each item of a moved list ends up: index → index after moving `from` to `to`.
export function shiftedIndex(index, from, to) {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export default function useHoldToReorder({ ids, canMove = false, onMove, onHold }) {
  const latest = useRef(null);
  latest.current = { ids, canMove, onMove, onHold };
  const gesture = useRef(null);
  const listEl = useRef(null);
  const frame = useRef(0);
  const ignoreClickUntil = useRef(0);
  const [view, setView] = useState(null); // { id, from, to, dragging, slots } | { settling: true }

  const handlers = useMemo(() => {
    const restoreItem = (g, dropped) => {
      const el = g.el;
      if (!el || !g.saved) return;
      if (dropped) {
        // It moves to its new place in the list now: no sliding back from where it was let go.
        el.style.transition = 'none';
        requestAnimationFrame(() => { el.style.transition = g.saved.transition; });
      } else {
        el.style.transition = 'transform 120ms ease, box-shadow 120ms ease';
        setTimeout(() => { el.style.transition = g.saved.transition; }, 140);
      }
      el.style.transform = g.saved.transform;
      el.style.boxShadow = g.saved.boxShadow;
      el.style.zIndex = g.saved.zIndex;
      el.style.position = g.saved.position;
      el.style.willChange = g.saved.willChange;
    };

    const finish = (dropped = false) => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      clearTimeout(g.timer);
      cancelAnimationFrame(frame.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      restoreItem(g, dropped);
      if (g.grew) document.documentElement.style.minHeight = g.grew.before;
      if (g.nudged && Math.abs(page().scrollTop - g.nudged.to) < 1) scrollTo(g.nudged.from);
      if (dropped) {
        // The list is drawn in its new order with no item sliding, then as before.
        setView({ settling: true });
        requestAnimationFrame(() => setView(null));
      } else {
        setView(null);
      }
    };

    const nudge = (g) => {
      const doc = page();
      if (doc.scrollTop >= 2) return;
      if (doc.scrollHeight - doc.clientHeight < 2) {
        g.grew = { before: document.documentElement.style.minHeight };
        document.documentElement.style.minHeight = `${doc.clientHeight + 8}px`;
      }
      const from = doc.scrollTop;
      scrollTo(2);
      g.nudged = { from, to: page().scrollTop };
    };

    const lift = (g) => {
      g.phase = 'lifted';
      try { navigator.vibrate?.(12); } catch { /* no vibration on this phone */ }
      if (!g.handle) nudge(g);
      const el = g.el;
      g.saved = {
        transform: el.style.transform, transition: el.style.transition, boxShadow: el.style.boxShadow,
        zIndex: el.style.zIndex, position: el.style.position, willChange: el.style.willChange,
      };
      el.style.transition = 'transform 120ms ease, box-shadow 120ms ease';
      el.style.transform = 'scale(1.03)';
      el.style.boxShadow = LIFTED_SHADOW;
      if (!el.style.position) el.style.position = 'relative';
      el.style.zIndex = '25';
      el.style.willChange = 'transform';
      setView({ id: g.id, from: g.index, to: g.index, dragging: false });
    };

    const startDrag = (g) => {
      const list = listEl.current;
      const els = list ? [...list.querySelectorAll('[data-reorder-id]')] : [];
      if (els.length !== latest.current.ids.length || !els[g.index]) { finish(); return; }
      const scrollY = page().scrollTop;
      // Measured as drawn without the lift, so each place is where an item sits.
      const lifted = g.el.style.transform;
      g.el.style.transform = 'none';
      g.slots = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top + scrollY, cx: r.left + r.width / 2, cy: r.top + scrollY + r.height / 2 };
      });
      g.el.style.transform = lifted;
      g.scroll0 = scrollY;
      g.to = g.index;
      g.phase = 'dragging';
      g.el.style.transition = 'box-shadow 120ms ease';
      setView({ id: g.id, from: g.index, to: g.index, dragging: true, slots: g.slots });
      paint();
    };

    // One frame of a drag: the item under the finger, the page scrolled near the screen's edges,
    // the others making room.
    const paint = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const g = gesture.current;
        if (!g || g.phase !== 'dragging') return;
        const height = window.innerHeight;
        let speed = 0;
        if (g.y < EDGE_TOP) speed = -MAX_SPEED * Math.min(1, (EDGE_TOP - g.y) / EDGE_TOP);
        else if (g.y > height - EDGE_BOTTOM) speed = MAX_SPEED * Math.min(1, (g.y - (height - EDGE_BOTTOM)) / EDGE_BOTTOM);
        if (speed) {
          const doc = page();
          const top = Math.min(doc.scrollHeight - doc.clientHeight, Math.max(g.handle ? 0 : 2, doc.scrollTop + speed));
          if (Math.abs(top - doc.scrollTop) >= 0.5) scrollTo(top);
          else speed = 0;
        }
        const dx = g.x - g.x0;
        const dy = g.y - g.y0 + (page().scrollTop - g.scroll0);
        g.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
        const me = g.slots[g.index];
        const cx = me.cx + dx;
        const cy = me.cy + dy;
        let to = g.to;
        let best = Infinity;
        g.slots.forEach((slot, i) => {
          const d = (slot.cx - cx) ** 2 + (slot.cy - cy) ** 2;
          if (d < best) { best = d; to = i; }
        });
        if (to !== g.to) {
          g.to = to;
          setView((v) => (v && v.dragging ? { ...v, to } : v));
        }
        if (speed) paint();
      });
    };

    function onPointerMove(event) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.x = event.clientX;
      g.y = event.clientY;
      const far = Math.hypot(g.x - g.x0, g.y - g.y0);
      if (g.phase === 'pressing') {
        if (far > SLOP) finish();
        return;
      }
      if (g.phase === 'lifted') {
        if (latest.current.canMove && far >= DRAG_START) startDrag(g);
        return;
      }
      paint();
    }

    function onPointerUp(event) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      const { phase, id, index, to, handle } = g;
      if (phase !== 'pressing') ignoreClickUntil.current = Date.now() + 450;
      const moved = phase === 'dragging' && to !== index;
      finish(moved);
      if (phase === 'lifted' && !handle) latest.current.onHold?.(id);
      else if (moved) latest.current.onMove?.(index, to);
    }

    function onPointerCancel(event) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      finish();
    }

    const begin = (id, index, handle) => (event) => {
      if (gesture.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.isPrimary === false) return;
      if (handle && !latest.current.canMove) return;
      const el = event.currentTarget.closest('[data-reorder-id]') || event.currentTarget;
      const g = { id, index, handle, el, pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, phase: 'pressing' };
      gesture.current = g;
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      if (handle) { lift(g); return; }
      g.timer = setTimeout(() => {
        if (gesture.current === g && g.phase === 'pressing') lift(g);
      }, HOLD_MS);
    };

    // The list's touch moves while an item is up (see the top).
    const holdTouch = (event) => {
      const g = gesture.current;
      if (g && g.phase !== 'pressing' && event.cancelable) event.preventDefault();
    };

    return { begin, finish, holdTouch };
  }, []);

  const listRef = useCallback((el) => {
    if (listEl.current) listEl.current.removeEventListener('touchmove', handlers.holdTouch);
    listEl.current = el;
    if (el) el.addEventListener('touchmove', handlers.holdTouch, { passive: false });
  }, [handlers]);

  useEffect(() => () => handlers.finish(), [handlers]);

  // Each item: hold it (pressProps), and while another is dragged, make room (shiftStyle).
  const pressProps = (id, index) => ({
    'data-reorder-id': id,
    onPointerDown: handlers.begin(id, index, false),
    onContextMenu: prevent,
    onDragStart: prevent,
  });
  const handleProps = (id, index) => ({
    onPointerDown: handlers.begin(id, index, true),
    onClick: (event) => event.stopPropagation(),
    onKeyDown: (event) => {
      const { ids: list, canMove: may, onMove: move } = latest.current;
      if (!may) return;
      const to = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? index - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? index + 1 : null;
      if (to === null) return;
      event.preventDefault();
      if (to >= 0 && to < list.length) move?.(index, to);
    },
    'data-pull-refresh-block': '',
    style: { touchAction: 'none', cursor: 'grab' },
  });
  const shiftStyle = (id, index) => {
    if (view?.settling) return { transition: 'none' };
    if (!view?.dragging || id === view.id || !view.slots) return null;
    const next = shiftedIndex(index, view.from, view.to);
    if (next === index) return { transition: 'transform 180ms ease' };
    const a = view.slots[index];
    const b = view.slots[next];
    return { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px)`, transition: 'transform 180ms ease' };
  };
  const clickIgnored = () => Date.now() < ignoreClickUntil.current;

  return { listRef, view, pressProps, handleProps, shiftStyle, clickIgnored, dragging: !!view?.dragging };
}
