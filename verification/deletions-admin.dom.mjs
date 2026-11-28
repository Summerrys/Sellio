// Admin → Deletion requests (/admin/deletions; Alvin, 29 Nov 2026): Sellio's admins see who asked
// for their account to be deleted, and can delete one now (typing DELETE) or restore it; a deleted
// account's leftover files can be removed. Anyone else sees that the page is for admins.
// Run: node verification/deletions-admin.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/admin/deletions', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'history', 'location']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-deletions-admin-'));
const local = path.join(process.cwd(), '.deletions-admin-bundle.mjs');
const mocks = {
  clients: [
    'export const getSupabase = async () => ({',
    '  rpc: async (name, args) => globalThis.rpcHandler(name, args),',
    '  functions: { invoke: async (name, options) => globalThis.invokeHandler(name, options) },',
    '});',
    "export const SUPABASE_URL = 'https://project.example.invalid';",
  ].join('\n'),
  profile: 'export const useAppUser = () => globalThis.appUserState;',
  toast: 'const push = (kind) => (m) => (globalThis.toasts ||= []).push([kind, m]); export const toast = Object.assign(push("info"), { error: push("error"), success: push("success"), warning: push("warning") });',
  tabbar: "export default function TabBar() { return null; } export const TAB_BAR_SPACE = '80px';",
};
const plugin = { name: 'deletions-admin-fixtures', setup(builder) {
  for (const [filter, key] of [[/supabaseClient$/, 'clients'], [/AppUserContext$/, 'profile'], [/^sonner$/, 'toast'], [/ExploreTabBar$/, 'tabbar']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const q = (sel) => document.body.querySelector(sel);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (ms = 0) => { await act(async () => { await sleep(ms); }); };
const click = async (el) => { assert.ok(el, 'button there'); await act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); await settle(); };
const typeInto = async (field, value) => {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new win.Event('input', { bubbles: true })); });
};

