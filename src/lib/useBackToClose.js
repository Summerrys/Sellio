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
//
// The same goes for the rest of the app: any page or link that adds history with no tap
// since the person's last Back (a page that navigates by itself, or once something it
// was waiting for arrives) takes the current entry's place instead (see the pushState
// guard below), so nothing in Sellio can leave Android's Back with nothing to go to.
import { useCallback, useEffect, useRef, useState } from 'react';

// How long after Back to check whether a window really closed. Longer than the
// windows' closing animations (the storefront designer takes 300ms).
export const STILL_OPEN_CHECK_MS = 500;
// How long to wait for the browser to report our own Back / Forward.
const OWN_TRAVERSAL_MS = 1500;
// How long another page may take to arrive once the page starts going to it (a sign-in
// or payment page) before we take it that it isn't coming after all.
const LEAVING_MS = 15000;
// What lets a page add history: a tap or a key press (the browser's user activation).
// Not touchend: a finger that scrolls ends with one too, and that isn't a tap — on a
// phone a tap is a pointerup (a scroll cancels the pointer instead) and then a click.
const TAP_EVENTS = ['pointerup', 'mousedown', 'keydown', 'click'];

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
let lastUserTraversalAt = 0; // last Back / Forward by the person (the browser's or phone's Back)
let scriptTraversals = 0;    // the page's own history.back()/forward()/go() still on their way…
let scriptTraversalsUntil = 0; // …until about then
let waitingForTap = false;
let leavingUntil = 0;        // the page is going to another page (a new document): until then

const now = () => Date.now();
const leaving = () => now() < leavingUntil;
// (Read safely: a page being torn down can have no history left to read.)
const historyState = () => { try { return browser.history.state; } catch { return null; } };
const onOurStep = () => !!historyState()?.sellioOverlay;
const pageKey = () => historyState()?.key ?? null;

// A Back step may be added only after a tap since the last Back / Forward (after those
// the browser stops counting earlier taps). The tap's moment itself may be over or used
// up (going full screen, opening a picker): the browser still honours the step.
function canAddStep() {
  const activation = browser.navigator?.userActivation;
  if (activation && !activation.hasBeenActive) return false;
  return lastTapAt > 0 && lastTapAt >= lastTraversalAt;
}

// Whether the browser would let this page add a history entry now: a tap or key press
// since the page loaded and since the person's last Back / Forward. (The page's own
// history.back()/forward() don't count: the browser keeps honouring the earlier tap.)
function tappedSincePersonsBack() {
  return lastTapAt > 0 && lastTapAt >= lastUserTraversalAt;
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
  // Going to another page (say, the sign-in page from a checkout): moving through history
  // now would cancel that and bring the person straight back here. Leave it be; this runs
  // again if the page is still here later (or is shown again from Back).
  if (leaving()) return;
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
  if (scriptTraversals > 0 && now() < scriptTraversalsUntil) scriptTraversals -= 1; // the page's own
  else { scriptTraversals = 0; lastUserTraversalAt = now(); } // the person's Back / Forward
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
  //
  // And guard Back for the whole app: an entry added with no tap since the person's last
  // Back / Forward makes Android skip every entry of the page, so Back finds nothing (it
  // seems dead). Such an entry takes the current one's place instead: Back keeps working,
  // it just won't return to the screen that was replaced.
  try {
    const { history } = browser;
    const push = history.pushState;
    const replace = history.replaceState;
    if (!push.sellioCounted) {
      const countedPush = function pushState(state, ...rest) {
        historyEpoch += 1;
        if (!tappedSincePersonsBack()) {
          if (onOurStep()) armed = false; // our Back step becomes the new page (a hand-over)
          return replace.call(this, state, ...rest);
        }
        return push.call(this, state, ...rest);
      };
      countedPush.sellioCounted = true;
      history.pushState = countedPush;
      history.replaceState = function replaceState(state, ...rest) {
        if (browser.history.state?.sellioOverlay && !state?.sellioOverlay) historyEpoch += 1;
        return replace.call(this, state, ...rest);
      };
      // The page's own Back / Forward (ours, react-router's navigate(-1), in-page back
      // buttons): told apart from the person's, which the browser treats differently.
      for (const name of ['back', 'forward', 'go']) {
        const original = history[name];
        history[name] = function traverseHistory(...args) {
          if (name !== 'go' || (args[0] && args[0] !== 0)) {
            scriptTraversals += 1;
            scriptTraversalsUntil = now() + OWN_TRAVERSAL_MS;
          }
          return original.apply(this, args);
        };
      }
    }
  } catch { /* history left as it is */ }
  // Escape doesn't count: the browser doesn't treat it as a tap either. Nor does a click
  // the page makes itself (element.click()): only the person's own taps.
  TAP_EVENTS.forEach(type => browser.addEventListener(type, (event) => {
    if (event?.type === 'keydown' && event.key === 'Escape') return;
    if (event?.isTrusted === false && browser.navigator?.userActivation) return;
    lastTapAt = now();
  }, true));
  browser.addEventListener('popstate', onPopState);
  // The page starting to go to another page (location.assign / href, a link or form to
  // another document). Not a download, not a move within this page.
  const startLeaving = () => {
    leavingUntil = now() + LEAVING_MS;
    setTimeout(scheduleSettle, LEAVING_MS + 50);
  };
  try {
    browser.navigation?.addEventListener('navigate', (event) => {
      if (event.destination?.sameDocument || event.hashChange || event.downloadRequest || event.navigationType === 'traverse') return;
      startLeaving();
    });
  } catch { /* no Navigation API: beforeunload below */ }
  browser.addEventListener('beforeunload', startLeaving);
  // Shown again (Back to a page kept in memory): carry on from where it was.
  browser.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    leavingUntil = 0;
    scheduleSettle();
  });
  // Opened or reloaded on a Back step with nothing open: step off it.
  try { if (onOurStep()) setTimeout(scheduleSettle, 400); } catch { /* no history to read */ }
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

// For pickers and menus (Select, DropdownMenu, Popover) that are often open without a
// parent controlling them: their open state, with the phone's Back closing them too.
// Controlled ones keep their parent's state (and close through its onOpenChange).
export function useOpenWithBack(open, defaultOpen, onOpenChange) {
  const controlled = open !== undefined;
  const [own, setOwn] = useState(!!defaultOpen);
  const isOpen = controlled ? !!open : own;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const setOpen = useCallback((next) => {
    if (!controlled) setOwn(next);
    changeRef.current?.(next);
  }, [controlled]);
  useBackToClose(isOpen && (!controlled || typeof onOpenChange === 'function'), () => setOpen(false));
  return [isOpen, setOpen];
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
