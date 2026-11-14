import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OFFER_PUSH_EVENT } from '@/lib/pushOffer';
import { alertsKind, alertWords, loadAlerts } from '@/lib/pushAlerts';

// Sellio's own question before the phone's or the browser's: "Get alerts for new orders" (a
// shop's people, in their workspace), "Know when your order is ready" (a signed-in buyer, after
// an order) or "Know when they reply" (after sending a chat message), with Not now and Turn on.
// Offered with offerPushAlerts (src/lib/pushOffer.js); shown in the Android app and in browsers
// that can show alerts, when it can help (shouldAsk of pushNotifications.js or webPush.js).
// Not now: asked again in 30 days; unanswered, it goes after 15 seconds and asks again in 3
// days. Turn on: the phone's or browser's own question, then it is registered for the account.
const COPY = {
  shop: { title: 'Get alerts for new orders', android: 'On this phone, even when Sellio is closed', web: 'In this browser, even when Sellio is closed' },
  order: { title: 'Know when your order is ready', android: 'Alerts on this phone from the shop', web: 'Alerts in this browser from the shop' },
  chat: { title: 'Know when they reply', android: 'Alerts on this phone, even when Sellio is closed', web: 'Alerts in this browser, even when Sellio is closed' },
};
const SHOW_MS = 15000;

export default function PushPrompt() {
  const [kind, setKind] = useState(null);
  const push = useRef(null);
  const timer = useRef(null);
  const device = alertsKind();

  useEffect(() => {
    const onOffer = async (event) => {
      const next = event?.detail?.kind;
      if (!COPY[next]) return;
      try {
        push.current = push.current || await loadAlerts(device);
        if (await push.current.shouldAsk()) setKind((current) => current || next);
      } catch {
        // no alerts on this device
      }
    };
    window.addEventListener(OFFER_PUSH_EVENT, onOffer);
    return () => window.removeEventListener(OFFER_PUSH_EVENT, onOffer);
  }, [device]);

  useEffect(() => {
    if (!kind) return undefined;
    timer.current = setTimeout(() => {
      push.current?.askLater(3);
      setKind(null);
    }, SHOW_MS);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      clearTimeout(timer.current);
      push.current?.askLater(30);
      setKind(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [kind]);

  if (!kind) return null;
  const { title } = COPY[kind];
  const detail = COPY[kind][device === 'web' ? 'web' : 'android'];
  const words = alertWords(device);

  const notNow = () => {
    clearTimeout(timer.current);
    push.current?.askLater(30);
    setKind(null);
  };
  // Straight from the click: a browser only asks while the click is still going on.
  const turnOn = async () => {
    clearTimeout(timer.current);
    setKind(null);
    const allowed = push.current ? await push.current.ask().catch(() => false) : false;
    if (allowed) {
      toast.success(words.on);
    } else if ((await push.current?.permission?.().catch(() => '')) === 'granted') {
      toast(words.failed);
    } else {
      push.current?.askLater(30);
      toast('Alerts stay off', { description: words.settings });
    }
  };

  const button = {
    minHeight: 44, padding: '10px 14px', borderRadius: 12, border: 'none', background: 'transparent',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    WebkitTapHighlightColor: 'rgba(139,47,201,0.12)',
  };

  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 0, right: 0, zIndex: 500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{`
        @keyframes sellioPushIn { from { transform: translateY(-130%); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { [data-sellio-push-prompt] { animation: none !important; } }
      `}</style>
      <div
        data-sellio-push-prompt
        role="region"
        aria-label={title}
        style={{
          pointerEvents: 'auto', width: 'calc(100% - 20px)', maxWidth: 440, padding: '14px 8px 6px 14px',
          background: 'white', borderRadius: 22, border: '1px solid rgba(15,23,42,0.06)',
          boxShadow: '0 10px 30px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06)',
          animation: 'sellioPushIn 0.22s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'white', boxShadow: '0 1px 4px rgba(15,23,42,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/branding/sellio-logo.webp" alt="" draggable={false} style={{ width: 38, height: 38, objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.25 }}>{title}</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.3 }}>{detail}</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
          <button type="button" onClick={notNow} style={{ ...button, color: '#64748b', fontWeight: 600 }}>Not now</button>
          <button type="button" onClick={turnOn} style={{ ...button, color: '#8b2fc9' }}>Turn on</button>
        </div>
      </div>
    </div>
  );
}
