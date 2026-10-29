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
//
// In the Android app, Back is decided by Base44's app shell from what the page last told it
// about its history. After the app has been in the background, or a native picker (photos,
// files) has been over it, that can be out of date, so the page tells it again then (see
// reportHistory below).
//
// And in Base44's Android app, Back reaches the page only while the app's Back handler for the
// page is the newest one the app has. Each time the app comes back on screen (from the
// background, a photo or file picker, a permission prompt, the screen turning off), the app
// signs up its Back handler for bottom tabs again, newer than the page's. That one takes every
// Back from then on and switches to the first tab, the one already showing, so Back does
// nothing. The page's handler signs up again only when the page goes from "can't go back" to
// "can go back". So when the app comes back on screen, we step to the first entry of the page's
// history and straight back (see rearmAppBack below): the app signs the page's handler up again,
// newest, and Back reaches the page. (A fault in Base44's app; this keeps Back working until
// they fix it.)
//
// That step only works when the first entry of the history is this very page: going to an entry
// of an older page would load that page. So when Sellio loads a new page in place of this one in
// the Android app (finishing a sign-in, signing out, a reload, a finished setup), the new page
// starts on the FIRST entry of the history instead, with nothing left behind it (see
// startFreshInstead below). Otherwise each page loaded that way sits on older pages, and Back
// goes dead at the next app switch until the app is closed (or straight away after Google
// sign-in, which comes back to the app before the next page loads).
import { useCallback, useEffect, useRef, useState } from 'react';
import { backLog } from './backLog';

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
// When to tell the Android app about the page's history again after it comes back from the
// background or a picker (it may only catch up a moment later), and at most how often at taps.
const REPORT_AGAIN_MS = [50, 700, 2000];
const TAP_REPORT_GAP_MS = 1500;
// Re-arming the Android app's Back once it is back on screen (rearmAppBack below).
const REARM_DELAY_MS = 500;     // after the app is back on screen (it signs its tab handler up then)
const REARM_QUIET_MS = 600;     // no tap and no history change for this long first
const REARM_HOLD_MS = 300;      // time on the first entry, for the app to take in "can't go back"
const REARM_STEP_MS = 1500;     // how long each step may take to arrive
const REARM_GIVE_UP_MS = 10000; // stop waiting for a quiet moment after this
// Starting a new page on the first entry of the history (startFreshInstead below).
const FRESH_KEY = 'sellio-fresh-start'; // the note index.html reads on the first entry's page
const FRESH_GIVE_UP_MS = 5000;          // that page never came: load the new page here, as before
// Taps held off while we're away from the page's own entry (a fraction of a second): a link or
// button acting then would add or change history at the wrong entry.
const HELD_EVENTS = ['click', 'auxclick', 'dblclick', 'contextmenu', 'submit'];

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
let lastReportAt = 0;        // last time the page told the Android app about its history again
let reporting = false;       // our own report (reportHistory) is replacing the entry
let lastHistoryChangeAt = 0; // last entry added or replaced (not counting our own reports)
let rearm = null;            // stepping to the first entry and back (or, before a reload, just to
                             // it): { phase, expect, home, timer, done }
let rearmTimer = null;       // a re-arm waiting for a quiet moment…
let rearmUntil = 0;          // …until about then
let freshPass = null;        // our own replace of the page, to go ahead after all: { url, until }
let freshQueued = null;      // a page asked for while a re-arm was on its way: loads after it

const now = () => Date.now();
const leaving = () => now() < leavingUntil;
function stopLeaving() {
  leavingUntil = 0;
  scheduleSettle();
}
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
  backLog('step added');
}

function traverse(direction) {
  backLog(`step ${direction < 0 ? 'back' : 'forward'} (ours)`);
  ownTraversal = { direction, until: now() + OWN_TRAVERSAL_MS };
  setTimeout(() => {
    // The browser never reported it (nothing there): stop waiting for it.
    if (ownTraversal && now() >= ownTraversal.until) { ownTraversal = null; scheduleSettle(); }
  }, OWN_TRAVERSAL_MS + 20);
  if (direction < 0) browser.history.back();
  else browser.history.forward();
}

