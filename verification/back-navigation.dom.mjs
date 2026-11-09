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
// What the pickers (Select, menus, popovers) use that jsdom leaves out.
win.Element.prototype.scrollIntoView ||= function scrollIntoView() {};
win.Element.prototype.hasPointerCapture ||= function hasPointerCapture() { return false; };
win.Element.prototype.releasePointerCapture ||= function releasePointerCapture() {};
globalThis.ResizeObserver = win.ResizeObserver ||= class ResizeObserver { observe() {} unobserve() {} disconnect() {} };

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
    export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
    export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
    export { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
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
const pressBack = async () => { win.history.back(); await sleep(120); };   // a later task, as in a browser
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
  overlays.A.setOpen(false); await sleep(160);
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
  overlays.A.setOpen(false); await sleep(160);       // the menu closes as the new page opens
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
  overlays.A.setOpen(false); await sleep(160);
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
  ui.dialog.setOpen(false); await sleep(160);
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

  // 12b: lists, menus and popovers (Select, DropdownMenu, Popover), whether a parent
  // controls them or not: Back closes the open one and stays on the page.
  {
    const pickers = win.document.createElement('div');
    win.document.body.appendChild(pickers);
    const pickersRoot = createRoot(pickers);
    const state = {};
    function Pickers() {
      const [popOpen, setPopOpen] = React.useState(false);
      const [value, setValue] = React.useState('a');
      const [dialogOpen, setDialogOpen] = React.useState(false);
      Object.assign(state, { popOpen, setPopOpen, value, dialogOpen, setDialogOpen });
      const select = (id) => h(mod.Select, { value, onValueChange: setValue },
        h(mod.SelectTrigger, { 'data-testid': id }, h(mod.SelectValue)),
        h(mod.SelectContent, null, h(mod.SelectItem, { value: 'a' }, 'Option A'), h(mod.SelectItem, { value: 'b' }, 'Option B')));
      return h('div', null,
        select('select'),
        h(mod.DropdownMenu, null, h(mod.DropdownMenuTrigger, { 'data-testid': 'menu' }, 'More'),
          h(mod.DropdownMenuContent, null, h(mod.DropdownMenuItem, null, 'MENU-ITEM'))),
        h(mod.Popover, null, h(mod.PopoverTrigger, { 'data-testid': 'pop' }, 'Filter'), h(mod.PopoverContent, null, 'POP-BODY')),
        h(mod.Popover, { open: popOpen, onOpenChange: setPopOpen }, h(mod.PopoverTrigger, null, 'Bell'), h(mod.PopoverContent, null, 'BELL-BODY')),
        h(mod.Popover, { open: true }, h(mod.PopoverTrigger, null, 'Fixed'), h(mod.PopoverContent, null, 'FIXED-BODY')),
        h(mod.Dialog, { open: dialogOpen, onOpenChange: setDialogOpen },
          h(mod.DialogContent, { 'aria-describedby': undefined }, h(mod.DialogTitle, null, 'Edit'), select('select-in-dialog'))));
    }
    pickersRoot.render(h(Pickers));
    await settle();
    assert.ok(text().includes('FIXED-BODY'));
    assert.ok(!onOverlayEntry(), 'held open by its parent with no way to close it: no Back step');
    const el = id => win.document.querySelector(`[data-testid="${id}"]`);
    const press = (node, type) => node.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    const listOpen = () => !!win.document.querySelector('[role="listbox"]');
    // A list (Select), opened and closed with Back: nothing chosen.
    tap(); press(el('select'), 'click'); await settle();
    assert.ok(listOpen(), 'the list opened');
    assert.ok(onOverlayEntry(), 'a Back step while the list is open');
    await pressBack(); await settle();
    assert.ok(!listOpen(), 'Back closed the list');
    assert.equal(state.value, 'a', 'nothing was chosen');
    assert.ok(atHome());
    // Choosing an option closes it and takes its Back step away.
    tap(); press(el('select'), 'click'); await settle();
    assert.ok(onOverlayEntry());
    const optionB = [...win.document.querySelectorAll('[role="option"]')].find(o => o.textContent.includes('Option B'));
    tap(); press(optionB, 'click'); await sleep(200);
    assert.equal(state.value, 'b');
    assert.ok(!listOpen());
    assert.ok(atHome(), 'choosing an option removes the Back step');
    // A menu (DropdownMenu opens as the finger goes down).
    tap(); press(el('menu'), 'pointerdown'); await settle();
    assert.ok(text().includes('MENU-ITEM'), 'the menu opened');
    assert.ok(onOverlayEntry());
    await pressBack(); await settle();
    assert.ok(!text().includes('MENU-ITEM'), 'Back closed the menu');
    assert.ok(atHome());
    // A popover no parent controls.
    tap(); press(el('pop'), 'click'); await settle();
    assert.ok(text().includes('POP-BODY'));
    assert.ok(onOverlayEntry());
    await pressBack(); await settle();
    assert.ok(!text().includes('POP-BODY'), 'Back closed the popover');
    assert.ok(atHome());
    // A popover its parent controls (the notification bell): closes through onOpenChange.
    tap(); state.setPopOpen(true); await settle();
    assert.ok(text().includes('BELL-BODY'));
    assert.ok(onOverlayEntry());
    await pressBack(); await settle();
    assert.equal(state.popOpen, false);
    assert.ok(!text().includes('BELL-BODY'));
    assert.ok(atHome());
    // A list inside a dialog: Back closes the list, then the dialog.
    tap(); state.setDialogOpen(true); await settle();
    tap(); press(el('select-in-dialog'), 'click'); await settle();
    assert.ok(listOpen());
    await pressBack(); await settle();
    assert.ok(!listOpen(), 'the list closed first');
    assert.equal(state.dialogOpen, true, 'the dialog stays open');
    assert.ok(onOverlayEntry(), 'Back is armed again for the dialog');
    await pressBack(); await settle();
    assert.equal(state.dialogOpen, false);
    assert.ok(atHome());
    pickersRoot.unmount(); pickers.remove();
    await settle(); assert.ok(atHome());
    passed('Lists, menus and popovers (with or without a parent controlling them) close on Back; choosing an option takes the Back step away; in a dialog, the list closes first');
  }

  // ---- Direct Android wrapper Back (does not depend on a WebView history traversal) ----
  assert.equal(typeof win.__sellioHandleAndroidBack, 'function');
  assert.equal(mod.handleAndroidBack(), false, 'without overlays, native handles page Back/exit');
  tap(); overlays.A.setOpen(true); await settle();
  tap(); overlays.B.setOpen(true); await settle();
  assert.equal(win.__sellioHandleAndroidBack(), true);
  await settle();
  assert.equal(overlays.B.open, false, 'direct native Back closes only the newest overlay');
  assert.equal(overlays.A.open, true);
  assert.ok(onOverlayEntry(), 'the existing history entry remains for the other overlay');
  const hardwareEvent = new win.Event('backbutton', { bubbles: true, cancelable: true });
  win.document.dispatchEvent(hardwareEvent);
  await settle();
  assert.ok(hardwareEvent.defaultPrevented, 'Cordova-style native event is consumed');
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  const unusedBack = new win.Event('backbutton', { cancelable: true });
  win.document.dispatchEvent(unusedBack);
  assert.equal(unusedBack.defaultPrevented, false, 'native retains ordinary Back/exit');
  passed('Android native Back closes nested overlays directly and falls back on a bare page');

  overlays.A.onBack = () => false; // Busy, or an unsaved editor requiring confirmation.
  tap(); overlays.A.setOpen(true); await settle();
  assert.equal(mod.handleAndroidBack(), true);
  await settle();
  assert.equal(overlays.A.open, true, 'busy editor does not disappear on native Back');
  overlays.A.onBack = null;
  const customBack = new win.Event('sellio:android-back', { cancelable: true });
  win.dispatchEvent(customBack);
  await settle();
  assert.equal(customBack.defaultPrevented, true);
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('Android native Back respects busy/unsaved windows and accepts explicit bridge events');

  // Native Back also navigates app-owned routes rather than relying on the
  // wrapper's potentially stale canGoBack flag after an app switch.
  tap(); router.navigate('/Products'); await settle();
  tap(); router.navigate('/Orders'); await settle();
  assert.equal(router.location.pathname, '/Orders');
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  assert.equal(mod.handleAndroidBack(), true, 'Sellio handles route Back after app resume');
  await settle();
  assert.equal(router.location.pathname, '/Products');
  assert.equal(mod.handleAndroidBack(), true, 'Sellio handles another page Back');
  await settle();
  assert.ok(atHome());
  assert.equal(mod.handleAndroidBack(), false, 'the root route is left to native exit handling');
  passed('Native Back navigates across app routes after resume without checking WebView.canGoBack');

  // Simulate the WebView restoring a different current entry while JS stays mounted.
  // The browser history guard must notice and recover instead of leaving armed=true
  // for a no-longer-existent Back step.
  tap(); overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry());
  win.history.replaceState({ ...win.history.state, sellioOverlay: false }, '');
  assert.ok(!onOverlayEntry());
  win.ReactNativeWebView = { postMessage() {} };
  Object.defineProperty(win.navigator, 'userAgent', { configurable: true, value: 'Android WebView' });
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  await settle();
  // If a fresh tap preceded resume, the manager may safely restore its history
  // entry. Otherwise it waits for another tap. Either way the native callback
  // must close the editor immediately without consulting WebView.canGoBack.
  assert.equal(win.location.pathname, '/Dashboard', 'resume keeps the current page');
  assert.equal(mod.handleAndroidBack(), true, 'native Back closes the editor immediately after resume');
  await settle();
  assert.equal(overlays.A.open, false);
  tap(); overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry(), 'next tap re-enables ordinary history-backed Back');
  await pressBack();
  assert.equal(overlays.A.open, false);
  assert.ok(atHome() || !onOverlayEntry());
  delete win.ReactNativeWebView;
  delete win.navigator.userAgent;
  passed('Android resume repairs a stale history entry while the editor remains mounted');

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
    if (i % 2) { await pressBack(); } else { overlays.A.setOpen(false); await sleep(160); }
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

  // 17b: the guard for the whole app. The person's Back (the browser's, not the page's own
  // history.back()) makes the browser stop honouring earlier taps; an entry added after it
  // without a new tap would make Android skip the page's whole history. It takes the
  // current entry's place instead. A finger scroll (touchend) or Escape is not a tap.
  const personsBack = async () => { win.History.prototype.back.call(win.history); await sleep(120); };
  const go = async (to, withTap) => { if (withTap) tap(); router.navigate(to); await settle(); };
  const path = () => win.location.pathname;
  for (const [label, notATap] of [['nothing', null], ['a finger scroll', 'touchend'], ['Escape', 'Escape']]) {
    const start = path();
    await go('/guard-1', true);
    await go('/guard-2', true);
    await personsBack();
    assert.equal(path(), '/guard-1');
    if (notATap === 'touchend') win.dispatchEvent(new win.Event('touchend'));
    if (notATap === 'Escape') win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    await go('/guard-3', false); // the page navigates with no tap since the Back
    assert.equal(path(), '/guard-3');
    await personsBack();
    assert.equal(path(), start, `after ${label}: the new page took /guard-1's place, so Back goes to the page before it`);
  }
  await go('/guard-4', true);
  await go('/guard-5', true);
  await pressBack(); // the page's own Back (an in-page back button): earlier taps still count
  assert.equal(path(), '/guard-4');
  await go('/guard-6', false);
  await personsBack();
  assert.equal(path(), '/guard-4', 'added normally after the page\'s own Back');
  await go('/guard-7', true);
  await go('/guard-8', true);
  await personsBack();
  await go('/guard-9', true); // a tap after the Back: added normally
  await personsBack();
  assert.equal(path(), '/guard-7');
  passed('No entry is ever added without a tap since the person\'s Back (it takes the current one\'s place); a finger scroll or Escape is not a tap; the page\'s own Back keeps earlier taps');

  // 18: the app's code uses these pieces as tested here
  const layout = await readFile('src/Layout.jsx', 'utf8');
  assert.doesNotMatch(layout, /aria-label="Back"/, 'no on-screen back arrow in the header');
  // (A menu item's address: its own (a home shop's Chats: /explore/chats) or its page's.)
  assert.match(layout, /const to = item\.to \|\| createPageUrl\(item\.page\);/);
  assert.match(layout, /if \(to !== window\.location\.pathname \+ window\.location\.search\) navigate\(to, \{ replace: handOverBackStep\(\) \}\);\s*onNavigate\(\);/,
    'a menu link hands over its Back step; the page already open just closes the menu');
  // The phone menu and trial reminder only count as open while the workspace shows them.
  assert.match(layout, /useBackToClose\(mobileOpen && workspaceShown, \(\) => setMobileOpen\(false\)\)/);
  // (The trial reminder can be closed by Back when it can be closed at all: in the last 12 hours
  // only in Sellio's apps, which have no Choose a Plan.)
  assert.match(layout, /const trialReminderClosable = canDismissTrialModal \|\| !sellsPlans\(\);\s*useBackToClose\(showTrialModal && trialReminderClosable && workspaceShown, dismissTrialModal\)/);
  assert.match(layout, /!publicPages\.includes\(currentPageName\)/);
  const wiring = {
    'src/pages/ShopSetup.jsx': [/useBackToClose\(step > 0,/, /if \(finishing\) return false;/, /await removeBackStep\(\);[^\n]*\n\s*navigate\(createPageUrl\('Dashboard'\), \{ replace: true \}\)/, /replace: handOverBackStep\(\)/],
    'src/pages/Onboarding.jsx': [/useBackToClose\(currentStep > 1,/, /await removeBackStep\(\);\s*navigate\(createPageUrl\('Dashboard'\), \{ replace: true \}\)/],
    'src/components/onboarding/Step5Confirmation.jsx': [/useBackToClose\(isLaunching, \(\) => false\)/, /await onComplete\(\)/],
    'src/pages/Join.jsx': [/useBackToClose\(stage === 'sent',/],
    'src/pages/Auth.jsx': [/useBackToClose\(forgotMode && forgotStep !== 3, leaveForgotPassword\)/, /onClick=\{leaveForgotPassword\}/],
    'src/pages/KitchenDisplay.jsx': [/useBackToClose\(isFullscreen, handleExit\)/],
    'src/components/explore/ExploreMe.jsx': [/<Link to="\/privacy"/, /<Link to="\/terms"/],
    'src/components/legal/LegalPage.jsx': [/className="sellio-legal-back" onClick=\{backToSellio\}/],
    // Windows built without the shared dialogs: each closes on Back, like its own ✕.
    'src/components/auth/AuthPricingModal.jsx': [/useBackToClose\(true, onClose\)/],
    'src/components/onboarding/ImageEditModal.jsx': [/useBackToClose\(true, onClose\)/],
    'src/components/onboarding/EditItemModal.jsx': [/useBackToClose\(true, onClose\)/],
    'src/components/stocktake/SupplierPickerModal.jsx': [/useBackToClose\(!!open, onClose\);[^\n]*\n\s*if \(!open\) return null;/],
    'src/components/onboarding/Step1Combined.jsx': [/useBackToClose\(showColorPicker, \(\) => setShowColorPicker\(false\)\)/],
    'src/components/onboarding/Step4TablesQR.jsx': [/useBackToClose\(!!selectedQR && qrModalOpen,/],
    'src/components/settings/PrinterSettings.jsx': [/useBackToClose\(showScanSheet, \(\) => \{ stopScan\(\); setShowScanSheet\(false\); \}\)/],
    'src/components/profile/AccountProfileModal.jsx': [/useBackToClose\(!!open, onClose\);\s*if \(!open\) return null;/],
    // The store designer: Back folds its open design controls first, then leaves (asking
    // only when there are real unsaved changes).
    'src/components/storefront/StorefrontDesigner.jsx': [/useBackToClose\(drawerExpanded, \(\) => snapDrawer\(DRAWER_HANDLE_ONLY\)\)/, /const dirty = !!savedForm && !sameDesign\(form, savedForm\);/],
    // A store's checkout: like its ✕, Back waits while the order is being placed (also one
    // opened from Explore's Buy now, which otherwise has no Back step of its own).
    'src/pages/Storefront.jsx': [/useBackToClose\(showCheckout && \(!checkoutFromLink \|\| isSubmitting\), \(\) => \{ if \(isSubmitting\) return false; setShowCheckout\(false\); \}\)/],
  };
  // The Kitchen Display's chit preview, per order card.
  assert.match(await readFile('src/pages/KitchenDisplay.jsx', 'utf8'), /useBackToClose\(showChit, \(\) => \{ if \(chitPrinting\) return false; setShowChit\(false\); \}\)/);
  for (const [file, patterns] of Object.entries(wiring)) {
    const source = await readFile(file, 'utf8');
    for (const pattern of patterns) assert.match(source, pattern, file);
  }
  for (const file of ['dialog', 'sheet', 'alert-dialog']) {
    assert.match(await readFile(`src/components/ui/${file}.jsx`, 'utf8'), /useBackToClose\(open !== undefined && !!open && typeof onOpenChange === "function"/);
  }
  for (const file of ['select', 'dropdown-menu', 'popover']) {
    assert.match(await readFile(`src/components/ui/${file}.jsx`, 'utf8'), /useOpenWithBack\(open, defaultOpen, onOpenChange\)/);
  }
  passed('Layout (no header arrow), the shared dialogs, the step-by-step screens, Kitchen full screen and Privacy/Terms are wired to these rules');

  // ---- Base44's Android app: the page tells the app about its history again ----
  {
    // A report is the current entry replaced by itself (same state, same address).
    const reports = [];
    const replaceNow = win.history.replaceState;
    win.history.replaceState = function replaceState(state, title, url) {
      if (state === win.history.state && url === undefined) reports.push(Date.now());
      return replaceNow.call(this, state, title, url);
    };
    const asApp = (on) => {
      if (on) {
        win.ReactNativeWebView = { postMessage() {} };
        Object.defineProperty(win.navigator, 'userAgent', { configurable: true,
          value: 'Mozilla/5.0 (Linux; Android 16; CPH2671 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36' });
      } else {
        delete win.ReactNativeWebView;
        delete win.navigator.userAgent;   // jsdom's own again
      }
    };
    const fileInput = win.document.createElement('input');
    fileInput.type = 'file';
    win.document.body.appendChild(fileInput);
    const comeBack = () => win.document.dispatchEvent(new win.Event('visibilitychange'));
    const allSoon = () => sleep(2200);
    let popstates = 0;
    const countPops = () => { popstates += 1; };
    win.addEventListener('popstate', countPops);

    // In a browser: nothing extra.
    comeBack(); win.dispatchEvent(new win.Event('focus'));
    fileInput.dispatchEvent(new win.Event('change', { bubbles: true })); tap();
    await allSoon();
    assert.equal(reports.length, 0, 'browsers decide Back themselves: no reports');

    asApp(true);
    const length1 = win.history.length;
    // Where the page is: its address, its history entry and react-router's page.
    const where = () => JSON.stringify([win.location.href, win.history.state, router.location.pathname]);
    const here = where();
    assert.ok(!onOverlayEntry());
    // Back from the background / a picker / a native dialog: reported now and twice more.
    for (const [what, fire] of [
      ['coming back from the background', comeBack],
      ['choosing a photo', () => fileInput.dispatchEvent(new win.Event('change', { bubbles: true }))],
      ['cancelling the picker', () => fileInput.dispatchEvent(new win.Event('cancel', { bubbles: true }))],
      ['the app window getting focus back', () => win.dispatchEvent(new win.Event('focus'))],
    ]) {
      reports.length = 0;
      fire(); await allSoon();
      assert.equal(reports.length, 3, what);
      assert.equal(where(), here, 'nothing moves: ' + what);
    }
    assert.equal(win.history.length, length1, 'reports add no history');
    assert.equal(popstates, 0, 'reports are not Back or Forward');
    // At taps, at most every 1.5 s.
    reports.length = 0;
    tap(); tap(); await sleep(300); tap(); tap(); await settle();
    assert.equal(reports.length, 1, 'one report for a burst of taps');
    await sleep(1600); tap(); await settle();
    assert.equal(reports.length, 2, 'and another after 1.5 s');

    // With a window open, a report keeps its Back step, and Back still closes it.
    tap(); overlays.A.setOpen(true); await settle();
    assert.ok(onOverlayEntry());
    reports.length = 0;
    comeBack(); await allSoon();
    assert.equal(reports.length, 3);
    assert.ok(onOverlayEntry(), 'still on the Back step');
    await pressBack();
    assert.equal(overlays.A.open, false);
    assert.equal(where(), here, 'Back closed it and stayed on the page');
    const length2 = win.history.length;

    // A window closed by its own button while reports are due: its Back step still goes.
    await sleep(1600);
    tap(); overlays.A.setOpen(true); await settle();
    overlays.A.setOpen(false); comeBack();
    await allSoon();
    assert.equal(where(), here, 'the Back step was taken away as usual');
    assert.equal(win.history.length, length2, 'no extra history');

    win.removeEventListener('popstate', countPops);
    fileInput.remove();
    asApp(false);
    win.history.replaceState = replaceNow;
    passed('Android app: coming back from the background, a photo picker or a native dialog (and taps) tells the app about the page\'s history again, changing nothing; browsers are left alone');
  }

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
