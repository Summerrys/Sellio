// The phone's own Back (Android back button or gesture, iPhone swipe) closes the
// top-most open window — a storefront overlay (product details, cart, checkout,
// order-placed screen, …), a workspace sheet or dialog, the phone menu — or steps back
// through a step-by-step screen, instead of leaving the page. The shared Dialog, Sheet
// and AlertDialog components use it, so every dialog built on them closes on Back.
//
// While any window is open we keep ONE extra history entry (our "Back step") on top;
// Back takes it and we close the most recently opened window. A window closed with its
// own ✕ or button takes its step away again, so Back on a bare page works as before.
//
// Android (Chrome and the app's WebView) guards Back against pages that pile up
// history: an entry a page adds WITHOUT a fresh tap makes the browser skip ALL of that
// page's entries, and the app's Back then finds nothing to go back to — Back looks dead
// until the next tap. So a Back step is only ever ADDED straight after a tap. When Back
// closes one window and another stays open (or a step-by-step screen steps back), we
// move forward onto the step Back just left — it is still there — instead of adding one.
import { useEffect, useRef } from 'react';

// How long after Back to check whether a window really closed. Longer than the
// windows' closing animations (the storefront designer takes 300ms).
export const STILL_OPEN_CHECK_MS = 500;
// How long to wait for the browser to report our own Back / Forward.
const OWN_TRAVERSAL_MS = 1500;
// What lets a page add history: a tap or a key press (the browser's user activation).
const TAP_EVENTS = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'];

const browser = typeof window !== 'undefined' ? window : null;
const stack = [];            // open windows, oldest → newest (by seq)
let armed = false;           // our Back step is the current history entry
let settleTimer = null;
let nextSeq = 0;
let holdUntilEmpty = false;  // a finished flow took its step off: don't add it back
let ownTraversal = null;     // our own history.back()/forward() on its way: { direction, until }
let stepAhead = null;        // after Back took our step: { key, epoch } of the page it sat on
let historyEpoch = 0;        // up by one when an entry is added (forward entries are gone) or a
                             // Back step is turned into a page
let lastTapAt = 0;           // last tap or key press
let lastTraversalAt = 0;     // last Back / Forward (anyone's)
let waitingForTap = false;

const now = () => Date.now();
const onOurStep = () => !!browser.history.state?.sellioOverlay;
const pageKey = () => browser.history.state?.key ?? null;

// A Back step may be added only right after a tap: one in the last few seconds, and
// since the last Back / Forward (after those the browser stops counting earlier taps).
function canAddStep() {
  const activation = browser.navigator?.userActivation;
  if (activation && !activation.isActive) return false;
  return lastTapAt >= lastTraversalAt;
}

function addStep() {
  // Keep react-router's own state (idx/key) so it sees no navigation.
  browser.history.pushState({ ...(browser.history.state || {}), sellioOverlay: true }, '');
  armed = true;
}

function traverse(direction) {
  ownTraversal = { direction, until: now() + OWN_TRAVERSAL_MS };
  setTimeout(() => {
    // The browser never reported it (nothing there): stop waiting for it.
    if (ownTraversal && now() >= ownTraversal.until) { ownTraversal = null; scheduleSettle(); }
  }, OWN_TRAVERSAL_MS + 20);
  if (direction < 0) browser.history.back();
  else browser.history.forward();
}

// A window that opened with no tap to go on (it opened by itself, or after a Back):
// its Back step is added at the next tap.
function armAtNextTap() {
  if (waitingForTap) return;
  waitingForTap = true;
  const onTap = () => {
    TAP_EVENTS.forEach(type => browser.removeEventListener(type, onTap, true));
    waitingForTap = false;
    scheduleSettle();
  };
  TAP_EVENTS.forEach(type => browser.addEventListener(type, onTap, true));
}

function settle() {
  settleTimer = null;
  if (ownTraversal) return; // its popstate settles again
  if (stack.length > 0) {
    if (armed || holdUntilEmpty) return;
    if (onOurStep()) { armed = true; return; } // already on a Back step of ours
    if (stepAhead && stepAhead.key === pageKey() && stepAhead.epoch === historyEpoch) {
      traverse(1); // back onto the step Back just left: nothing new added
      return;
    }
    if (canAddStep()) addStep();
    else armAtNextTap();
    return;
  }
  holdUntilEmpty = false;
  armed = false;
  // No window open: never sit on a Back step (Back from it would seem to do nothing).
  // This also steps off one left behind when a window opened another page. The step
  // stays just ahead, for the next window on this page to move back onto.
  if (onOurStep()) {
    stepAhead = { key: pageKey(), epoch: historyEpoch };
    traverse(-1);
  }
}

