import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { hasNativeRefresh, loadNativeRefresh } from '@/lib/nativeRefresh';

const PULL_THRESHOLD = 52;
const REFRESH_HOLD = 32;
const DRAG_SLOP = 8;
const BLOCKED = 'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="slider"], [role="dialog"], [data-pull-refresh-block], .fixed';

function getRefreshScrollTargets(target, root, doc) {
  const targets = [];
  for (let el = target; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(doc.defaultView.getComputedStyle(el).overflowY)) targets.push(el);
  }
  const page = doc.scrollingElement || root;
  if (!targets.includes(page)) targets.push(page);
  return targets;
}

export function getRefreshScrollTarget(target, root, doc = document) {
  return getRefreshScrollTargets(target, root, doc)[0];
}

export function isRefreshAtTop(target, root, doc = document) {
  return getRefreshScrollTargets(target, root, doc).every(el => el.scrollTop <= 1);
}

// Whether the finger that just landed may start a pull: one finger, on the page (not in an open
// window, a text box, a map, a slider...), with nothing under it scrolled down.
function pullMayStart(event, root, { disabled, appWide }) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (disabled || event.touches.length !== 1 || !target || !root.contains(target) || target.closest(BLOCKED)) return null;
  if (appWide && document.querySelector('[role="dialog"]:not([data-reload-ok]), [role="alertdialog"], [data-app-refresh-block="true"]')) return null;
  const scrollTargets = getRefreshScrollTargets(target, root, document);
  if (scrollTargets.some(el => el.scrollTop > 1)) return null;
  return { target, scrollTargets };
}

