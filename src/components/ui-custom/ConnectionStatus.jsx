import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useOnline } from '@/lib/network';

const BACK_MS = 2500; // "Back online" shows this long

// While the phone is offline, a small pill above the bottom bar on every page: "You're
// offline. Reconnecting…". When the connection comes back, "Back online" for a moment
// (pages refresh themselves then: AppRefreshProvider, React Query). Taps pass through it.
export default function ConnectionStatus() {
  const online = useOnline();
  const [back, setBack] = useState(false);
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBack(false);
      return undefined;
    }
    if (!wasOffline.current) return undefined;
    wasOffline.current = false;
    setBack(true);
    const timer = setTimeout(() => setBack(false), BACK_MS);
    return () => clearTimeout(timer);
  }, [online]);

  if (online && !back) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-status"
      data-state={online ? 'back' : 'offline'}
      className="pointer-events-none fixed left-1/2 z-[35] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg"
      style={{ bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', background: online ? '#047857' : '#0f172a', boxShadow: '0 8px 20px -8px rgba(15,23,42,.5)' }}
    >
      {online ? (
        <><Check className="h-4 w-4" aria-hidden="true" /> Back online</>
      ) : (
        <>
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" aria-hidden="true" />
          You’re offline. Reconnecting…
        </>
      )}
    </div>
  );
}
