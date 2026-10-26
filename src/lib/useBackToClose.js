// Phone / browser Back (including the Android back button and back swipe) closes the
// top-most open window — a storefront overlay (product details, cart, checkout,
// order-placed screen, …), a workspace sheet or dialog, the phone menu — instead of
// leaving the page. The shared Dialog, Sheet and AlertDialog components use it, so
// every dialog built on them closes on Back.
//
// Customers open the menu straight from their camera's QR scanner, so the menu
// is the first page in that tab's history and a plain Back exits to the camera.
// While any overlay is open we keep ONE extra history entry on top; Back pops it
// and we close the most recently opened overlay (re-arming if others remain).
// When overlays are closed with their own ✕/buttons we remove that entry again,
// so Back on the bare menu behaves exactly as before.
import { useEffect, useRef } from 'react';

const stack = [];        // open overlays, oldest → newest (by seq)
let armed = false;       // our extra history entry is currently on top
let ignorePops = 0;      // pops caused by our own history.back()
let listening = false;
let settleTimer = null;
let nextSeq = 0;

// How long after Back to check whether a window really closed. Longer than the
// windows' closing animations (the storefront designer takes 300ms).
export const STILL_OPEN_CHECK_MS = 500;

function settle() {
  settleTimer = null;
  if (stack.length > 0 && !armed) {
    // Keep react-router's own state (idx/key) so it sees no navigation.
    window.history.pushState({ ...(window.history.state || {}), sellioOverlay: true }, '');
    armed = true;
  } else if (stack.length === 0 && armed) {
    armed = false;
    // Only step back over our own entry. If the page has moved on since (something in
    // the window opened another page), that entry is no longer on top: stepping back
    // would undo the new page, so leave history alone.
    if (window.history.state?.sellioOverlay) {
      ignorePops += 1;
      window.history.back();
    }
  }
}

// Back into the stack in its original place, below any window opened after it.
function putBack(entry) {
  const i = stack.findIndex(other => other.seq > entry.seq);
  if (i === -1) stack.push(entry);
  else stack.splice(i, 0, entry);
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
  if (top) {
    if (top.close() === false) {
      putBack(top);                   // A save/print in progress keeps Back armed.
    } else if (stack.length > 0) {
      // Other windows are still open, so Back is armed again straight away anyway. Keep
      // this one in its place on top until it has really gone (its cleanup removes it),
      // so a quick second Back reaches it rather than the window underneath.
      putBack(top);
    } else {
      // A window can also stay open after being asked to close (it asks "Discard
      // changes?" first, or ignores closing while busy): Back stays armed for it.
      setTimeout(() => {
        if (top.isOpen() && !stack.includes(top)) { putBack(top); scheduleSettle(); }
      }, STILL_OPEN_CHECK_MS);
    }
  }
  scheduleSettle();                 // re-arm if more overlays are still open
}

// A link inside an open window that leaves the page: call this first and navigate with
// { replace: <its result> }, so the window's Back step becomes the new page's instead
// of being undone (which would go straight back) once the window closes.
export function handOverBackStep() {
  if (!armed || !window.history.state?.sellioOverlay) return false;
  armed = false;
  // react-router numbers a replacing page from the entry it replaces. Our entry carries
  // the number of the page below it, so move it up one first: the new page then counts
  // the page behind it, and the header's back arrow knows there is a page to go back to.
  const state = window.history.state;
  window.history.replaceState({ ...state, idx: (typeof state.idx === 'number' ? state.idx : 0) + 1 }, '');
  return true;
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
    let open = true;
    const entry = { seq: ++nextSeq, close: () => closeRef.current?.(), isOpen: () => open };
    stack.push(entry);
    scheduleSettle();
    return () => {
      open = false;
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      scheduleSettle();
    };
  }, [isOpen]);
}