// Only in Base44's Android app (browsers decide Back themselves).
const inAndroidApp = () => /Android/i.test(browser?.navigator?.userAgent || '') && (
  typeof browser.ReactNativeWebView?.postMessage === 'function' ||
  typeof browser.__hybrid_bridge?.sendMessage === 'function');

// Tells the Android app about the page's history again: the current history entry replaced by
// itself, which changes nothing here but makes the app's Back read where the page is now. Not
// while the page is moving through history or going to another page.
function reportHistory() {
  if (rearm || ownTraversal || leaving() || (scriptTraversals > 0 && now() < scriptTraversalsUntil)) return;
  reporting = true;
  try { browser.history.replaceState(browser.history.state, ''); } catch { /* nothing to report */ }
  finally { reporting = false; }
}

function reportHistorySoon() {
  if (!inAndroidApp()) return;
  lastReportAt = now();
  // A suspended WebView can resume on a different entry from the one our in-memory
  // overlay stack remembers. Repair that mismatch before reporting its history.
  scheduleSettle();
  REPORT_AGAIN_MS.forEach(ms => setTimeout(reportHistory, ms));
}

// The Android app is back on screen: once the page is quiet, step to the first entry of its
// history (the app then reads "can't go back") and straight back ("can go back"), so the app
// signs its Back handler for the page up again, newest. Only when that first entry is this very
// page (an entry of another page would load that page) and the page isn't on it already (there's
// nothing to go back to from there anyway). Both steps are hidden from the rest of the page:
// react-router and the window stack never see them, and nothing scrolls.
function rearmAppBack() {
  if (!inAndroidApp() || typeof browser.navigation?.traverseTo !== 'function') return;
  rearmUntil = now() + REARM_GIVE_UP_MS;
  if (rearm) return;
  clearTimeout(rearmTimer);
  rearmTimer = setTimeout(tryRearm, REARM_DELAY_MS);
}

function tryRearm() {
  rearmTimer = null;
  if (rearm || now() > rearmUntil) return;
  if (browser.document?.visibilityState !== 'visible') return; // off screen again: its return re-arms
  const quietFor = now() - Math.max(lastTapAt, lastTraversalAt, lastHistoryChangeAt);
  const busy = !!ownTraversal || !!settleTimer || leaving() || (scriptTraversals > 0 && now() < scriptTraversalsUntil);
  if (busy || quietFor < REARM_QUIET_MS) {
    rearmTimer = setTimeout(tryRearm, Math.max(100, REARM_QUIET_MS - quietFor));
    return;
  }
  let entries;
  let current;
  try { entries = browser.navigation.entries(); current = browser.navigation.currentEntry; } catch { return; }
  if (!current || !(current.index > 0)) { backLog('re-arm: not needed (on the first entry)'); return; }
  // Only the first entry has to be this page. The history can hold more entries than the page's
  // own (an embedded page's, like a map's; another site's before ours): they don't stop it.
  if (!entries[0]?.sameDocument) {
    backLog(`re-arm: not possible (entries ${entries.length} of ${browser.history.length}, first is another page)`);
    return;
  }
  rearm = { phase: 'out', expect: entries[0].key, home: current.key, timer: null };
  backLog(`re-arm: to the first entry and back, from #${current.index}`);
  rearmStep();
}

function rearmStep() {
  clearTimeout(rearm.timer);
  rearm.timer = setTimeout(rearmTimedOut, REARM_STEP_MS);
  try {
    const result = browser.navigation.traverseTo(rearm.expect);
    result?.committed?.catch(() => {});
    result?.finished?.catch(() => {});
  } catch {
    backLog('re-arm: step refused');
    endRearm();
  }
}

function rearmTimedOut() {
  if (!rearm) return;
  let at = null;
  try { at = browser.navigation.currentEntry?.key; } catch { /* unknown */ }
  if (at !== rearm.home && rearm.phase !== 'retry') {
    backLog('re-arm: a step never arrived, going back to the page');
    rearm.phase = 'retry';
    rearm.expect = rearm.home;
    rearmStep();
    return;
  }
  endRearm();
}

