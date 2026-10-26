// The phone's own Back (Android back button or gesture, iPhone swipe in Safari): closes
// the top window, steps back through step-by-step screens, and hands its Back step to a
// page opened from inside a window. Real react-router (BrowserRouter) and the shared
// Dialog / Sheet / AlertDialog components, in jsdom.
// Run: node verification/back-navigation.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://sellio.apptelier.sg/Dashboard', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent',
  'MouseEvent', 'FocusEvent', 'DocumentFragment', 'NodeFilter', 'HTMLAnchorElement', 'MutationObserver', 'navigator', 'getComputedStyle', 'localStorage']) {
  if (win[key] !== undefined) Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.requestAnimationFrame = cb => win.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = id => win.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { BrowserRouter, useNavigate, useLocation } = await import('react-router-dom');

// One bundle, so the hook's shared state is the same one the dialogs use.
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-back-nav-'));
const outfile = path.join(tmp, 'bundle.mjs');
await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: `
    export * from '@/lib/useBackToClose';
    export { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
    export { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
    export { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
    export { goBack } from '@/lib/goBack';
    export { backToSellio } from '@/components/legal/LegalPage';
  ` },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' },
  alias: { '@': path.join(process.cwd(), 'src') }, logLevel: 'silent',
});
const local = path.join(process.cwd(), '.back-navigation-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const h = React.createElement;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = () => sleep(120);
const pressBack = async () => { win.history.back(); await sleep(60); };   // a later task, as in a browser
// A tap (the browser's user activation): what opens a window in real use.
const tap = () => win.dispatchEvent(new win.Event('pointerup'));
// Every Back step added, and whether it came straight after a tap (none since the last
// Back / Forward): Android skips a page's history when one is added without.
const stepPushes = [];
{
  let lastTap = 0, lastTraversal = 0, tick = 0;
  win.addEventListener('pointerup', () => { lastTap = ++tick; }, true);
  win.addEventListener('popstate', () => { lastTraversal = ++tick; }, true);
  const push = win.history.pushState;
  win.history.pushState = function pushState(state, ...rest) {
    if (state?.sellioOverlay) stepPushes.push({ afterTap: lastTap > lastTraversal });
    return push.call(this, state, ...rest);
  };
}
const onOverlayEntry = () => !!win.history.state?.sellioOverlay;
const text = () => win.document.body.textContent;

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
let root;
try {
  // ---- In-page back buttons (Counter's Exit, Explore), before any page is mounted ----
  const calls = [];
  const fakeNavigate = (...args) => calls.push(args);
  const saved = win.history.state;
  win.history.replaceState({ idx: 2, key: 'x' }, '');
  mod.goBack(fakeNavigate, '/Dashboard');
  win.history.replaceState({ idx: 0, key: 'y' }, '');
  mod.goBack(fakeNavigate, '/Dashboard');
  win.history.replaceState(saved, '');
  assert.deepEqual(calls, [[-1], ['/Dashboard', { replace: true }]]);
  passed('goBack: steps back when there is a Sellio page behind; otherwise opens the fallback page in place (never leaves the app)');

  // ---- Mount: real router + test windows ----
  const router = {};
  const overlays = {};
  const ui = {};
  function Probe() { router.navigate = useNavigate(); router.location = useLocation(); return null; }
  function Overlay({ name }) {
    const [open, setOpen] = React.useState(false);
    const o = overlays[name] ||= { calls: 0, onBack: null };
    o.open = open; o.setOpen = setOpen;
    mod.useBackToClose(open, () => { o.calls += 1; return o.onBack ? o.onBack() : setOpen(false); });
    return null;
  }
  // A step-by-step screen, wired the way ShopSetup and Onboarding are.
  const flow = {};
  function Steps() {
    const [step, setStep] = React.useState(0);
    flow.step = step; flow.setStep = setStep;
    mod.useBackToClose(step > 0, () => {
      setStep(s => Math.max(s - 1, 0));
      if (step > 1) return false;
    });
    return null;
  }
  function Shared({ kind }) {
    const [open, setOpen] = React.useState(false);
    ui[kind] = { open, setOpen };
    if (kind === 'dialog') return h(mod.Dialog, { open, onOpenChange: setOpen },
      h(mod.DialogContent, { 'aria-describedby': undefined }, h(mod.DialogTitle, null, 'Edit item'), h('p', null, 'DIALOG-BODY')));
    if (kind === 'sheet') return h(mod.Sheet, { open, onOpenChange: setOpen },
      h(mod.SheetContent, { 'aria-describedby': undefined }, h(mod.SheetTitle, null, 'Order'), h('p', null, 'SHEET-BODY')));
    return h(mod.AlertDialog, { open, onOpenChange: setOpen },
      h(mod.AlertDialogContent, { 'aria-describedby': undefined }, h(mod.AlertDialogTitle, null, 'Delete?'), h('p', null, 'ALERT-BODY')));
  }
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  root = createRoot(container);
  root.render(h(BrowserRouter, null, h(Probe), h(Overlay, { name: 'A' }), h(Overlay, { name: 'B' }),
    h(Shared, { kind: 'dialog' }), h(Shared, { kind: 'sheet' }), h(Shared, { kind: 'alert' }), h(Steps)));
  await settle();
  const home = win.history.state;
  assert.equal(home.idx, 0);
  assert.equal(router.location.pathname, '/Dashboard');
  const atHome = () => win.history.state?.key === home.key && !onOverlayEntry() && router.location.pathname === '/Dashboard';

  // 1
  const length0 = win.history.length;
  tap(); overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry(), 'a Back step is added while the window is open');
  assert.equal(win.history.length, length0 + 1);
  assert.equal(win.history.state.idx, home.idx, 'react-router sees no new page');
  await pressBack();
  assert.equal(overlays.A.open, false); assert.equal(overlays.A.calls, 1);
  assert.ok(atHome(), 'still on the same page, on its own history entry');
  await settle(); assert.ok(atHome());
  passed('Back closes an open window and stays on the page');

  // 2
  tap(); overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry());
  overlays.A.setOpen(false); await sleep(80);
  assert.ok(atHome(), 'the extra Back step is removed again');
  assert.equal(overlays.A.calls, 1, 'closing with its own button does not run the Back handler');
  tap(); overlays.A.setOpen(true); await settle();
  await pressBack();
  assert.equal(overlays.A.open, false); assert.equal(overlays.A.calls, 2);
  assert.ok(atHome());
  passed('Closing a window with its own button removes its Back step (Back then works normally next time)');

  // 3
  tap(); overlays.A.setOpen(true); await settle();
  tap(); overlays.B.setOpen(true); await settle();
  await pressBack();
  assert.equal(overlays.B.open, false); assert.equal(overlays.A.open, true);
  assert.ok(onOverlayEntry(), 'Back is armed again for the window still open');
  await pressBack();
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('Two windows: Back closes the newest first, then the one below');

  // 4
  overlays.A.onBack = () => false;          // e.g. saving or printing
  tap(); overlays.A.setOpen(true); await settle();
  await pressBack();
  assert.equal(overlays.A.open, true);
  assert.ok(onOverlayEntry(), 'Back stays armed while busy');
  overlays.A.onBack = null;
  await pressBack();
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('A busy window (saving / printing) stays open on Back, and Back closes it once it is done');

  // 5
  overlays.A.onBack = () => undefined;      // asks "Discard changes?" instead of closing
  tap(); overlays.A.setOpen(true); await settle();
  const before = overlays.A.calls;
  await pressBack();
  assert.equal(overlays.A.open, true);
  await sleep(mod.STILL_OPEN_CHECK_MS + 80);
  assert.ok(onOverlayEntry(), 'Back is armed again for the window that stayed open');
  overlays.A.onBack = null;
  await pressBack();
  assert.equal(overlays.A.calls, before + 2);
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('A window that asks first ("Discard changes?") keeps Back armed; the next Back reaches it again');

  // 6
  tap(); overlays.A.setOpen(true); await settle();
  tap(); overlays.B.setOpen(true); await settle();
  overlays.B.onBack = () => undefined;
  const aCalls = overlays.A.calls, bCalls = overlays.B.calls;
  await pressBack();
  assert.ok(onOverlayEntry());
  await pressBack();                                 // straight away, no waiting
  assert.equal(overlays.B.calls, bCalls + 2, 'the asking window is still the one on top');
  assert.equal(overlays.A.calls, aCalls, 'the window below was not closed');
  overlays.B.onBack = null;
  await pressBack(); assert.equal(overlays.B.open, false); assert.equal(overlays.A.open, true);
  await pressBack(); assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('With another window below, a window that asks first stays on top, even for a quick second Back');

  // 7
  assert.equal(mod.handOverBackStep(), false);
  assert.ok(atHome(), 'nothing changes when no window is open');
  tap(); overlays.A.setOpen(true); await settle();
  const replace = mod.handOverBackStep();
  assert.equal(replace, true);
  router.navigate('/Orders', { replace });
  overlays.A.setOpen(false); await sleep(80);       // the menu closes as the new page opens
  assert.equal(router.location.pathname, '/Orders');
  assert.ok(!onOverlayEntry());
  assert.equal(win.history.state.idx, home.idx + 1, 'the new page counts the page behind it (in-page back buttons use this)');
  await pressBack();
  assert.ok(atHome(), 'one Back returns to the page the window was opened on');
  passed('A link in a window (phone menu, notifications) hands over its Back step: one Back returns to where it was opened');

  // 8
  tap(); overlays.A.setOpen(true); await settle();
  router.navigate('/Products');                      // a link that does not hand over
  await settle();
  overlays.A.setOpen(false); await sleep(80);
  assert.equal(router.location.pathname, '/Products', 'closing the window does not undo the new page');
  await pressBack(); await sleep(60);
  assert.ok(atHome(), 'one Back returns: the step left behind is skipped');
  passed('A page opened from a window without handing over: closing leaves it; one Back returns (leftover step skipped)');

  // 9
  for (const [kind, body] of [['dialog', 'DIALOG-BODY'], ['sheet', 'SHEET-BODY'], ['alert', 'ALERT-BODY']]) {
    tap(); ui[kind].setOpen(true); await settle();
    assert.ok(text().includes(body), kind + ' opened');
    assert.ok(onOverlayEntry());
    await pressBack();
    assert.equal(ui[kind].open, false, kind + ' closed by Back');
    assert.ok(!text().includes(body), kind + ' gone from the screen');
    assert.ok(atHome());
  }
  passed('Shared Dialog, Sheet and AlertDialog all close on Back');

  // 10
  tap(); ui.sheet.setOpen(true); await settle();
  tap(); ui.dialog.setOpen(true); await settle();
  await pressBack();
  assert.equal(ui.dialog.open, false); assert.equal(ui.sheet.open, true);
  assert.ok(onOverlayEntry());
  await pressBack();
  assert.equal(ui.sheet.open, false);
  assert.ok(atHome());
  passed('A dialog over a sheet: Back closes the dialog, then the sheet');

  // 11
  tap(); ui.dialog.setOpen(true); await settle();
  ui.dialog.setOpen(false); await sleep(80);
  assert.ok(atHome());
  passed('Closing a shared dialog with its own button removes its Back step');

  // 12
  const extra = win.document.createElement('div');
  win.document.body.appendChild(extra);
  const extraRoot = createRoot(extra);
  extraRoot.render(h(mod.Dialog, { defaultOpen: true },
    h(mod.DialogContent, { 'aria-describedby': undefined }, h(mod.DialogTitle, null, 'Info'), h('p', null, 'SELF-MANAGED'))));
  await settle();
  assert.ok(text().includes('SELF-MANAGED'));
  assert.ok(!onOverlayEntry(), 'a dialog that manages itself (no onOpenChange) adds no Back step');
  extraRoot.unmount(); extra.remove();
  await settle(); assert.ok(atHome());
  passed('Dialogs that manage their own open state are left as they were (no Back step added)');

  // ---- Phase 2 ----
  // 13
  const lengthBeforeSteps = win.history.length;
  tap(); flow.setStep(1); await settle();
  tap(); flow.setStep(2); await settle();
  tap(); flow.setStep(3); await settle();
  assert.ok(onOverlayEntry());
  for (const expected of [2, 1]) {
    await pressBack();
    assert.equal(flow.step, expected);
    assert.ok(onOverlayEntry(), 'Back stays armed while there are earlier steps');
  }
  await pressBack();
  assert.equal(flow.step, 0);
  assert.ok(atHome(), 'from the first step on, Back leaves the page as normal');
  assert.ok(win.history.length <= lengthBeforeSteps + 1, 'only ever one extra Back step, however many steps');
  passed('Step-by-step screens: Back goes to the previous step each time, then works as normal from the first step');

  // 14
  // A page added and Back pressed: no step to move back onto, and the last tap came
  // before that Back, so a window that now opens by itself must wait for a tap.
  router.navigate('/Orders'); await settle();
  await pressBack();
  assert.ok(atHome());
  const lengthBeforeAuto = win.history.length;
  overlays.A.setOpen(true); await settle();
  assert.ok(!onOverlayEntry(), 'no Back step without a tap (Android would skip the whole page)');
  assert.equal(win.history.length, lengthBeforeAuto);
  tap(); await settle();
  assert.ok(onOverlayEntry(), 'the Back step is added at the next tap');
  await pressBack();
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('A window that opens without a tap gets its Back step at the next tap (no history added without one)');

  // 14b: opening windows again and again reuses one step (history doesn't grow)
  const lengthBeforeReuse = win.history.length;
  for (let i = 0; i < 3; i++) {
    tap(); overlays.A.setOpen(true); await settle();
    assert.ok(onOverlayEntry());
    if (i % 2) { await pressBack(); } else { overlays.A.setOpen(false); await sleep(80); }
    assert.equal(overlays.A.open, false);
    assert.ok(atHome());
  }
  assert.ok(win.history.length <= lengthBeforeReuse + 1, 'one step at most');
  passed('Opening and closing windows again and again reuses one Back step: history does not grow');

  // 15
  const backCalls = [];
  const realBack = win.history.back;
  win.history.back = () => backCalls.push('back');
  const click = () => { const e = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; mod.backToSellio(e); return e.defaultPrevented; };
  try {
    win.history.replaceState({ ...win.history.state, idx: 3 }, '');
    assert.equal(click(), true);
    win.history.replaceState({ ...win.history.state, idx: home.idx }, '');
    assert.equal(click(), false, 'opened directly: the link opens the home page as before');
    Object.defineProperty(win.document, 'referrer', { value: 'https://sellio.apptelier.sg/Auth', configurable: true });
    assert.equal(click(), true, 'opened from a link on a Sellio page');
    Object.defineProperty(win.document, 'referrer', { value: 'https://www.google.com/', configurable: true });
    assert.equal(click(), false, 'opened from a search result');
    assert.deepEqual(backCalls, ['back', 'back']);
  } finally {
    win.history.back = realBack;
    delete win.document.referrer;
  }
  assert.ok(atHome());
  passed('Privacy / Terms "Back to Sellio" returns to the Sellio page it was opened from; opened directly, it opens the home page');

  // 16 (last: it replaces the home entry, as finishing a setup replaces its page)
  tap(); flow.setStep(1); await settle();
  tap(); flow.setStep(2); await settle();
  assert.ok(onOverlayEntry());
  const lengthAtFinish = win.history.length;
  await mod.removeBackStep();
  assert.ok(!onOverlayEntry());
  assert.equal(win.history.state.key, home.key, 'back on the page\'s own entry');
  router.navigate('/Done', { replace: true });
  flow.setStep(0);                                   // the flow goes away with its page
  await sleep(120);
  assert.equal(router.location.pathname, '/Done');
  assert.ok(!onOverlayEntry());
  assert.equal(win.history.state.idx, home.idx, 'the finished flow\'s entry was replaced, not stacked on');
  assert.ok(win.history.length <= lengthAtFinish);
  passed('Finishing a flow takes its Back step off first, so Back from the next page skips the finished flow');

  // 17
  assert.ok(stepPushes.length > 0);
  assert.deepEqual(stepPushes.filter(p => !p.afterTap), [], 'every Back step was added straight after a tap');
  passed(`All ${stepPushes.length} Back steps were added straight after a tap (none after a Back without one)`);

  // 18: the app's code uses these pieces as tested here
  const layout = await readFile('src/Layout.jsx', 'utf8');
  assert.doesNotMatch(layout, /aria-label="Back"/, 'no on-screen back arrow in the header');
  assert.match(layout, /navigate\(createPageUrl\(item\.page\), \{ replace: handOverBackStep\(\) \}\)/);
  assert.match(layout, /useBackToClose\(mobileOpen, \(\) => setMobileOpen\(false\)\)/);
  const wiring = {
    'src/pages/ShopSetup.jsx': [/useBackToClose\(step > 0,/, /if \(finishing\) return false;/, /await removeBackStep\(\);[^\n]*\n\s*navigate\(createPageUrl\('Dashboard'\), \{ replace: true \}\)/, /replace: handOverBackStep\(\)/],
    'src/pages/Onboarding.jsx': [/useBackToClose\(currentStep > 1,/, /await removeBackStep\(\);\s*navigate\(createPageUrl\('Dashboard'\), \{ replace: true \}\)/],
    'src/components/onboarding/Step5Confirmation.jsx': [/useBackToClose\(isLaunching, \(\) => false\)/, /await onComplete\(\)/],
    'src/pages/Join.jsx': [/useBackToClose\(stage === 'sent',/],
    'src/pages/Auth.jsx': [/useBackToClose\(forgotMode && forgotStep !== 3, leaveForgotPassword\)/, /onClick=\{leaveForgotPassword\}/],
    'src/pages/KitchenDisplay.jsx': [/useBackToClose\(isFullscreen, handleExit\)/],
    'src/components/explore/ExploreMe.jsx': [/<Link to="\/privacy"/, /<Link to="\/terms"/],
    'src/components/legal/LegalPage.jsx': [/className="sellio-legal-back" onClick=\{backToSellio\}/],
  };
  for (const [file, patterns] of Object.entries(wiring)) {
    const source = await readFile(file, 'utf8');
    for (const pattern of patterns) assert.match(source, pattern, file);
  }
  for (const file of ['dialog', 'sheet', 'alert-dialog']) {
    assert.match(await readFile(`src/components/ui/${file}.jsx`, 'utf8'), /useBackToClose\(open !== undefined && !!open && typeof onOpenChange === "function"/);
  }
  passed('Layout (no header arrow), the shared dialogs, the step-by-step screens, Kitchen full screen and Privacy/Terms are wired to these rules');

  console.log(`\nAll ${passes} back-navigation checks passed.`);
} catch (err) {
  console.error('FAIL', err);
  process.exitCode = 1;
} finally {
  try { root?.unmount(); } catch { /* ignore */ }
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
