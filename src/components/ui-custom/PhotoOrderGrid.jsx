import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { moveItem, nearestPlace } from '@/lib/photoOrder';

// A product's photos in order; the first is the cover (Alvin, 16 Nov 2026).
// Press and hold a photo until it lifts, then drag it: the other photos shift along to show
// where it will go, and it goes there when let go ("Others shift along"). A quick tap opens
// it (onTap). A finger that moves before the hold is a scroll, as before. With a mouse,
// pressing and dragging is enough. With a keyboard: Enter opens a photo, the arrow keys move
// it one place.
// Used by the Add/Edit product window (products/AIProductAssistant.jsx) and sign-up Step 3
// (onboarding/Step3MenuSetup.jsx, onboarding/EditItemModal.jsx).
//
// count: how many photos. keyOf(i): something unique to photo i (its address). renderTile(i,
// { isCover }): what's inside photo i's tile (its <img>, the Cover band, its own buttons, which
// don't start a drag). tileClassName / tileStyle (i, { isCover }), tileLabel(i, place): the
// tile itself. onMove(from, to): photo `from` goes to place `to`. trailing: after the photos
// (the + tile). disabled: nothing moves (while a photo is uploading into its place).
export const HOLD_MS = 350;
const SLOP = 8; // px a finger may wander while holding; more is a scroll
const MOUSE_DRAG = 6; // px a pressed mouse moves to start dragging
const LIFTED = 'scale(1.08) rotate(-2deg)';

