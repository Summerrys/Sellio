import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { appPlatform } from '@/lib/nativeApp';

// The words PushPrompt uses when alerts stay off.
const SETTINGS_HINT = "You can turn them on later in your phone's Settings: Apps → Sellio → Notifications.";

// No notifications at all yet: what turns up here, and (in the Android app, while its
// alerts are off and Sellio may still ask) the one next step: turn on phone alerts.
export default function NotificationsEmpty() {
  const [canAsk, setCanAsk] = useState(false);

  useEffect(() => {
    if (appPlatform() !== 'android') return undefined;
    let cancelled = false;
    import('@/lib/pushNotifications')
      .then((push) => push.pushStatus())
      .then((state) => { if (!cancelled) setCanAsk(state === 'off'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const turnOn = async () => {
    setCanAsk(false);
    let push = null;
    let allowed = false;
    try {
      push = await import('@/lib/pushNotifications');
      allowed = await push.askAndroid();
    } catch { allowed = false; }
    if (allowed) {
      toast.success('Alerts are on for this phone');
    } else {
      push?.askLater?.(30);
      toast('Alerts stay off', { description: SETTINGS_HINT });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 text-center" data-testid="notifications-empty">
      <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">No notifications yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Sellio lets you know here when something needs you, like a new order.</p>
      {canAsk && (
        <Button onClick={turnOn} className="mt-4 min-h-[44px] text-white border-0" style={{ background: 'var(--color-primary-gradient)' }}>
          Turn on phone alerts
        </Button>
      )}
    </div>
  );
}