function endRearm() {
  if (!rearm) return;
  clearTimeout(rearm.timer);
  const { done } = rearm;
  rearm = null;
  done?.(); // a reload waiting to start from the first entry goes ahead from wherever we are
  if (freshQueued) {
    // A page asked for while we were away from the page's entry: it loads now (goFresh).
    const to = freshQueued;
    freshQueued = null;
    setTimeout(() => goFresh(to), 0);
    return;
  }
  scheduleSettle(); // whatever waited (a window's Back step) goes ahead now
}

// Our steps arriving: hidden from the rest of the page (true: this was one of them). Called first
// thing by our popstate listener, which is added before react-router's, so stopping the event
// here keeps it from react-router too. Anything else arriving meanwhile (the person's own Back)
// ends the re-arm and goes on to the window stack and react-router as usual.
function onRearmPopState(event) {
  if (!rearm) return false;
  let at = null;
  try { at = browser.navigation.currentEntry?.key; } catch { /* unknown */ }
  if (rearm.phase === 'away') {
    // On the way to an older page to start the next page there (goFresh): this page is going,
    // nothing on it reacts meanwhile. (If that page never comes, the next page loads here.)
    event.stopImmediatePropagation();
    return true;
  }
  if (rearm.phase === 'out' && at === rearm.expect) {
    event.stopImmediatePropagation();
    rearm.phase = 'hold';
    clearTimeout(rearm.timer);
    rearm.timer = setTimeout(() => {
      if (!rearm) return;
      // The page started going to another page from the first entry (not ours): stepping back
      // now would cancel that. It loads from there; nothing left to re-arm.
      if (leaving()) { backLog('re-arm: the page is going to another page'); endRearm(); return; }
      rearm.phase = 'back';
      rearm.expect = rearm.home;
      rearmStep();
    }, REARM_HOLD_MS);
    return true;
  }
  if ((rearm.phase === 'back' || rearm.phase === 'retry') && at === rearm.expect) {
    event.stopImmediatePropagation();
    backLog('re-arm: done');
    endRearm();
    return true;
  }
  if (rearm.phase === 'leave' && at === rearm.expect) {
    // On the first entry, ready for the reload (stepToFirstEntry). Taps stay held off until the
    // reload takes the page away; if it never does, go back to the page and carry on.
    event.stopImmediatePropagation();
    backLog(`${rearm.why}: on the first entry`);
    rearm.phase = 'left';
    clearTimeout(rearm.timer);
    const { done } = rearm;
    rearm.done = null;
    rearm.timer = setTimeout(() => {
      if (rearm?.phase !== 'left') return;
      backLog(`${rearm.why}: never happened, back to the page`);
      const { home } = rearm;
      endRearm();
      try { browser.navigation.traverseTo(home); } catch { /* stay here */ }
    }, LEAVING_MS);
    done?.();
    return true;
  }
  backLog('re-arm: interrupted');
  endRearm();
  return false;
}

// Before Sellio reloads itself in the Android app (to update): step to the first entry of the
// page's history when that is this very page, hidden from the rest of the page like a re-arm, so
// the reload puts the new copy there. Then nothing of the old copy is left behind it (Back from
// its first page would load that old page), and the new copy can keep re-arming the app's Back.
// Resolves once there, or straight away when that isn't possible or needed (the reload then
// replaces the current page, as it always did). (A replace or reload that can't start from here
// is then taken on by startFreshInstead below.) `why` names it in the Back log.
export function stepToFirstEntry(why = 'reload') {
  return new Promise((resolve) => {
    if (!browser || !inAndroidApp() || typeof browser.navigation?.traverseTo !== 'function' || rearm) { resolve(); return; }
    let entries;
    let current;
    try { entries = browser.navigation.entries(); current = browser.navigation.currentEntry; } catch { resolve(); return; }
    if (!current || !(current.index > 0) || !entries[0]?.sameDocument) {
      resolve();
      return;
    }
    clearTimeout(rearmTimer);
    rearmTimer = null;
    rearm = { phase: 'leave', expect: entries[0].key, home: current.key, timer: null, done: resolve, why };
    backLog(`${why}: to the first entry first, from #${current.index}`);
    rearm.timer = setTimeout(() => {
      if (rearm?.phase !== 'leave') return;
      backLog(`${why}: the first entry never arrived`);
      endRearm();
    }, REARM_STEP_MS);
    try {
      const result = browser.navigation.traverseTo(rearm.expect);
      result?.committed?.catch(() => {});
      result?.finished?.catch(() => {});
    } catch {
      endRearm();
    }
  });
}