const DAY = 86400000;
const soon = new Date(Date.now() + 172 * DAY + 3600000).toISOString();
let list;
const reset = () => {
  list = [
    { id: 'r-wait', status: 'requested', email: 'ail@example.com', name: 'Ailin', phone: null, reason: 'Too busy now',
      requestedAt: '2026-11-20T12:12:48Z', deleteAfter: soon, accountExists: true, staffLocked: 0, stripe: [], leftoverFiles: 0, adminLog: [],
      shops: [{ tenantId: 't-w', name: 'Wanderlust', slug: 'wanderlust', exists: true }] },
    { id: 'r-done', status: 'completed', email: null, name: null, phone: null, requestedAt: '2026-11-28T17:11:05Z', deleteAfter: '2027-05-28T17:11:05Z',
      completedAt: '2026-11-28T17:30:29Z', accountExists: false, staffLocked: 0, stripe: [], leftoverFiles: 15, adminLog: [],
      shops: [{ tenantId: 't-e', name: 'Evenon Malaysia', slug: null, exists: false }] },
    { id: 'r-kept', status: 'reinstated', email: 'mar@example.com', name: 'Marie', requestedAt: '2026-11-16T00:47:17Z', deleteAfter: '2027-05-16T00:47:17Z',
      reinstatedAt: '2026-11-16T11:44:45Z', accountExists: true, staffLocked: 0, stripe: [], leftoverFiles: 0, adminLog: [],
      shops: [{ tenantId: 't-m', name: 'Marie Bakery', slug: 'marie-bakery', exists: true }] },
  ];
};
let invoked = [];
let isAdmin = true;
globalThis.rpcHandler = async (name) => {
  if (name === 'am_i_sellio_admin') return { data: isAdmin, error: null };
  if (name === 'admin_account_deletions') return isAdmin ? { data: list, error: null } : { data: null, error: { code: '42501', message: 'admins only' } };
  return { data: null, error: null };
};
globalThis.invokeHandler = async (name, options) => {
  invoked.push({ name, body: options?.body });
  const { action, requestId } = options.body;
  if (action === 'delete_now') {
    list = list.map((i) => (i.id === requestId ? { ...i, status: 'completed', email: null, name: null, completedAt: new Date().toISOString(),
      adminLog: [{ action: 'delete_now', by: 'leeyq.alvin@gmail.com', at: new Date().toISOString(), ok: true }] } : i));
    return { data: { ok: true, kind: 'deleted' }, error: null };
  }
  if (action === 'restore') return { data: { ok: false, code: 'not_pending' }, error: null };
  if (action === 'remove_files') {
    list = list.map((i) => (i.id === requestId ? { ...i, leftoverFiles: 0 } : i));
    return { data: { ok: true, kind: 'files_removed', removed: 15 }, error: null };
  }
  return { data: null, error: null };
};

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as DeletionsAdmin } from '@/components/admin/DeletionsAdmin';" },
    outfile: path.join(tmp, 'deletions.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'deletions.mjs'), local);
  const { DeletionsAdmin } = await import(pathToFileURL(local));

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const show = async () => { await act(async () => { root.render(React.createElement(DeletionsAdmin)); }); await settle(10); };

  // Not an admin.
  reset(); isAdmin = false; globalThis.appUserState = { appUser: { email: 'someone@example.com' } };
  await show();
  assert.match(text(q('[data-testid="deletions-admin-denied"]')), /for Sellio’s admins/);
  assert.equal(q('[data-testid="deletions-waiting"]'), null);
  passed('anyone but an admin sees that the page is for admins, and no requests');
  await act(async () => { root.render(null); });

  // An admin.
  isAdmin = true; globalThis.appUserState = { appUser: { email: 'leeyq.alvin@gmail.com' } };
  await show();
  const waiting = q('[data-testid="deletions-waiting"]');
  assert.match(text(waiting), /Waiting \(1\)/);
  const card = q('[data-testid="deletion-r-wait"]');
  assert.match(text(card), /Ailin/);
  assert.match(text(card), /Owner of Wanderlust/);
  assert.match(text(card), /deletes \d+ May 2027 \(172 days left\)/);
  assert.match(text(card), /“Too busy now”/);
  const done = q('[data-testid="deletions-done"]');
  assert.match(text(q('[data-testid="deletion-r-done"]')), /Deleted account\s*Evenon Malaysia · deleted 29 Nov 2026/);
  assert.match(text(q('[data-testid="deletion-r-done"]')), /15 files are still in storage/);
  assert.match(text(q('[data-testid="deletion-r-kept"]')), /Marie Bakery · restored 16 Nov 2026/);
  assert.ok(done);
  passed('an admin sees who is waiting (shop, dates, days left, reason) and who was deleted or restored');

  await click(card.querySelector('[data-testid="deletion-delete-now"]'));
  const confirm = card.querySelector('[data-testid="deletion-delete-confirm"]');
  assert.ok(confirm.disabled, 'can’t delete before DELETE is typed');
  assert.match(text(card.querySelector('[data-testid="deletion-confirm-delete"]')), /Wanderlust for good, now.*can’t be undone/);
  await typeInto(card.querySelector('[data-testid="deletion-confirm-input"]'), 'delete');
  assert.ok(card.querySelector('[data-testid="deletion-delete-confirm"]').disabled, 'lower case isn’t enough');
  await typeInto(card.querySelector('[data-testid="deletion-confirm-input"]'), 'DELETE');
  await click(card.querySelector('[data-testid="deletion-delete-confirm"]'));
  await settle(10);
  assert.deepEqual(invoked.at(-1), { name: 'admin-deletions', body: { action: 'delete_now', requestId: 'r-wait', confirmation: 'DELETE' } });
  assert.deepEqual(globalThis.toasts.at(-1), ['success', 'Deleted for good.']);
  assert.match(text(q('[data-testid="deletions-waiting"]')), /Waiting \(0\).*No account is waiting to be deleted/);
  assert.match(text(q('[data-testid="deletion-r-wait"]')), /Deleted now by leeyq.alvin@gmail.com/);
  passed('Delete now asks for DELETE, deletes, and the list shows it deleted, with who did it');

  await click(q('[data-testid="deletion-r-done"] [data-testid="deletion-remove-files"]'));
  await settle(10);
  assert.deepEqual(invoked.at(-1).body, { action: 'remove_files', requestId: 'r-done' });
  assert.deepEqual(globalThis.toasts.at(-1), ['success', 'Removed 15 files.']);
  assert.equal(q('[data-testid="deletion-r-done"] [data-testid="deletion-remove-files"]'), null);
  passed('Remove files removes a deleted account’s leftover files, and the button goes');

  // Restore refused (it was deleted a moment ago on another device): said plainly.
  reset(); list[0] = { ...list[0] };
  await act(async () => { root.render(null); });
  await show();
  const again = q('[data-testid="deletion-r-wait"]');
  await click(again.querySelector('[data-testid="deletion-restore"]'));
  assert.match(text(again.querySelector('[data-testid="deletion-confirm-restore"]')), /Open this account and Wanderlust again now\?/);
  await click(again.querySelector('[data-testid="deletion-restore-confirm"]'));
  await settle(10);
  assert.deepEqual(invoked.at(-1).body, { action: 'restore', requestId: 'r-wait' });
  assert.equal(globalThis.toasts.at(-1)[0], 'error');
  assert.match(globalThis.toasts.at(-1)[1], /isn’t waiting any more/);
  passed('Restore asks first; a request no longer waiting is said plainly');

  await act(async () => { root.render(null); });
  console.log(`\n${passes} passed`);
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
}