export default function PhotoOrderGrid({
  count, keyOf, renderTile, tileClassName, tileStyle, tileLabel, onMove, onTap,
  trailing = null, disabled = false, className, testId,
}) {
  const gridRef = useRef(null);
  const ghostRef = useRef(null);
  const tiles = useRef(new Map()); // key -> tile element
  const press = useRef(null);
  const drag = useRef(null);
  const slideFrom = useRef(null); // key -> where each tile was, to slide it to its new place
  const focusKey = useRef(null);
  const noTap = useRef(false); // the click that ends a drag isn't a tap
  const [preview, setPreview] = useState(null); // the order shown while a photo is lifted
  const [lifted, setLifted] = useState(null); // { key, left, top, width, height }
  const [pressing, setPressing] = useState(null); // key of the photo being held

  // A key for each photo, unique even when the same photo is in twice.
  const keys = [];
  const seen = new Map();
  for (let i = 0; i < count; i++) {
    const base = String(keyOf(i));
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    keys.push(n ? `${base}#${n}` : base);
  }
  const latest = useRef({});
  latest.current = { keys, count, onMove, onTap, disabled };
  const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const order = preview && preview.length === count ? preview : [...Array(count).keys()];

  const measure = () => new Map([...tiles.current].map(([key, el]) => [key, el.getBoundingClientRect()]));
  const settle = () => { gridRef.current?.getAnimations?.({ subtree: true }).forEach((a) => a.finish()); };

  // Window listeners for the pointer that's down (capture: nothing on the page can stop them).
  const listeners = useRef(null);
  if (!listeners.current) {
    const onPointerMove = (event) => {
      const d = drag.current;
      if (d) { if (event.pointerId === d.pointerId) follow(event.clientX, event.clientY); return; }
      const p = press.current;
      if (!p || event.pointerId !== p.pointerId) return;
      const moved = Math.hypot(event.clientX - p.x, event.clientY - p.y);
      p.lastX = event.clientX; p.lastY = event.clientY;
      if (p.mouse) { if (moved > MOUSE_DRAG) lift(); } else if (moved > SLOP) endPress();
    };
    const onPointerUp = (event) => {
      if (drag.current && event.pointerId === drag.current.pointerId) drop(true);
      else if (press.current && event.pointerId === press.current.pointerId) endPress();
    };
    const onPointerCancel = (event) => {
      if (drag.current && event.pointerId === drag.current.pointerId) drop(false);
      else if (press.current && event.pointerId === press.current.pointerId) endPress();
    };
    listeners.current = { onPointerMove, onPointerUp, onPointerCancel };
  }
  const listen = (on) => {
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn.call(window, 'pointermove', listeners.current.onPointerMove, true);
    fn.call(window, 'pointerup', listeners.current.onPointerUp, true);
    fn.call(window, 'pointercancel', listeners.current.onPointerCancel, true);
  };

  function endPress() {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    press.current = null;
    setPressing(null);
    if (!drag.current) listen(false);
  }

  function lift() {
    const p = press.current;
    const grid = gridRef.current;
    if (!p || !grid || latest.current.disabled) { endPress(); return; }
    clearTimeout(p.timer);
    press.current = null;
    setPressing(null);
    settle();
    const { keys: now, count: n } = latest.current;
    const g = grid.getBoundingClientRect();
    const places = now.map((key) => {
      const r = tiles.current.get(key)?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    });
    const r = p.tile.getBoundingClientRect();
    drag.current = { key: p.key, pointerId: p.pointerId, grabX: p.lastX - r.left, grabY: p.lastY - r.top, places, order: [...Array(n).keys()], index: now.indexOf(p.key) };
    noTap.current = true;
    setLifted({ key: p.key, left: r.left, top: r.top, width: r.width, height: r.height });
    setPreview(drag.current.order);
    try { navigator.vibrate?.(10); } catch { /* not on this phone */ }
  }

  function follow(x, y) {
    const d = drag.current;
    const grid = gridRef.current;
    if (!d || !grid) return;
    if (ghostRef.current) {
      ghostRef.current.style.left = `${x - d.grabX}px`;
      ghostRef.current.style.top = `${y - d.grabY}px`;
    }
    const g = grid.getBoundingClientRect();
    const place = nearestPlace(d.places, x - g.left, y - g.top, (d.places[0]?.w || 0) * 1.25);
    const from = d.order.indexOf(d.index);
    if (place < 0 || place === from) return;
    slideFrom.current = measure();
    d.order = moveItem(d.order, from, place);
    setPreview(d.order);
  }

  function drop(keep) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    listen(false);
    // The click a mouse makes when let go isn't a tap on whatever is under it (a window's
    // backdrop would close the window).
    const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 300);
    settle();
    const from = d.index;
    const to = keep ? d.order.indexOf(d.index) : from;
    const land = tiles.current.get(d.key)?.getBoundingClientRect();
    slideFrom.current = measure();
    if (to !== from && to >= 0) latest.current.onMove?.(from, to);
    setPreview(null);
    const ghost = ghostRef.current;
    const done = () => setLifted(null);
    if (!ghost || !land || reduceMotion() || !ghost.animate) { done(); return; }
    const at = ghost.getBoundingClientRect();
    // Back to its size first (the ghost is drawn bigger), then onto the place it's going.
    const dx = land.left - at.left - (at.width - land.width) / 2;
    const dy = land.top - at.top - (at.height - land.height) / 2;
    const flight = ghost.animate(
      [{ transform: LIFTED }, { transform: `translate(${dx}px, ${dy}px)` }],
      { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
    flight.onfinish = done;
    flight.oncancel = done;
  }

  // The other photos slide to their new places (when a photo moves, by drag or by keyboard).
  useLayoutEffect(() => {
    const before = slideFrom.current;
    slideFrom.current = null;
    if (focusKey.current) {
      tiles.current.get(focusKey.current)?.focus();
      focusKey.current = null;
    }
    if (!before || reduceMotion()) return;
    tiles.current.forEach((el, key) => {
      const was = before.get(key);
      if (!was || !el.animate) return;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left, dy = was.top - now.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  });

  // While a photo is lifted the page doesn't scroll under the finger. This is on the grid from
  // the start: a phone only lets a touch be held still when the listener was there when it began.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const hold = (event) => { if (drag.current && event.cancelable) event.preventDefault(); };
    grid.addEventListener('touchmove', hold, { passive: false });
    return () => grid.removeEventListener('touchmove', hold);
  }, []);

  // Photos added or taken away while one is held or lifted: it goes back, nothing moves.
  useEffect(() => {
    if (drag.current && drag.current.order.length !== count) drop(false);
    else if (press.current) endPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => () => {
    clearTimeout(press.current?.timer);
    press.current = null;
    drag.current = null;
    listen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPress = (event, key) => {
    noTap.current = false;
    if (latest.current.disabled || drag.current || press.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const tile = event.currentTarget;
    const own = event.target.closest?.('button, a, input, select, textarea, label');
    if (own && own !== tile && tile.contains(own)) return; // the photo's own buttons (delete)
    press.current = {
      key, tile, pointerId: event.pointerId, mouse: event.pointerType === 'mouse',
      x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
    };
    press.current.timer = setTimeout(lift, HOLD_MS);
    setPressing(key);
    listen(true);
  };

  const onKeyDown = (event, index, place) => {
    if (event.target !== event.currentTarget) return; // a key on the photo's own button
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      latest.current.onTap?.(index);
      return;
    }
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step || latest.current.disabled) return;
    event.preventDefault();
    const to = Math.max(0, Math.min(count - 1, place + step));
    if (to === place) return;
    slideFrom.current = measure();
    focusKey.current = keys[index];
    latest.current.onMove?.(index, to);
  };

  const liftedIndex = lifted ? keys.indexOf(lifted.key) : -1;
  const liftedPlace = liftedIndex >= 0 ? order.indexOf(liftedIndex) : -1;

  return (
    <div
      ref={gridRef}
      className={className}
      data-testid={testId}
      data-pull-refresh-block=""
      onContextMenu={(event) => { if (event.target.closest?.('[data-photo-tile]')) event.preventDefault(); }}
    >
      {order.map((index, place) => {
        const key = keys[index];
        const isCover = place === 0;
        const isLifted = lifted?.key === key;
        return (
          <div
            key={key}
            ref={(el) => { if (el) tiles.current.set(key, el); else tiles.current.delete(key); }}
            data-photo-tile={index}
            data-lifted={isLifted ? 'true' : undefined}
            role="button"
            tabIndex={0}
            aria-label={tileLabel?.(index, place)}
            aria-keyshortcuts="ArrowLeft ArrowRight"
            className={cn(tileClassName?.(index, { isCover }), '[&_img]:pointer-events-none [&_img]:select-none [&_img]:[-webkit-user-drag:none]')}
            style={{
              ...tileStyle?.(index, { isCover }),
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              touchAction: 'manipulation',
              cursor: disabled ? undefined : 'grab',
              transition: 'transform .3s ease',
              transform: pressing === key ? 'scale(0.95)' : undefined,
              ...(isLifted ? { borderStyle: 'dashed', borderColor: '#94a3b8', background: '#f8fafc' } : null),
            }}
            onPointerDown={(event) => startPress(event, key)}
            onClick={() => {
              if (noTap.current) { noTap.current = false; return; }
              latest.current.onTap?.(index);
            }}
            onKeyDown={(event) => onKeyDown(event, index, place)}
          >
            {isLifted ? null : renderTile(index, { isCover })}
          </div>
        );
      })}
      {trailing}
      {lifted && liftedIndex >= 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={ghostRef}
          aria-hidden="true"
          data-photo-ghost=""
          className={cn(tileClassName?.(liftedIndex, { isCover: liftedPlace === 0 }), '[&_img]:pointer-events-none')}
          style={{
            ...tileStyle?.(liftedIndex, { isCover: liftedPlace === 0 }),
            position: 'fixed',
            left: lifted.left,
            top: lifted.top,
            width: lifted.width,
            height: lifted.height,
            margin: 0,
            zIndex: 10000,
            pointerEvents: 'none',
            transform: reduceMotion() ? undefined : LIFTED,
            boxShadow: '0 16px 30px rgba(15,23,42,.28), 0 2px 6px rgba(15,23,42,.18)',
          }}
        >
          {renderTile(liftedIndex, { isCover: liftedPlace === 0 })}
        </div>,
        document.body,
      )}
    </div>
  );
}
