import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PULL_THRESHOLD = 70;
const BLOCKED = 'input, textarea, select, button, a, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="slider"], [role="dialog"], [data-pull-refresh-block], .fixed';

export function getRefreshScrollTarget(target, root, doc = document) {
  for (let el = target; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(doc.defaultView.getComputedStyle(el).overflowY)) return el;
  }
  return doc.scrollingElement || root;
}

export function isRefreshAtTop(target, root, doc = document) {
  if ((doc.scrollingElement?.scrollTop || 0) > 1) return false;
  for (let el = target; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.scrollTop > 1 && el.scrollHeight > el.clientHeight + 1 &&
        /(auto|scroll)/.test(doc.defaultView.getComputedStyle(el).overflowY)) return false;
  }
  return getRefreshScrollTarget(target, root, doc).scrollTop <= 1;
}

export default function PullToRefresh({ onRefresh, children, disabled = false }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);
  const gestureRef = useRef(null);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(false);
  const optionsRef = useRef({ onRefresh, disabled });
  optionsRef.current = { onRefresh, disabled };

  const reset = useCallback(() => {
    gestureRef.current = null;
    if (mountedRef.current) setPullDistance(0);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current || optionsRef.current.disabled) return;
    refreshingRef.current = true;
    setRefreshing(true);
    reset();
    try {
      await optionsRef.current.onRefresh();
    } catch (error) {
      toast.error(error?.message || 'Could not refresh. Please try again.');
    } finally {
      refreshingRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    }
  }, [reset]);

  useEffect(() => {
    mountedRef.current = true;
    const root = containerRef.current;
    const start = event => {
      reset();
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (optionsRef.current.disabled || refreshingRef.current || event.touches.length !== 1 || !target || !root.contains(target) || target.closest(BLOCKED)) return;
      const scrollTarget = getRefreshScrollTarget(target, root);
      if (!isRefreshAtTop(target, root)) return;
      gestureRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0, scrollTarget, target };
    };
    const move = event => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (event.touches.length !== 1 || optionsRef.current.disabled || refreshingRef.current || !isRefreshAtTop(gesture.target, root)) { reset(); return; }
      const deltaY = event.touches[0].clientY - gesture.y;
      const deltaX = Math.abs(event.touches[0].clientX - gesture.x);
      if (deltaY < 0 || (deltaX > 10 && deltaX > Math.abs(deltaY))) { reset(); return; }
      if (deltaY < 10 || deltaX > deltaY) return;
      gesture.distance = Math.min(PULL_THRESHOLD * 1.5, deltaY * 0.45);
      if (event.cancelable) event.preventDefault();
      setPullDistance(gesture.distance);
    };
    const end = () => {
      const shouldRefresh = gestureRef.current?.distance >= PULL_THRESHOLD;
      reset();
      if (shouldRefresh) void refresh();
    };
    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      mountedRef.current = false;
      gestureRef.current = null;
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', reset);
    };
  }, [refresh, reset]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  return (
    <div ref={containerRef} className="relative" aria-busy={refreshing}>
      <button type="button" onClick={() => void refresh()} disabled={refreshing || disabled}
        className="sr-only focus:not-sr-only focus:relative focus:mb-2 focus:rounded focus:border focus:p-2">
        Refresh view
      </button>
      {(pullDistance > 0 || refreshing) && (
        <div className="flex items-center justify-center overflow-hidden transition-all duration-150"
          style={{ height: refreshing ? 48 : pullDistance }} role="status" aria-label={refreshing ? 'Refreshing' : 'Pull to refresh'}>
          <div className="w-8 h-8 rounded-full bg-background shadow-md border flex items-center justify-center" style={{ opacity: refreshing ? 1 : progress }}>
            <Loader2 className={`w-4 h-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`}
              style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)` }} />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
