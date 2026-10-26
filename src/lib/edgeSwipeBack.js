// Swipe back from the left edge on an iPhone / iPad where Sellio was added to the Home
// Screen. iOS gives Home Screen web apps no back gesture (Safari has its own; Android's
// back button and gesture already go through the browser), so there we add one: a swipe
// that starts at the very left edge and moves right does exactly what the phone's Back
// does elsewhere (close the open window, step back, then the previous page).
// An arrow follows the finger so the person can see it will go back, and can drag back
// to cancel.

const EDGE = 24;          // px from the left edge where the swipe must start
const TRIGGER = 72;       // px moved right to go back on release
const FLICK = 40;         // ...or this far, quickly
const FLICK_SPEED = 0.6;  // px per ms
const DECIDE = 10;        // px of movement before deciding sideways vs scrolling

export function isHomeScreenApple(win = window) {
  const nav = win.navigator || {};
  const apple = /iPhone|iPad|iPod/.test(nav.userAgent || '') ||
    (/Macintosh/.test(nav.userAgent || '') && (nav.maxTouchPoints || 0) > 1); // iPadOS
  const homeScreen = nav.standalone === true || !!win.matchMedia?.('(display-mode: standalone)')?.matches;
  return apple && homeScreen;
}

// Somewhere for Back to go: an open window / step to close, or an earlier page (the
// browser's own history, which an app update or a reload doesn't reset).
function canGoBack(win) {
  return !!win.history.state?.sellioOverlay || win.history.length > 1;
}

// Fields keep their own touch handling (moving the cursor, selecting text), and an area
// can opt out with data-no-edge-swipe. A row scrolled sideways away from its start is
// being scrolled back, not swiped back.
function ignoreTarget(target) {
  for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
    if (el.matches?.('input, textarea, select, [contenteditable="true"], [data-no-edge-swipe]')) return true;
    if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

function makeArrow(doc) {
  const arrow = doc.createElement('div');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.dataset.edgeSwipeArrow = '';
  Object.assign(arrow.style, {
    position: 'fixed', left: '0', top: '0', width: '40px', height: '40px', borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.82)', color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: '2147483646', pointerEvents: 'none', opacity: '0',
    transform: 'translate(-44px, 0)', transition: 'opacity 120ms ease', willChange: 'transform, opacity',
  });
  arrow.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  return arrow;
}

// Installs the gesture when running from the Home Screen on an iPhone / iPad (force: on
// anyway, for tests). Returns a function that removes it, or null when not installed.
export function installEdgeSwipeBack({ win = window, force = false } = {}) {
  if (!win || (!force && !isHomeScreenApple(win))) return null;
  const doc = win.document;
  let arrow = null;
  let swipe = null; // { x, y, t, sideways }

  const showArrow = (dx, y) => {
    if (!arrow) { arrow = makeArrow(doc); doc.body.appendChild(arrow); }
    const progress = Math.min(1, Math.max(0, dx / TRIGGER));
    const top = Math.min(Math.max(y - 20, 60), win.innerHeight - 100);
    arrow.style.top = `${top}px`;
    arrow.style.opacity = String(0.35 + 0.65 * progress);
    arrow.style.transform = `translate(${-44 + 56 * progress}px, 0) scale(${0.8 + 0.2 * progress})`;
  };
  const hideArrow = () => {
    if (!arrow) return;
    arrow.style.opacity = '0';
    arrow.style.transform = 'translate(-44px, 0)';
  };

  const onStart = (event) => {
    swipe = null;
    if (event.touches?.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX > EDGE || !canGoBack(win) || ignoreTarget(event.target)) return;
    swipe = { x: touch.clientX, y: touch.clientY, t: Date.now(), sideways: null };
  };
  const onMove = (event) => {
    if (!swipe) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (swipe.sideways === null) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      swipe.sideways = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5;
      if (!swipe.sideways) { swipe = null; return; } // scrolling: leave it alone
    }
    if (event.cancelable) event.preventDefault(); // the page doesn't scroll under the swipe
    showArrow(dx, touch.clientY);
  };
  const onEnd = (event) => {
    const current = swipe;
    swipe = null;
    hideArrow();
    if (!current?.sideways) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - current.x;
    const speed = dx / Math.max(1, Date.now() - current.t);
    if (dx >= TRIGGER || (dx >= FLICK && speed >= FLICK_SPEED)) win.history.back();
  };
  const onCancel = () => { swipe = null; hideArrow(); };

  win.addEventListener('touchstart', onStart, { passive: true, capture: true });
  win.addEventListener('touchmove', onMove, { passive: false, capture: true });
  win.addEventListener('touchend', onEnd, { passive: true, capture: true });
  win.addEventListener('touchcancel', onCancel, { passive: true, capture: true });
  return () => {
    win.removeEventListener('touchstart', onStart, { capture: true });
    win.removeEventListener('touchmove', onMove, { capture: true });
    win.removeEventListener('touchend', onEnd, { capture: true });
    win.removeEventListener('touchcancel', onCancel, { capture: true });
    arrow?.remove();
  };
}