// The page's own replace or reload to a Sellio address in the Android app (location.replace,
// location.reload: finishing a sign-in, signing out, Reload, Try again, a finished setup), from
// anywhere but the first entry: cancelled here (the navigate listener below calls this first)
// and loaded on the first entry instead (goFresh), so nothing is left behind the new page.
// True when it was taken on. Left as it is: other sites, form posts, websites and iPhone, the
// first of the page's entries, and our own replace that goFresh lets through.
function startFreshInstead(event) {
  if (!inAndroidApp() || !event.cancelable || event.formData) return false;
  const type = event.navigationType;
  if (type !== 'replace' && type !== 'reload') return false;
  let url;
  try { url = new URL(event.destination.url); } catch { return false; }
  if (url.origin !== browser.location.origin) return false;
  if (freshPass && freshPass.url === url.href && now() < freshPass.until) { freshPass = null; return false; }
  let entries;
  let current;
  try { entries = browser.navigation.entries(); current = browser.navigation.currentEntry; } catch { return false; }
  if (!current) return false;
  let to = url.pathname + url.search + url.hash;
  if (rearm) {
    if (rearm.phase === 'left') return false; // a reload waiting on the first entry: this is it
    if (rearm.phase === 'hold' && type === 'replace') return false; // on the first entry: loads there
    event.preventDefault();
    if (rearm.phase === 'leave' || rearm.phase === 'away') {
      backLog(`fresh start: a page is already on its way (this ${type} not needed)`);
      return true;
    }
    // A re-arm on its way: the new page loads once it's over. (A reload is of the page itself,
    // not of the first entry the re-arm may be standing on for a moment.)
    if (type === 'reload') {
      const home = entries.find((entry) => entry.key === rearm.home);
      try { if (home?.url) { const at = new URL(home.url); to = at.pathname + at.search + at.hash; } } catch { /* as asked */ }
    }
    freshQueued = to;
    backLog(`fresh start: after the re-arm (${type})`);
    return true;
  }
  if (!(current.index > 0)) return false;
  event.preventDefault();
  goFresh(to);
  return true;
}

// Loads `to` in place of this page on the first entry of the history:
// - the first entry is this page: step there unseen (as before an update reload), load it there;
// - the first entry is an older Sellio page: leave it a note and go there. index.html, on that
//   page, reads the note before anything else runs and loads `to` in its place (one quick load
//   more). If that page never comes, `to` loads here, as before.
// Anything that stops either (history changed meanwhile, the step refused): `to` loads here.
function goFresh(to) {
  if (rearm) { freshQueued = to; return; }
  let entries;
  let current;
  try { entries = browser.navigation.entries(); current = browser.navigation.currentEntry; } catch { passReplace(to); return; }
  if (!current || !(current.index > 0) || typeof browser.navigation.traverseTo !== 'function') {
    passReplace(to);
    return;
  }
  if (entries[0].sameDocument) {
    void stepToFirstEntry('fresh start').then(() => passReplace(to), () => passReplace(to));
    return;
  }
  try {
    browser.sessionStorage.setItem(FRESH_KEY, JSON.stringify({ to, key: entries[0].key, at: Date.now() }));
  } catch { passReplace(to); return; }
  clearTimeout(rearmTimer);
  rearmTimer = null;
  rearm = { phase: 'away', expect: entries[0].key, home: current.key, timer: null };
  backLog(`fresh start: to the first entry first (an older page), from #${current.index}`);
  const loadHere = (why) => {
    if (rearm?.phase !== 'away') return;
    backLog(`fresh start: ${why}, loading the page here`);
    try { browser.sessionStorage.removeItem(FRESH_KEY); } catch { /* it expires anyway */ }
    endRearm();
    passReplace(to);
  };
  rearm.timer = setTimeout(() => loadHere('the first entry never came'), FRESH_GIVE_UP_MS);
  try {
    const result = browser.navigation.traverseTo(entries[0].key);
    result?.committed?.catch(() => {});
    result?.finished?.catch(() => {});
  } catch {
    loadHere('the step was refused');
  }
}

