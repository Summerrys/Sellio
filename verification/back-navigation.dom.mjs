// Phone / browser Back (Android back button, back swipe): closes the top window, hands
// its Back step to a page opened from inside it, and the header's back arrow knows when
// there is a page to go back to. Real react-router (BrowserRouter) and the shared
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
    export { headerBack, HEADER_PARENT_PAGES } from '@/lib/headerBack';
    export { goBack } from '@/lib/goBack';
  ` },
  outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, logLevel: 'silent',
});
const local = path.join(process.cwd(), '.back-navigation-bundle.mjs');
await copyFile(outfile, local);
const mod = await import(pathToFileURL(local));

const h = React.createElement;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = () => sleep(40);
const pressBack = async () => { win.history.back(); await sleep(60); };   // a later task, as in a browser
const onOverlayEntry = () => !!win.history.state?.sellioOverlay;
const text = () => win.document.body.textContent;

let passes = 0;
const passed = name => { passes++; console.log('PASS ' + name); };
let root;
try {
  // ---- The header's back arrow (pure rules), before any page is mounted ----
  const tabs = ['Dashboard', 'Orders', 'Products', 'Me'];
  assert.deepEqual(mod.headerBack('Dashboard', tabs, { idx: 0 }), { show: false, fallbackPage: 'Dashboard' });
  assert.equal(mod.headerBack('Orders', tabs, { idx: 3 }).show, true);
  assert.equal(mod.headerBack('Orders', tabs, null).show, false);
  passed('Header arrow: hidden on a main tab page opened directly; shown once there is an earlier Sellio page');
  assert.deepEqual(mod.headerBack('Categories', tabs, { idx: 0 }), { show: true, fallbackPage: 'Products' });
  assert.deepEqual(mod.headerBack('Inventory', tabs, {}), { show: true, fallbackPage: 'Products' });
  assert.deepEqual(mod.headerBack('Settings', tabs, { idx: 0 }), { show: true, fallbackPage: 'Dashboard' });
  passed('Header arrow: always on sub-pages; opened directly, it goes up to the parent page (Categories/Inventory -> Products, others -> Dashboard)');

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
    h(Shared, { kind: 'dialog' }), h(Shared, { kind: 'sheet' }), h(Shared, { kind: 'alert' })));
  await settle();
  const home = win.history.state;
  assert.equal(home.idx, 0);
  assert.equal(router.location.pathname, '/Dashboard');
  const atHome = () => win.history.state?.key === home.key && !onOverlayEntry() && router.location.pathname === '/Dashboard';

  // 1
  const length0 = win.history.length;
  overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry(), 'a Back step is added while the window is open');
  assert.equal(win.history.length, length0 + 1);
  assert.equal(win.history.state.idx, home.idx, 'react-router sees no new page');
  await pressBack();
  assert.equal(overlays.A.open, false); assert.equal(overlays.A.calls, 1);
  assert.ok(atHome(), 'still on the same page, on its own history entry');
  await settle(); assert.ok(atHome());
  passed('Back closes an open window and stays on the page');

  // 2
  overlays.A.setOpen(true); await settle();
  assert.ok(onOverlayEntry());
  overlays.A.setOpen(false); await sleep(80);
  assert.ok(atHome(), 'the extra Back step is removed again');
  assert.equal(overlays.A.calls, 1, 'closing with its own button does not run the Back handler');
  overlays.A.setOpen(true); await settle();
  await pressBack();
  assert.equal(overlays.A.open, false); assert.equal(overlays.A.calls, 2);
  assert.ok(atHome());
  passed('Closing a window with its own button removes its Back step (Back then works normally next time)');

  // 3
  overlays.A.setOpen(true); await settle();
  overlays.B.setOpen(true); await settle();
  await pressBack();
  assert.equal(overlays.B.open, false); assert.equal(overlays.A.open, true);
  assert.ok(onOverlayEntry(), 'Back is armed again for the window still open');
  await pressBack();
  assert.equal(overlays.A.open, false);
  assert.ok(atHome());
  passed('Two windows: Back closes the newest first, then the one below');

  // 4
  overlays.A.onBack = () => false;          // e.g. saving or printing
  overlays.A.setOpen(true); await settle();
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
  overlays.A.setOpen(true); await settle();
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
  overlays.A.setOpen(true); await settle();
  overlays.B.setOpen(true); await settle();
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
  overlays.A.setOpen(true); await settle();
  const replace = mod.handOverBackStep();
  assert.equal(replace, true);
  router.navigate('/Orders', { replace });
  overlays.A.setOpen(false); await sleep(80);       // the menu closes as the new page opens
  assert.equal(router.location.pathname, '/Orders');
  assert.ok(!onOverlayEntry());
  assert.equal(win.history.state.idx, home.idx + 1, 'the new page counts the page behind it');
  assert.equal(mod.headerBack('Orders', tabs).show, true, 'so the header shows its back arrow');
  await pressBack();
  assert.ok(atHome(), 'one Back returns to the page the window was opened on');
  passed('A link in a window (phone menu, notifications) hands over its Back step: one Back returns, header arrow shows');

  // 8
  overlays.A.setOpen(true); await settle();
  router.navigate('/Products');                      // a link that does not hand over
  await settle();
  overlays.A.setOpen(false); await sleep(80);
  assert.equal(router.location.pathname, '/Products', 'closing the window does not undo the new page');
  await pressBack(); await pressBack();
  assert.ok(atHome());
  passed('A page opened from a window without handing over is left alone when the window closes');

  // 9
  for (const [kind, body] of [['dialog', 'DIALOG-BODY'], ['sheet', 'SHEET-BODY'], ['alert', 'ALERT-BODY']]) {
    ui[kind].setOpen(true); await settle();
    assert.ok(text().includes(body), kind + ' opened');
    assert.ok(onOverlayEntry());
    await pressBack();
    assert.equal(ui[kind].open, false, kind + ' closed by Back');
    assert.ok(!text().includes(body), kind + ' gone from the screen');
    assert.ok(atHome());
  }
  passed('Shared Dialog, Sheet and AlertDialog all close on Back');

  // 10
  ui.sheet.setOpen(true); await settle();
  ui.dialog.setOpen(true); await settle();
  await pressBack();
  assert.equal(ui.dialog.open, false); assert.equal(ui.sheet.open, true);
  assert.ok(onOverlayEntry());
  await pressBack();
  assert.equal(ui.sheet.open, false);
  assert.ok(atHome());
  passed('A dialog over a sheet: Back closes the dialog, then the sheet');

  // 11
  ui.dialog.setOpen(true); await settle();
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

  // 13: the app's code uses these pieces as tested here
  const layout = await readFile('src/Layout.jsx', 'utf8');
  assert.match(layout, /headerBack\(currentPageName, shopTabPages\)/);
  assert.match(layout, /goBack\(navigate, createPageUrl\(headerParentPage\)\)/);
  assert.match(layout, /navigate\(createPageUrl\(item\.page\), \{ replace: handOverBackStep\(\) \}\)/);
  assert.match(layout, /useBackToClose\(mobileOpen, \(\) => setMobileOpen\(false\)\)/);
  for (const file of ['dialog', 'sheet', 'alert-dialog']) {
    assert.match(await readFile(`src/components/ui/${file}.jsx`, 'utf8'), /useBackToClose\(open !== undefined && !!open && typeof onOpenChange === "function"/);
  }
  passed('Layout and the shared dialogs are wired to these rules');

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
