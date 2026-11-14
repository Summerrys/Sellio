import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { alertsKind, alertWords, loadAlerts } from '@/lib/pushAlerts';
import { canOpenAppSettings, openAppSettings } from '@/lib/appSettings';
import { useAppText } from '@/lib/appText';

// No notifications at all yet: what turns up here, and (in the Android app or a browser that
// can show alerts, while they're off and Sellio may still ask) the one next step: turn them on.
// In Sellio's app, when the phone has them off for Sellio, Open Settings instead (UX state 7,
// 14 Nov 2026), checked again when Sellio comes back from Settings.
export default function NotificationsEmpty() {
  const { t } = useAppText();
  const [canAsk, setCanAsk] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const push = useRef(null);
  const device = alertsKind();
  const words = alertWords(device);

  useEffect(() => {
    if (!device) return undefined;
    let cancelled = false;
    const check = () => loadAlerts(device)
      .then((module) => { push.current = module; return module.pushStatus(); })
      .then((state) => {
        if (cancelled) return;
        setCanAsk(state === 'off');
        setBlocked(state === 'blocked' && device === 'android' && canOpenAppSettings());
      })
      .catch(() => {});
    const again = () => { if (document.visibilityState === 'visible') check(); };
    check();
    document.addEventListener('visibilitychange', again);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', again); };
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
      {blocked && (
        <>
          <p className="mt-3 text-sm text-foreground" data-testid="alerts-blocked">{t('Phone alerts are off for Sellio, so new orders won’t ring on this phone.')}</p>
          <Button onClick={() => openAppSettings()} className="mt-3 min-h-[44px] text-white border-0" style={{ background: 'var(--color-primary-gradient)' }}>
            {t('Open Settings')}
          </Button>
        </>
      )}
    </div>
  );
}
