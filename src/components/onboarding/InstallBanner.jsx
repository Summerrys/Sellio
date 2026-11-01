import React, { useEffect, useRef, useState } from 'react';
import InstallPWAModal from './InstallPWAModal';
import { isAndroid, isIOS, hasNativePrompt, promptInstall, openInAppLink } from '@/lib/pwaInstall';

// How long it stays before it goes by itself (as the browser's own install banner does).
const SHOW_MS = 10000;
// How far a finger moves it, up or to either side, to send it away.
const SWIPE_UP_PX = 28;
const SWIPE_SIDE_PX = 80;
const LEAVE_MS = 180;

// "Install Sellio": a small banner at the top of the screen that only asks, like the
// browser's own install banner: Sellio's icon, its name and Install. It doesn't block the
// page, and goes by itself after 10 seconds, or with a swipe up or to the side (or Esc).
// Install: a browser that can install Sellio itself (Chrome on Android, Chrome or Edge on a
// computer) asks with its own install; elsewhere (Safari on an iPhone or iPad, or before
// Chrome offers it) it shows the steps to add Sellio to the home screen (InstallPWAModal).
// kind 'open': the browser says Sellio is installed already, so it offers "Open in app",
// which opens this page in the installed app (openInAppLink).
export default function InstallBanner({ open, kind = 'install', onClose }) {
  const [leaving, setLeaving] = useState(null); // null | 'up' | 'left' | 'right'
  const [steps, setSteps] = useState(false);
  const [drag, setDrag] = useState(null);       // { x, y } while a finger moves it
  const start = useRef(null);
  const showTimer = useRef(null);
  const leaveTimer = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const phone = isAndroid() || isIOS();
  const opening = kind === 'open';
  const title = opening ? 'Sellio is installed' : 'Install Sellio';
  const where = opening
    ? (phone ? 'On this phone' : 'On this computer')
    : (phone ? 'Add it to your Home Screen' : (typeof window !== 'undefined' ? window.location.host : ''));

  const leave = (way = 'up') => {
    clearTimeout(showTimer.current);
    clearTimeout(leaveTimer.current);
    setDrag(null);
    setLeaving(way);
    leaveTimer.current = setTimeout(() => closeRef.current(), LEAVE_MS);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const goSoon = () => {
    clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => leaveRef.current('up'), SHOW_MS);
  };

  // Each time it's offered: in from the top, and away by itself after a while.
  useEffect(() => {
    if (!open) return undefined;
    setLeaving(null);
    setSteps(false);
    setDrag(null);
    showTimer.current = setTimeout(() => leaveRef.current('up'), SHOW_MS);
    const onKey = (e) => { if (e.key === 'Escape') leaveRef.current('up'); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(showTimer.current);
      clearTimeout(leaveTimer.current);
    };
  }, [open]);

  if (!open) return null;

  if (steps) {
    return <InstallPWAModal open onClose={() => { setSteps(false); closeRef.current(); }} />;
  }

  const install = async () => {
    clearTimeout(showTimer.current);
    if (hasNativePrompt()) {
      await promptInstall();
      leave('up');
      return;
    }
    setSteps(true);
  };

  // A finger on the banner holds it; moved up or to the side, it goes.
  const onPointerDown = (e) => {
    start.current = { x: e.clientX, y: e.clientY };
    clearTimeout(showTimer.current);
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: Math.min(0, e.clientY - start.current.y) });
  };
  const onPointerEnd = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (e.type !== 'pointercancel' && dy <= -SWIPE_UP_PX && Math.abs(dy) >= Math.abs(dx)) leave('up');
    else if (e.type !== 'pointercancel' && Math.abs(dx) >= SWIPE_SIDE_PX) leave(dx < 0 ? 'left' : 'right');
    else { setDrag(null); goSoon(); }
  };

  const away = leaving === 'up' ? 'translateY(-130%)' : leaving === 'left' ? 'translateX(-110%)' : leaving === 'right' ? 'translateX(110%)' : null;
  const transform = away || (drag ? `translate(${drag.x}px, ${drag.y}px)` : 'none');
  const opacity = leaving ? 0 : drag ? Math.max(0.35, 1 - (Math.abs(drag.x) / 240) - (Math.abs(drag.y) / 120)) : 1;

  const button = {
    flexShrink: 0, minHeight: 44, padding: '10px 14px', borderRadius: 12, border: 'none', background: 'transparent',
    color: '#8b2fc9', fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', WebkitTapHighlightColor: 'rgba(139,47,201,0.12)',
  };

  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 0, right: 0, zIndex: 500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{`
        @keyframes sellioInstallIn { from { transform: translateY(-130%); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { [data-sellio-install-banner] { animation: none !important; transition: none !important; } }
      `}</style>
      <div
        data-sellio-install-banner
        role="region"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        style={{
          pointerEvents: 'auto', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
          width: 'calc(100% - 20px)', maxWidth: 440,
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 8px 12px 14px',
          background: 'white', borderRadius: 22, border: '1px solid rgba(15,23,42,0.06)',
          boxShadow: '0 10px 30px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06)',
          animation: 'sellioInstallIn 0.22s ease-out',
          transform, opacity,
          transition: drag && !leaving ? 'none' : `transform ${LEAVE_MS}ms ease-in, opacity ${LEAVE_MS}ms ease-in`,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'white', boxShadow: '0 1px 4px rgba(15,23,42,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/branding/sellio-logo.webp" alt="" draggable={false} style={{ width: 42, height: 42, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{where}</p>
        </div>
        {opening ? (
          <a {...openInAppLink()} onClick={() => leave('up')} style={button}>Open in app</a>
        ) : (
          <button type="button" onClick={install} style={button}>Install</button>
        )}
      </div>
    </div>
  );
}
