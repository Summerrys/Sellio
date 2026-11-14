import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { alertsKind, alertWords, loadAlerts } from '@/lib/pushAlerts';

// No notifications at all yet: what turns up here, and (in the Android app or a browser that
// can show alerts, while they're off and Sellio may still ask) the one next step: turn them on.
export default function NotificationsEmpty() {
  const [canAsk, setCanAsk] = useState(false);
  const push = useRef(null);
  const device = alertsKind();
  const words = alertWords(device);

  useEffect(() => {
    if (!device) return undefined;
    let cancelled = false;
    loadAlerts(device)
      .then((module) => { push.current = module; return module.pushStatus(); })
      .then((state) => { if (!cancelled) setCanAsk(state === 'off'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [device]);

  // Straight from the click (the module is loaded already): a browser only asks during one.
  const turnOn = async () => {
    setCanAsk(false);
    let allowed = false;
    try {
      allowed = await push.current.ask();
    } catch { allowed = false; }
    if (allowed) {
      toast.success(words.on);
    } else {
      push.current?.askLater?.(30);
      toast('Alerts stay off', { description: words.settings });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 text-center" data-testid="notifications-empty">
      <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">No notifications yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Sellio lets you know here when something needs you, like a new order.</p>
      {canAsk && (
        <Button onClick={turnOn} className="mt-4 min-h-[44px] text-white border-0" style={{ background: 'var(--color-primary-gradient)' }}>
          {words.button}
        </Button>
      )}
    </div>
  );
}
