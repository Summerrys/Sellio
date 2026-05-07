import React, { useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

const PULL_THRESHOLD = 70;

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (el && el.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (startYRef.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      // Resist pull — logarithmic damping
      setPullDistance(Math.min(PULL_THRESHOLD * 1.5, delta * 0.45));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
    startYRef.current = null;
  }, [pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-150"
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          <div
            className="w-8 h-8 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center"
            style={{ opacity: refreshing ? 1 : progress }}
          >
            <Loader2
              className="w-4 h-4 text-slate-500"
              style={{
                transform: `rotate(${refreshing ? 0 : progress * 360}deg)`,
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}