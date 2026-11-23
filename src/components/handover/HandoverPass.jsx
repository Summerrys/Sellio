import React, { useEffect, useRef, useState } from 'react';
import { fetchMyHandover, handoverLink, spacedPin } from '@/lib/handover';

// The buyer's handover QR for a home seller's order (lib/handover.js), straight from the server:
// the QR the seller scans, the 6-digit code to read out if their camera can't read it, and what
// it's for. While it's on screen it asks the server every few seconds, so the moment the seller
// scans it the QR clears and "Collected ✓" / "Delivered ✓" shows with the time. Inline styles: it
// shows on the store page (no app styles there) as well as in My purchases.
// words (in the screen's own language): { title, hint, codeLabel, done, verifiedQr, verifiedPin,
// when(iso) → text }. onNone: the order has no QR this account can see (placed signed out).
const ASK_EVERY_MS = 4000;

export default function HandoverPass({ orderId, words, size = 200, testId = 'handover-pass', onHandedOver, onNone }) {
  const [answer, setAnswer] = useState(null);
  const [src, setSrc] = useState('');
  const onHandedOverRef = useRef(onHandedOver);
  onHandedOverRef.current = onHandedOver;
  const onNoneRef = useRef(onNone);
  onNoneRef.current = onNone;

  useEffect(() => {
    let live = true;
    let timer = null;
    let wasOpen = false;
    const ask = async () => {
      let next = null;
      try {
        next = await fetchMyHandover(orderId);
      } catch {
        // Offline for a moment: keep what's shown and ask again.
        if (live) timer = setTimeout(tick, ASK_EVERY_MS * 2);
        return;
      }
      if (!live) return;
      setAnswer(next || { none: true });
      if (!next) onNoneRef.current?.();
      if (next?.token) {
        wasOpen = true;
        timer = setTimeout(tick, ASK_EVERY_MS);
      } else if (wasOpen && next?.verified_at) {
        onHandedOverRef.current?.(next);
      }
    };
    // Not while the screen is in the background (the phone locked, another app in front).
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { timer = setTimeout(tick, ASK_EVERY_MS); return; }
      ask();
    };
    ask();
    return () => { live = false; clearTimeout(timer); };
  }, [orderId]);

  const token = answer?.token || null;
  useEffect(() => {
    let live = true;
    if (!token) { setSrc(''); return undefined; }
    // The QR drawer loads only when a QR is shown (the store page stays light).
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(handoverLink(token), {
        width: 480, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' },
      }))
      .then((url) => { if (live) setSrc(url); })
      .catch(() => { if (live) setSrc(''); });
    return () => { live = false; };
  }, [token]);

  if (answer?.verified_at) {
    return (
      <div data-testid={`${testId}-done`} style={{ textAlign: 'center', padding: '6px 0' }}>
        <div aria-hidden="true" style={{ width: 52, height: 52, margin: '0 auto 8px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>✓</div>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{words.done}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#475569' }}>
          {answer.verified_via === 'pin' ? words.verifiedPin : words.verifiedQr} · {words.when(answer.verified_at)}
        </p>
      </div>
    );
  }
  if (!token || !answer?.pin) return null;
  return (
    <div data-testid={testId} style={{ textAlign: 'center' }}>
      {words.title && <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{words.title}</p>}
      <p style={{ margin: '0 auto 10px', maxWidth: 300, fontSize: 12.5, lineHeight: 1.5, color: '#64748b' }}>{words.hint}</p>
      <div style={{ width: size, height: size, margin: '0 auto', background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 6, boxSizing: 'border-box' }}>
        {src && <img src={src} alt={words.title || 'QR'} data-testid={`${testId}-qr`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{words.codeLabel}</p>
      <p data-testid={`${testId}-pin`} style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums' }}>
        {spacedPin(answer.pin)}
      </p>
    </div>
  );
}