// Back into the stack in its original place, below any window opened after it.
function putBack(entry) {
  const i = stack.findIndex(other => other.seq > entry.seq);
  if (i === -1) stack.push(entry);
  else stack.splice(i, 0, entry);
}

// Deferred so an overlay swap in one click (cart → checkout, checkout →
// order-placed) keeps the same history entry instead of removing and re-adding it.
function scheduleSettle() {
  if (!browser) return;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 0);
}

function onPopState() {
  lastTraversalAt = now();
  if (ownTraversal && now() < ownTraversal.until) {
    const { direction } = ownTraversal;
    ownTraversal = null;
    if (direction > 0) {
      armed = onOurStep();
      if (!armed) { stepAhead = null; traverse(-1); return; } // not our step after all: undo
    }
    scheduleSettle();
    return;
  }
  ownTraversal = null;
  if (armed && !onOurStep()) {
    // Back took our step: close the top-most window.
    armed = false;
    stepAhead = { key: pageKey(), epoch: historyEpoch };
    const top = stack.pop(); // removed now so settle() sees the truth
    if (top) {
      const result = top.close();
      if (!top.isOpen()) {
        // Already gone (closed straight away): nothing to keep.
      } else if (result === false || stack.length > 0) {
        // Busy (saving, printing), still steps to go back through, or other windows still
        // open: it keeps its place on top until it has really gone (its cleanup removes it).
        putBack(top);
      } else {
        // A window can also stay open after being asked to close (it asks "Discard
        // changes?" first, or ignores closing while busy): Back stays armed for it.
        setTimeout(() => {
          if (top.isOpen() && !stack.includes(top)) { putBack(top); scheduleSettle(); }
        }, STILL_OPEN_CHECK_MS);
      }
    }
  }
  scheduleSettle(); // re-arm if windows are still open; step off a leftover step
}

if (browser) {
  // Count changes to history (react-router's too) that end the step just ahead: an added
  // entry (forward entries are gone), or a Back step replaced by a page (a hand-over).
  try {
    const push = browser.history.pushState;
    const replace = browser.history.replaceState;
    if (!push.sellioCounted) {
      const countedPush = function pushState(...args) { historyEpoch += 1; return push.apply(this, args); };
      countedPush.sellioCounted = true;
      browser.history.pushState = countedPush;
      browser.history.replaceState = function replaceState(state, ...rest) {
        if (browser.history.state?.sellioOverlay && !state?.sellioOverlay) historyEpoch += 1;
        return replace.call(this, state, ...rest);
      };
    }
  } catch { /* history left as it is */ }
  TAP_EVENTS.forEach(type => browser.addEventListener(type, () => { lastTapAt = now(); }, true));
  browser.addEventListener('popstate', onPopState);
  // Opened or reloaded on a Back step with nothing open: step off it.
  setTimeout(scheduleSettle, 400);
}

// A link inside an open window that leaves the page: call this first and navigate with
// { replace: <its result> }, so the window's Back step becomes the new page's instead
// of being undone (which would go straight back) once the window closes.
export function handOverBackStep() {
  if (!armed || !onOurStep()) return false;
  armed = false;
  // react-router numbers a replacing page from the entry it replaces. Our entry carries
  // the number of the page below it, so move it up one first: the new page then counts
  // the page behind it (in-page back buttons use this).
  const state = browser.history.state;
  browser.history.replaceState({ ...state, idx: (typeof state.idx === 'number' ? state.idx : 0) + 1 }, '');
  return true;
}

// A flow that is finished replaces its page for good (setup done -> Dashboard): take our
// Back step off first, so the replacement lands on the page's own history entry and
// Back from the next page doesn't return to the finished flow. Resolves once done.
export function removeBackStep() {
  holdUntilEmpty = true;
  armed = false;
  if (!browser || !onOurStep()) return Promise.resolve();
  return new Promise(resolve => {
    let timer = null;
    const done = () => {
      browser.removeEventListener('popstate', done);
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, 1000); // never hold the flow up if the browser stays quiet
    browser.addEventListener('popstate', done);
    traverse(-1);
  });
}

export function useBackToClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !browser) return undefined;
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