export default function PullToRefresh({ onRefresh, children, disabled = false, appWide = false }) {
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);
  const indicatorRef = useRef(null);
  const rotationRef = useRef(null);
  const frameRef = useRef(null);
  const distanceRef = useRef(0);
  const gestureRef = useRef(null);
  const gestureCleanupRef = useRef(null);
  const clickBlockRef = useRef(null);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(false);
  const optionsRef = useRef({ onRefresh, disabled, appWide });
  optionsRef.current = { onRefresh, disabled, appWide };
  const runningRef = useRef(null);
  // The Android app's own pull to refresh, when the app has it (lib/nativeRefresh.js).
  const [native] = useState(() => appWide && hasNativeRefresh());

  // Keep drag frames out of React and out of page layout. Only the small
  // overlay moves; fixed navigation and page content keep their positions.
  const paint = useCallback((distance, animate) => {
    if (!mountedRef.current || !indicatorRef.current) return;
    const progress = Math.min(distance / PULL_THRESHOLD, 1);
    indicatorRef.current.style.transition = animate
      ? 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease'
      : 'none';
    indicatorRef.current.style.transform = `translate3d(0, ${distance * 0.55}px, 0) scale(${0.72 + progress * 0.28})`;
    indicatorRef.current.style.opacity = String(Math.min(distance / 12, 1));
    rotationRef.current.style.transform = `rotate(${progress * 300}deg)`;
  }, []);

  const settle = useCallback(distance => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    distanceRef.current = distance;
    paint(distance, true);
  }, [paint]);

  const track = useCallback(distance => {
    distanceRef.current = distance;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint(distanceRef.current, false);
    });
  }, [paint]);

  const clearGesture = useCallback(() => {
    gestureRef.current = null;
    gestureCleanupRef.current?.();
    gestureCleanupRef.current = null;
    if (clickBlockRef.current?.until === Infinity) clickBlockRef.current.until = Date.now() + 350;
  }, []);

  const reset = useCallback(() => {
    clearGesture();
    settle(refreshingRef.current ? REFRESH_HOLD : 0);
  }, [clearGesture, settle]);

  // One refresh at a time: a second ask while one runs gets that one (and starts nothing).
  const refresh = useCallback(() => {
    if (refreshingRef.current) return runningRef.current;
    if (optionsRef.current.disabled || !mountedRef.current) return Promise.resolve();
    refreshingRef.current = true;
    console.info('Sellio refresh: refreshing');
    clearGesture();
    settle(REFRESH_HOLD);
    setRefreshing(true);
    runningRef.current = (async () => {
      try {
        await optionsRef.current.onRefresh();
      } catch (error) {
        toast.error(error?.message || 'Could not refresh. Please try again.');
      } finally {
        refreshingRef.current = false;
        runningRef.current = null;
        if (mountedRef.current) {
          settle(0);
          setRefreshing(false);
        }
      }
    })();
    return runningRef.current;
  }, [clearGesture, settle]);

  useEffect(() => {
    mountedRef.current = true;
    const root = containerRef.current;
    if (native) {
      // Android's own pull (SellioRefreshLayout). At each touch the app is told whether this
      // finger may start a pull, by the same rules as the page's own pull below; until it has
      // been told, the finger can't. The app says when a pull was let go, and is told when the
      // refresh is done so its circle goes.
      let alive = true;
      let plugin = null;
      let listener = null;
      console.info("Sellio refresh: Android's own pull to refresh");
      loadNativeRefresh().then(async ({ plugin: loaded }) => {
        if (!alive) return;
        plugin = loaded;
        const handle = await loaded.addListener('refresh', () => {
          void Promise.resolve(refresh()).finally(() => plugin?.finish().catch(() => {}));
        });
        if (alive) listener = handle;
        else void handle.remove();
      }).catch(error => console.warn('Sellio refresh: no pull to refresh', error?.message || error));
      const answer = event => {
        const touch = event.changedTouches?.[0];
        if (!plugin || !touch) return;
        const allowed = !refreshingRef.current && !!pullMayStart(event, root, optionsRef.current);
        // In the app's pixels (the web view fills the app's screen; page zoom is off).
        const scale = window.devicePixelRatio || 1;
        void plugin.touch({ allowed, x: touch.clientX * scale, y: touch.clientY * scale }).catch(() => {});
      };
      document.addEventListener('touchstart', answer, { capture: true, passive: true });
      return () => {
        alive = false;
        mountedRef.current = false;
        document.removeEventListener('touchstart', answer, true);
        void listener?.remove();
      };
    }
    // Chrome, and the Android app's web view, decide when a finger touches down whether its
    // moves can be stopped from scrolling the page: only if a listener that can stop them is
    // already in place. One added as the touch starts comes too late for that touch, so a
    // pull would never be followed. The blocking move listener is therefore in place while
    // the page is at its top, where a pull can start; scrolled down, the page scrolls without
    // waiting for it.
    let listeningForMoves = false;
    const listenForMoves = on => {
      if (on === listeningForMoves) return;
      listeningForMoves = on;
      if (on) root.addEventListener('touchmove', move, { passive: false, capture: true });
      else root.removeEventListener('touchmove', move, true);
    };
    const pageAtTop = () => (document.scrollingElement || document.documentElement).scrollTop <= 1;
    const onScroll = () => listenForMoves(pageAtTop() || !!gestureRef.current);
    const start = event => {
      // A new finger contact is a new tap, not the previous drag's click.
      clickBlockRef.current = null;
      if (refreshingRef.current) return;
      reset();
      const may = pullMayStart(event, root, optionsRef.current);
      if (!may) return;
      gestureRef.current = {
        x: event.touches[0].clientX, y: event.touches[0].clientY,
        distance: 0, dragging: false, scrollTargets: may.scrollTargets, target: may.target,
      };
      listenForMoves(true); // normally already there (see listenForMoves)
      root.addEventListener('touchend', end, { passive: true, capture: true });
      root.addEventListener('touchcancel', reset, { passive: true, capture: true });
      gestureCleanupRef.current = () => {
        root.removeEventListener('touchend', end, true);
        root.removeEventListener('touchcancel', reset, true);
        listenForMoves(pageAtTop());
      };
    };
    const move = event => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (event.touches.length !== 1 || optionsRef.current.disabled || refreshingRef.current ||
          gesture.scrollTargets.some(el => el.scrollTop > 1)) { reset(); return; }
      const deltaY = event.touches[0].clientY - gesture.y;
      const deltaX = Math.abs(event.touches[0].clientX - gesture.x);
      if (!gesture.dragging) {
        if (deltaY < 0 || (deltaX > DRAG_SLOP && deltaX > Math.abs(deltaY))) { reset(); return; }
        if (deltaY < DRAG_SLOP || deltaY <= deltaX * 1.15) return;
      }
      if (!event.cancelable) {
        // The browser is scrolling with this touch (or hasn't let the page hold it yet: a
        // phone's own small "touch slop" can be wider than DRAG_SLOP). Before the pull has
        // started, wait for a move that can be held; once pulling, the browser took over.
        if (!gesture.warned) {
          gesture.warned = true;
          console.info('Sellio refresh: the page scrolled instead (this touch could not be held)');
        }
        if (gesture.dragging) reset();
        return;
      }
      event.preventDefault();
      gesture.dragging = true;
      clickBlockRef.current = { target: gesture.target, until: Infinity };
      // Direct tracking until the release threshold, then increasing
      // resistance. The threshold uses CSS pixels on phones and tablets.
      const distance = Math.max(0, deltaY - DRAG_SLOP);
      gesture.distance = Math.min(PULL_THRESHOLD * 1.75,
        distance <= PULL_THRESHOLD ? distance : PULL_THRESHOLD + (distance - PULL_THRESHOLD) * 0.35);
      track(gesture.distance);
    };
    const end = () => {
      const shouldRefresh = gestureRef.current?.distance >= PULL_THRESHOLD;
      clearGesture();
      if (shouldRefresh) void refresh();
      else settle(refreshingRef.current ? REFRESH_HOLD : 0);
    };
    const click = event => {
      const block = clickBlockRef.current;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      // Suppress only the synthetic click from a drag. Keyboard activation
      // (detail === 0) and taps on other controls remain available.
      if (event.detail === 0 || !block || Date.now() > block.until || !target) return;
      if (block.target.contains(target) || target.contains(block.target)) {
        clickBlockRef.current = null;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('click', click, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    listenForMoves(pageAtTop());
    return () => {
      mountedRef.current = false;
      clearGesture();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      root.removeEventListener('touchstart', start);
      root.removeEventListener('click', click, true);
      window.removeEventListener('scroll', onScroll);
      listenForMoves(false);
    };
  }, [clearGesture, native, refresh, reset, settle, track]);

  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  return (
    <div ref={containerRef} className={`sellio-pull-refresh relative${appWide ? ' sellio-pull-refresh--app' : ''}`} aria-busy={refreshing}>
      <style>{`
        .sellio-pull-refresh {
          min-height: calc(100svh - 176px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
        }
        @media (max-width: 639px) {
          .sellio-pull-refresh {
            min-height: calc(100svh - 144px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          }
        }
        .sellio-pull-refresh--app { min-height: 100svh; }
        .sellio-pull-refresh--app > .sellio-pull-refresh-indicator {
          position: fixed;
          top: calc(56px + env(safe-area-inset-top, 0px));
          z-index: 180;
        }
        @media (min-width: 1024px) {
          .sellio-pull-refresh--app > .sellio-pull-refresh-indicator { top: 64px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sellio-pull-refresh-indicator { transition: none !important; }
        }
      `}</style>
      <button type="button" onClick={() => void refresh()} disabled={refreshing || disabled}
        className="sr-only focus:not-sr-only focus:relative focus:mb-2 focus:rounded focus:border focus:p-2">
        Refresh view
      </button>
      {!native && (
        <div ref={indicatorRef} aria-hidden="true"
          className="sellio-pull-refresh-indicator pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-center"
          style={{ transform: 'translate3d(0, 0, 0) scale(0.72)', transformOrigin: 'center top', opacity: 0, willChange: 'transform, opacity' }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md"
            style={{ color: 'rgb(var(--color-primary, 59 130 246))', borderColor: 'rgb(var(--color-primary, 59 130 246) / 0.2)' }}>
            <div ref={rotationRef}>
              <Loader2 className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            </div>
          </div>
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">{refreshing ? 'Refreshing' : ''}</span>
      {children}
    </div>
  );
}

