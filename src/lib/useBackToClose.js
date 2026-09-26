// Phone / browser Back closes the top-most storefront overlay (product details,
// cart, checkout, order-placed screen, …) instead of leaving the page.
//
// Customers open the menu straight from their camera's QR scanner, so the menu
// is the first page in that tab's history and a plain Back exits to the camera.
// While any overlay is open we keep ONE extra history entry on top; Back pops it
// and we close the most recently opened overlay (re-arming if others remain).
// When overlays are closed with their own ✕/buttons we remove that entry again,
// so Back on the bare menu behaves exactly as before.
import { useEffect, useRef } from 'react';

const stack = [];        // open overlays, oldest → newest
let armed = false;       // our extra history entry is currently on top
let ignorePops = 0;      // pops caused by our own history.back()
let listening = false;
let settleTimer = null;

function settle() {
  settleTimer = null;
  if (stack.length > 0 && !armed) {
    // Keep react-router's own state (idx/key) so it sees no navigation.
    window.history.pushState({ ...(window.history.state || {}), sellioOverlay: true }, '');
    armed = true;
  } else if (stack.length === 0 && armed) {
    armed = false;
    ignorePops += 1;
    window.history.back();
  }
}

// Deferred so an overlay swap in one click (cart → checkout, checkout →
// order-placed) keeps the same history entry instead of popping and re-pushing.
function scheduleSettle() {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 0);
}

function onPopState() {
  if (ignorePops > 0) { ignorePops -= 1; return; }
  if (!armed) return;
  armed = false;                    // the browser consumed our entry
  const top = stack.pop();          // remove now so settle() sees the truth
  if (top) top.close();
  scheduleSettle();                 // re-arm if more overlays are still open
}

export function useBackToClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const entry = { close: () => closeRef.current?.() };
    stack.push(entry);
    scheduleSettle();
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      scheduleSettle();
    };
  }, [isOpen]);
}