// Our own replace of the page, let through by startFreshInstead.
function passReplace(to) {
  let url = to;
  try { url = new URL(to, browser.location.href).href; } catch { /* as given */ }
  freshPass = { url, until: now() + 2000 };
  browser.location.replace(to);
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
  if (rearm) return; // away from the page's entry for a moment: settles again once back
  // The Android WebView can restore/traverse its current entry while the JS context
  // stays alive (backgrounding, native picker, process/activity restore). Never
  // assume that an old `armed` flag still describes the browser's current entry.
  if (armed && !onOurStep()) {
    armed = false;
    stepAhead = null;
  }
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

// The Android wrapper may call this directly when its Back button cannot safely
// rely on WebView.canGoBack (notably after backgrounding). Overlays are closed
// without traversing, while ordinary React Router pages navigate using the page's
// own history. That avoids a separate native canGoBack decision for either case.
// Return false only when there is nothing Sellio can handle, leaving root exit / 
// native navigation to the wrapper.
export function handleAndroidBack() {
  if (!browser) return false;
  // An overlay may have unmounted between native dispatch and React effect cleanup.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (!stack[i].isOpen()) stack.splice(i, 1);
  }
  const top = stack[stack.length - 1];
  if (!top) {
    // React Router's idx identifies app-owned page history. Native WebView.canGoBack
    // may lag after returning from another app; let JS perform this traversal
    // rather than asking the wrapper to decide from its potentially stale cache.
    const idx = historyState()?.idx;
    if (!onOurStep() && !ownTraversal && !leaving() && Number.isInteger(idx) && idx > 0) {
      browser.history.back();
      return true;
    }
    return false;
  }
  try { top.close(); }
  catch (error) { console.error('Sellio native Back failed:', error); }
  scheduleSettle();
  return true;
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

function onPopState(event) {
  if (onRearmPopState(event)) return; // our own step to the first entry and back: not a Back
  lastTraversalAt = now();
  const byPage = scriptTraversals > 0 && now() < scriptTraversalsUntil;
  if (byPage) scriptTraversals -= 1; // the page's own
  else { scriptTraversals = 0; lastUserTraversalAt = now(); } // the person's Back / Forward
  if (ownTraversal && now() < ownTraversal.until) {
    const { direction } = ownTraversal;
    ownTraversal = null;
    backLog(`arrived (our step ${direction < 0 ? 'back' : 'forward'})`);
    if (direction > 0) {
      armed = onOurStep();
      if (!armed) { stepAhead = null; traverse(-1); return; } // not our step after all: undo
    }
    scheduleSettle();
    return;
  }
  ownTraversal = null;
  backLog(`${byPage ? "page's own back/forward" : 'Back/Forward'} arrived, ${stack.length} open, ${armed ? 'armed' : 'not armed'}`);
  if (armed && !onOurStep()) {
    // Back took our step: close the top-most window.
    armed = false;
    stepAhead = { key: pageKey(), epoch: historyEpoch };
    const top = stack.pop(); // removed now so settle() sees the truth
    if (top) {
      const result = top.close();
      backLog(`Back closes the top window: ${!top.isOpen() ? 'closed' : result === false ? 'refused (busy)' : 'closing'}, ${stack.length} left`);
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
        lastHistoryChangeAt = now();
        if (rearm && rearm.phase !== 'away') { backLog('re-arm: the page added history meanwhile'); endRearm(); }
        if (!tappedSincePersonsBack()) {
          if (onOurStep()) armed = false; // our Back step becomes the new page (a hand-over)
          backLog('page added history with no tap: replacing instead');
          return replace.call(this, state, ...rest);
        }
        return push.call(this, state, ...rest);
      };
      countedPush.sellioCounted = true;
      history.pushState = countedPush;
      history.replaceState = function replaceState(state, ...rest) {
        if (!reporting) {
          lastHistoryChangeAt = now();
          if (rearm && rearm.phase !== 'away') { backLog('re-arm: the page replaced history meanwhile'); endRearm(); }
        }
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
    // In the Android app, also at taps (at most every 1.5 s), in case its record went out of
    // date some other way.
    if (event?.type === 'pointerup' && now() - lastReportAt > TAP_REPORT_GAP_MS && inAndroidApp()) {
      lastReportAt = now();
      setTimeout(reportHistory, 0);
    }
  }, true));
  // (Added before react-router's own, which it can then keep from seeing our re-arm steps.)
  browser.addEventListener('popstate', onPopState);
  // Native entry point: wrappers can evaluate `window.__sellioHandleAndroidBack()`
  // on a hardware Back press, and use their ordinary goBack/exit when it returns false.
  // Cordova-style backbutton and an explicit Sellio event also work without touching
  // page history. Do not listen to arbitrary window message payloads.
  browser.__sellioHandleAndroidBack = handleAndroidBack;
  const nativeBackEvent = (event) => {
    if (handleAndroidBack()) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  };
  browser.document?.addEventListener('backbutton', nativeBackEvent);
  browser.addEventListener('sellio:android-back', nativeBackEvent);
  // Re-arming the Android app's Back (rearmAppBack): our two steps are hidden from the rest of the
  // page (onPopState above), taps are held off meanwhile (added after the tap listener above,
  // which still counts them), and no step scrolls the page or moves the focus.
  browser.addEventListener('hashchange', (event) => { if (rearm) event.stopImmediatePropagation(); });
  HELD_EVENTS.forEach(type => browser.addEventListener(type, (event) => {
    if (!rearm) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true));
  try {
    browser.navigation?.addEventListener('navigate', (event) => {
      if (rearm && event.navigationType === 'traverse' && event.canIntercept && event.destination?.key === rearm.expect) {
        event.intercept({ scroll: 'manual', focusReset: 'manual' });
      }
    });
  } catch { /* no Navigation API: no re-arming either */ }
  // The page starting to go to another page (location.assign / href, a link or form to
  // another document). Not a download, not a move within this page.
  // (Even a slow page on its way is not undone by a tap meanwhile: only the page being
  // shown again, coming back from another app, or the time running out ends this.)
  // In the Android app the page's own replace or reload starts the new page on the first entry
  // of the history instead (startFreshInstead).
  const startLeaving = () => {
    leavingUntil = now() + LEAVING_MS;
    setTimeout(scheduleSettle, LEAVING_MS + 50);
  };
  try {
    browser.navigation?.addEventListener('navigate', (event) => {
      if (event.destination?.sameDocument || event.hashChange || event.downloadRequest || event.navigationType === 'traverse') return;
      if (!/^https?:/i.test(event.destination?.url || '')) return; // tel:, mailto:, an app's link
      let taken = false;
      try { taken = startFreshInstead(event); } catch (error) {
        backLog(`fresh start: failed (${String(error?.message || error).slice(0, 80)})`);
        // Never lose the page asked for: load it here, as before.
        if (event.defaultPrevented) { try { passReplace(event.destination.url); } catch { /* nothing more to try */ } return; }
      }
      if (taken) return;
      startLeaving();
    });
  } catch { /* no Navigation API: beforeunload below */ }
  browser.addEventListener('beforeunload', startLeaving);
  // Shown again (Back to a page kept in memory), or back from another app: carry on.
  browser.addEventListener('pageshow', (event) => {
    if (event.persisted) stopLeaving();
    // Also catches bfcache restores that do not cause a new visibilitychange.
    reportHistorySoon();
  });
  browser.document?.addEventListener('visibilitychange', () => {
    if (browser.document.visibilityState === 'visible' && leaving()) stopLeaving();
  });
  // Back in the Android app from the background, a native picker (choosing a photo or file,
  // or cancelling) or a native dialog: tell it about the page's history again, and re-arm its
  // Back for the page.
  const backOnScreen = () => { reportHistorySoon(); rearmAppBack(); };
  browser.document?.addEventListener('visibilitychange', () => {
    if (browser.document.visibilityState === 'visible') backOnScreen();
  });
  browser.addEventListener('focus', backOnScreen);
  for (const type of ['change', 'cancel']) {
    browser.document?.addEventListener(type, (event) => {
      if (event.target?.type === 'file') backOnScreen();
    }, true);
  }
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
