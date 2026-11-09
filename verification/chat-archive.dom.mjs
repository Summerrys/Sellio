// Chats: archive, delete, and who's online (Alvin, 9 Nov 2026: "Archive and delete are good to
// go ... do not allow them to turn it off ... Each chat should belong to individual ... new
// message stays archived"). From the approved mockups, without the privacy switch:
// - Swipe a chat left for Archive and Delete; press and hold it (or its ⋯ with a mouse, or a
//   right click) for the same two in a sheet. Archive moves it to Archived (with Undo); Delete
//   asks first and says exactly what goes. Each person's own: the database keys them by person.
// - "Archived" sits at the top of Chats with how many are in it; the Archived list says new
//   messages leave a chat there, and moves a chat back to Chats.
// - A green dot on the chat list for who's online now; under the name in a chat, "Online" or
//   "Last seen …" (just now, N min ago, today at, yesterday at, a date). Always shown.
// - Sellio tells the database it's open every minute while on screen, and once on leaving.
// Run: node verification/chat-archive.dom.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile, rm, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(path.join(process.argv[2] || '/tmp/sellio-verification', 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore/chats', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
let finePointer = false;
win.matchMedia = (q) => ({ matches: /pointer: fine/.test(q) ? finePointer : false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.HTMLElement.prototype.scrollIntoView = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;
console.warn = () => {};

// ── A small chat database ────────────────────────────────────────────────────────────────
const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const CHATS = [
  { id: 'c-kopi', box: 'buying', tenant_id: 't-kopi', shop_name: 'Kopi Corner', shop_logo_url: null, buyer_name: 'Alvin', product_name: 'Kaya toast set', last_message_at: minutesAgo(5), last_message_preview: 'Yes! You can collect after 3', from_me: false, unread: 1, online: true, last_seen_at: minutesAgo(0) },
  { id: 'c-mei', box: 'selling', tenant_id: 't-home', shop_name: 'Perfect Five', buyer_name: 'Mei Ling', product_name: 'Pineapple tarts', last_message_at: minutesAgo(60 * 20), last_message_preview: 'Sure, 2 jars left', from_me: true, unread: 0, online: false, last_seen_at: minutesAgo(12) },
  { id: 'c-tan', box: 'buying', tenant_id: 't-tan', shop_name: 'Tan’s Satay', buyer_name: 'Alvin', product_name: 'Satay set (20)', last_message_at: minutesAgo(60 * 24 * 12), last_message_preview: 'See you Saturday!', from_me: false, unread: 0, online: false, last_seen_at: null },
];
const db = { archived: new Set(['c-tan']), deleted: new Set(), calls: [], fail: null };
function rpc(name, args = {}) {
  db.calls.push([name, args]);
  if (db.fail === name) return Promise.resolve({ data: null, error: { message: 'offline' } });
  const visible = CHATS.filter((c) => !db.deleted.has(c.id));
  const shown = (c) => ({ ...c, archived: db.archived.has(c.id) });
  switch (name) {
    case 'chat_list': {
      const role = args.p_box;
      const rows = visible.filter((c) => c.box === role && db.archived.has(c.id) === !!args.p_archived
        && (!args.p_tenant_id || c.tenant_id === args.p_tenant_id));
      return Promise.resolve({ data: rows.map(shown), error: null });
    }
    case 'chat_unread': {
      const count = (box, archived) => visible.filter((c) => c.box === box && db.archived.has(c.id) === archived);
      const arch = (box) => ({ chats: count(box, true).length, unread: count(box, true).filter((c) => c.unread > 0).length });
      return Promise.resolve({ data: {
        buying: count('buying', false).filter((c) => c.unread > 0).length,
        selling: count('selling', false).filter((c) => c.unread > 0).length,
        by_tenant: {},
        archived: { buying: arch('buying'), selling: arch('selling'), by_tenant: { 't-home': arch('selling') } },
      }, error: null });
    }
    case 'chat_archive':
      if (args.p_archived) db.archived.add(args.p_conversation_id); else db.archived.delete(args.p_conversation_id);
      return Promise.resolve({ data: { id: args.p_conversation_id, archived: args.p_archived }, error: null });
    case 'chat_delete':
      db.deleted.add(args.p_conversation_id);
      return Promise.resolve({ data: { id: args.p_conversation_id, deleted: true }, error: null });
    case 'chat_thread':
      return Promise.resolve({ data: { conversation: globalThis.threadHead, messages: [], has_more: false }, error: null });
    default:
      return Promise.resolve({ data: null, error: null });
  }
}
const session = { user: { id: 'user-1', email: 'alvin@example.com' } };
globalThis.supabaseFixture = {
  rpc,
  channel() { const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {} }; return ch; },
  removeChannel() {},
  auth: {
    getSession: async () => ({ data: { session: globalThis.signedIn ? session : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
globalThis.signedIn = true;
globalThis.toasts = [];
globalThis.tenantFixture = { tenant: { id: 't-home', name: 'Perfect Five' }, tenantId: 't-home', hasPermission: () => true };

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-chat-archive-'));
const entry = path.join(tmp, 'entry.jsx');
await writeFile(entry, [
  "export * from '@/lib/chat';",
  "export { default as ChatInbox } from '@/components/chat/ChatInbox';",
  "export { default as ChatThread } from '@/components/chat/ChatThread';",
  "export { default as PresencePing } from '@/components/chat/PresencePing';",
  "export { default as ChatsPage } from '@/pages/Chats';",
].join('\n'));
const stubs = {
  sonner: [
    'const note = (kind) => (message, options) => { globalThis.toasts.push({ kind, message, options }); };',
    'export const toast = Object.assign(note("toast"), { success: note("success"), error: note("error"), info: note("info"), message: note("message"), dismiss() {} });',
  ].join('\n'),
  supabase: 'export const getSupabase = async () => globalThis.supabaseFixture; export const SUPABASE_URL = "https://x.invalid";',
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
  tenant: 'export const useTenant = () => globalThis.tenantFixture; export default {};',
  loading: 'export default function LoadingShapes({ label }) { return globalThis.__h("div", { "data-testid": "loading" }, label); }',
};
const mock = { name: 'chat-archive-fixtures', setup(b) {
  const route = (filter, key) => b.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  route(/^sonner$/, 'sonner');
  route(/lib\/supabaseClient$/, 'supabase');
  route(/lib\/useBackToClose$/, 'back');
  route(/tenant\/TenantContext$/, 'tenant');
  route(/ui-custom\/LoadingShapes$/, 'loading');
  b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: stubs[args.path] }));
} };
const outfile = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  alias: { '@': path.join(process.cwd(), 'src') }, plugins: [mock], logLevel: 'silent', loader: { '.js': 'jsx' } });
const local = path.join(process.cwd(), '.chat-archive-bundle.mjs');
await copyFile(outfile, local);
globalThis.__h = h;
const app = await import(pathToFileURL(local).href);

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (ms = 30) => { await act(async () => { await wait(ms); }); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const buttons = (root = document.body) => [...root.querySelectorAll('button')];
const button = (label, root = document.body) => buttons(root).find((b) => text(b) === label || b.getAttribute('aria-label') === label);

function Where() {
  const location = useLocation();
  return h('p', { 'data-testid': 'where' }, location.pathname + location.search);
}
async function mount(element, { at = '/explore/chats' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [at] },
      h(Routes, null,
        h(Route, { path: '*', element: h(React.Fragment, null, element, h(Where)) })))));
  });
  await settle(60);
  return { host, client, close: async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; } };
}
const where = () => text(document.querySelector('[data-testid="where"]'));
const rowFor = (name) => [...document.querySelectorAll('[data-chat-row]')].find((r) => text(r).includes(name));
const slider = (row) => row.children[1];

function pointer(target, type, x, y, extra = {}) {
  const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: extra.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: extra.pointerType ?? 'touch' });
  target.dispatchEvent(event);
}
async function swipeLeft(row, distance = 120) {
  const el = slider(row);
  await act(async () => {
    pointer(el, 'pointerdown', 300, 40);
    pointer(el, 'pointermove', 290, 41);
    pointer(el, 'pointermove', 300 - distance / 2, 41);
    pointer(el, 'pointermove', 300 - distance, 42);
    pointer(el, 'pointerup', 300 - distance, 42);
    el.querySelector('a').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}
async function tap(el) {
  await act(async () => {
    pointer(el, 'pointerdown', 200, 40);
    pointer(el, 'pointerup', 200, 40);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}
async function hold(row) {
  const el = slider(row);
  await act(async () => { pointer(el, 'pointerdown', 200, 40); await wait(560); pointer(el, 'pointerup', 200, 40); });
  await act(async () => { el.querySelector('a').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await settle();
}
const callsOf = (name) => db.calls.filter(([n]) => n === name).map(([, args]) => args);

try {
  // ── 1. Last seen wording ───────────────────────────────────────────────────────────────
  {
    const now = new Date(2026, 10, 9, 22, 40);
    const at = (d, hh, mm) => new Date(2026, 10, d, hh, mm).toISOString();
    assert.equal(app.lastSeenText({ online: true, last_seen_at: at(9, 22, 39) }, now), 'Online');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(9, 22, 39, 40) }, now), 'Last seen 1 min ago');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: new Date(now - 20000).toISOString() }, now), 'Last seen just now');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: new Date(now + 60000).toISOString() }, now), 'Last seen just now', 'a phone clock a little behind');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(9, 22, 28) }, now), 'Last seen 12 min ago');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(9, 21, 41) }, now), 'Last seen 59 min ago');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(9, 15, 42) }, now), 'Last seen today at 3:42 pm');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(8, 21, 10) }, now), 'Last seen yesterday at 9:10 pm');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: at(1, 9, 5) }, now), 'Last seen 1 Nov');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: new Date(2025, 11, 30, 9).toISOString() }, now), 'Last seen 30 Dec 2025');
    assert.equal(app.lastSeenText({ online: false, last_seen_at: null }, now), '', 'never seen: nothing');
    assert.equal(app.lastSeenText({}, now), '');
    passed('last seen: Online, just now, N min ago, today at, yesterday at, a date (with the year when not this year)');
  }

  // ── 2. Archived counts ─────────────────────────────────────────────────────────────────
  {
    const unread = { archived: { buying: { chats: 2, unread: 1 }, selling: { chats: 3, unread: 0 }, by_tenant: { t1: { chats: 1, unread: 1 } } } };
    assert.deepEqual(app.archivedCount(unread, 'all'), { chats: 5, unread: 1 });
    assert.deepEqual(app.archivedCount(unread, 'buying'), { chats: 2, unread: 1 });
    assert.deepEqual(app.archivedCount(unread, 'selling'), { chats: 3, unread: 0 });
    assert.deepEqual(app.archivedCount(unread, 'selling', 't1'), { chats: 1, unread: 1 });
    assert.deepEqual(app.archivedCount(unread, 'selling', 't2'), { chats: 0, unread: 0 });
    assert.deepEqual(app.archivedCount({ buying: 1, selling: 0 }, 'all'), { chats: 0, unread: 0 }, 'an older answer without archived');
    passed('how many chats are in Archived: all, buying, selling, one shop');
  }

  // ── 3. Chats: Archived at the top, the green dot ───────────────────────────────────────
  {
    const view = await mount(h(app.ChatInbox, { box: 'all', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived' }));
    const archivedRow = document.querySelector('[data-testid="archived-chats-row"]');
    assert.ok(archivedRow, 'Archived at the top');
    assert.equal(archivedRow.getAttribute('href'), '/explore/chats/archived');
    assert.match(text(archivedRow), /^Archived\s*1$/);
    assert.ok(rowFor('Kopi Corner') && rowFor('Mei Ling'), 'the two chats in Chats');
    assert.equal(rowFor('Tan’s Satay'), undefined, 'the archived chat is only in Archived');
    assert.ok(rowFor('Kopi Corner').querySelector('[data-testid="chat-online-dot"]'), 'Kopi Corner is online: a green dot');
    assert.match(text(rowFor('Kopi Corner')), /Kopi Corner \(online\)/, 'and said for a screen reader');
    assert.equal(rowFor('Mei Ling').querySelector('[data-testid="chat-online-dot"]'), null, 'Mei Ling is not online');
    assert.match(text(rowFor('Mei Ling')), /Selling · Pineapple tarts/);
    passed('Chats: "Archived" with how many at the top, and a green dot for who is online');

    // A tap opens the chat.
    await tap(rowFor('Mei Ling').querySelector('a'));
    assert.equal(where(), '/explore/chats/c-mei', 'a tap opens the chat');
    await view.close();

    // Nothing archived (Selling): no Archived row.
    const selling = await mount(h(app.ChatInbox, { box: 'selling', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived' }));
    assert.ok(rowFor('Mei Ling'));
    assert.equal(document.querySelector('[data-testid="archived-chats-row"]'), null, 'nothing archived: no Archived row');
    await selling.close();
  }

  // ── 4. Swipe left: Archive (with Undo) ─────────────────────────────────────────────────
  {
    db.calls.length = 0;
    globalThis.toasts = [];
    const view = await mount(h(app.ChatInbox, { box: 'all', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived' }));
    let row = rowFor('Kopi Corner');
    await swipeLeft(row);
    row = rowFor('Kopi Corner');
    assert.equal(where(), '/explore/chats', 'a swipe opens nothing');
    assert.match(slider(row).style.transform, /translateX\(-148px\)/, 'the row stays open on its two actions');
    const archiveButton = row.querySelector('[data-testid="chat-swipe-archive"]');
    const deleteButton = row.querySelector('[data-testid="chat-swipe-delete"]');
    assert.equal(text(archiveButton), 'Archive');
    assert.equal(text(deleteButton), 'Delete');
    assert.equal(archiveButton.tabIndex, 0, 'reachable while open');

    // A tap on the open row closes it, and opens nothing.
    await tap(slider(row).querySelector('a'));
    assert.equal(where(), '/explore/chats');
    assert.match(slider(rowFor('Kopi Corner')).style.transform, /translateX\(0px\)/, 'tapped: closed again');
    assert.equal(rowFor('Kopi Corner').querySelector('[data-testid="chat-swipe-archive"]').tabIndex, -1, 'hidden actions are out of the tab order');

    // A short swipe springs back.
    await swipeLeft(rowFor('Kopi Corner'), 40);
    assert.match(slider(rowFor('Kopi Corner')).style.transform, /translateX\(0px\)/, 'a short swipe springs back');
    // A scroll (mostly up and down) moves nothing.
    await act(async () => {
      const el = slider(rowFor('Kopi Corner'));
      pointer(el, 'pointerdown', 300, 40); pointer(el, 'pointermove', 280, 120); pointer(el, 'pointermove', 200, 200); pointer(el, 'pointerup', 200, 200);
    });
    await settle();
    assert.match(slider(rowFor('Kopi Corner')).style.transform, /translateX\(0px\)/, 'scrolling the list moves no row');
    // A swipe to the right (the iPhone's back swipe) moves no row.
    await act(async () => {
      const el = slider(rowFor('Kopi Corner'));
      pointer(el, 'pointerdown', 10, 40); pointer(el, 'pointermove', 30, 41); pointer(el, 'pointermove', 120, 41); pointer(el, 'pointerup', 120, 41);
    });
    await settle();
    assert.match(slider(rowFor('Kopi Corner')).style.transform, /translateX\(0px\)/, 'a swipe to the right moves no row');

    await swipeLeft(rowFor('Kopi Corner'));
    await act(async () => { rowFor('Kopi Corner').querySelector('[data-testid="chat-swipe-archive"]').click(); });
    await settle(60);
    assert.deepEqual(callsOf('chat_archive'), [{ p_conversation_id: 'c-kopi', p_archived: true }]);
    assert.equal(rowFor('Kopi Corner'), undefined, 'gone from Chats');
    assert.match(text(document.querySelector('[data-testid="archived-chats-row"]')), /^Archived\s*2 \(1 with new messages\)$/, 'Archived counts it, and that it has news');
    const archivedToast = globalThis.toasts.find((t) => t.message === 'Chat archived');
    assert.ok(archivedToast, '"Chat archived"');
    assert.equal(archivedToast.options.action.label, 'Undo');
    await act(async () => { archivedToast.options.action.onClick(); });
    await settle(60);
    assert.deepEqual(callsOf('chat_archive').at(-1), { p_conversation_id: 'c-kopi', p_archived: false }, 'Undo moves it back');
    assert.ok(rowFor('Kopi Corner'), 'back in Chats');
    assert.match(text(document.querySelector('[data-testid="archived-chats-row"]')), /^Archived\s*1$/);
    passed('swipe left: Archive and Delete; Archive moves the chat to Archived with Undo; taps, scrolls and short swipes move nothing');
    await view.close();
  }

  // ── 5. Press and hold: the options; Delete asks first ──────────────────────────────────
  {
    db.calls.length = 0;
    globalThis.toasts = [];
    const removed = [];
    const view = await mount(h(app.ChatInbox, { box: 'all', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived', onRemoved: (id) => removed.push(id) }));
    await hold(rowFor('Kopi Corner'));
    assert.equal(where(), '/explore/chats', 'holding opens no chat');
    let sheet = document.querySelector('[data-testid="chat-options-sheet"]');
    assert.ok(sheet, 'press and hold: the options');
    assert.match(text(sheet), /Kopi Corner\s*Buying · Kaya toast set/);
    assert.ok(buttons(sheet).some((b) => /^Archive chat\s*Moves to Archived$/.test(text(b))), 'Archive chat (moves to Archived)');
    assert.ok(button('Delete chat', sheet));
    await act(async () => { button('Cancel', sheet).click(); });
    await settle();
    assert.equal(document.querySelector('[data-testid="chat-options-sheet"]'), null, 'Cancel closes them');

    await hold(rowFor('Mei Ling'));
    sheet = document.querySelector('[data-testid="chat-options-sheet"]');
    await act(async () => { button('Delete chat', sheet).click(); });
    await settle();
    assert.equal(document.querySelector('[data-testid="chat-options-sheet"]'), null);
    const dialog = document.querySelector('[role="alertdialog"]');
    assert.ok(dialog, 'Delete asks first');
    assert.match(text(dialog), /Delete this chat\?\s*Your chat with Mei Ling about Pineapple tarts, with its messages and photos, goes from your chats\. Mei Ling keeps their copy\. If either of you writes again, it starts fresh\./);
    assert.equal(callsOf('chat_delete').length, 0, 'nothing deleted before confirming');
    await act(async () => { button('Cancel', dialog).click(); });
    await settle();
    assert.equal(document.querySelector('[role="alertdialog"]'), null, 'Cancel keeps the chat');
    assert.ok(rowFor('Mei Ling'));
    assert.equal(callsOf('chat_delete').length, 0);

    await swipeLeft(rowFor('Mei Ling'));
    await act(async () => { rowFor('Mei Ling').querySelector('[data-testid="chat-swipe-delete"]').click(); });
    await settle();
    await act(async () => { document.querySelector('[data-testid="delete-chat-confirm"]').click(); });
    await settle(60);
    assert.deepEqual(callsOf('chat_delete'), [{ p_conversation_id: 'c-mei' }]);
    assert.equal(rowFor('Mei Ling'), undefined, 'gone from the list');
    assert.deepEqual(removed, ['c-mei'], 'the page is told (to close it if it was open beside the list)');
    assert.ok(globalThis.toasts.some((t) => t.message === 'Chat deleted'));
    db.deleted.clear();
    passed('press and hold: Archive chat or Delete chat; Delete says exactly what goes and needs a confirm');
    await view.close();
  }

  // ── 6. With a mouse: the ⋯ and a right click ───────────────────────────────────────────
  {
    finePointer = true;
    const view = await mount(h(app.ChatInbox, { box: 'buying', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived' }));
    const more = rowFor('Kopi Corner').querySelector('[data-testid="chat-options"]');
    assert.equal(more.getAttribute('aria-label'), 'Options for your chat with Kopi Corner');
    assert.equal(more.className.includes('sr-only'), false, 'a visible ⋯ with a mouse');
    await act(async () => { more.click(); });
    await settle();
    assert.equal(where(), '/explore/chats', 'the ⋯ opens no chat');
    assert.ok(document.querySelector('[data-testid="chat-options-sheet"]'), 'the ⋯ opens the options');
    await act(async () => { button('Cancel').click(); });
    await settle();
    await act(async () => { slider(rowFor('Kopi Corner')).dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    await settle();
    assert.ok(document.querySelector('[data-testid="chat-options-sheet"]'), 'a right click opens them too');
    finePointer = false;
    await view.close();

    const touch = await mount(h(app.ChatInbox, { box: 'buying', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No chats yet.', archivedHref: '/explore/chats/archived' }));
    const hidden = rowFor('Kopi Corner').querySelector('[data-testid="chat-options"]');
    assert.ok(hidden.className.includes('sr-only'), 'on a phone the options button is for screen readers');
    assert.equal(text(hidden), 'Options for your chat with Kopi Corner');
    assert.match(text(document.querySelector('[data-testid="archived-chats-row"]')), /^Archived\s*1$/, 'Buying: its own archived chat'); 
    assert.equal(rowFor('Mei Ling'), undefined, 'Buying shows no selling chats');
    await touch.close();
    passed('with a mouse, a ⋯ on each chat and a right click open the same options; on a phone a screen reader gets a button');
  }

  // ── 7. The Archived list ───────────────────────────────────────────────────────────────
  {
    db.calls.length = 0;
    globalThis.toasts = [];
    const view = await mount(h(app.ChatInbox, { box: 'all', archived: true, hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'No archived chats. Chats you archive show up here.' }), { at: '/explore/chats/archived' });
    assert.deepEqual(callsOf('chat_list').map((a) => [a.p_box, a.p_archived]).sort(), [['buying', true], ['selling', true]]);
    assert.match(text(document.querySelector('[data-testid="archived-note"]')), /New messages leave a chat here\. Swipe a chat left, or press and hold it, to move it back to Chats\./);
    assert.ok(rowFor('Tan’s Satay'), 'the archived chat');
    assert.equal(rowFor('Kopi Corner'), undefined);
    assert.equal(document.querySelector('[data-testid="archived-chats-row"]'), null, 'no Archived row inside Archived');
    await swipeLeft(rowFor('Tan’s Satay'));
    const back = rowFor('Tan’s Satay').querySelector('[data-testid="chat-swipe-unarchive"]');
    assert.equal(text(back), 'Move back to Chats');
    assert.match(slider(rowFor('Tan’s Satay')).style.transform, /translateX\(-148px\)/);
    await act(async () => { back.click(); });
    await settle(60);
    assert.deepEqual(callsOf('chat_archive'), [{ p_conversation_id: 'c-tan', p_archived: false }]);
    assert.equal(rowFor('Tan’s Satay'), undefined);
    assert.ok(globalThis.toasts.some((t) => t.message === 'Moved back to Chats' && t.options.action.label === 'Undo'));
    assert.match(text(document.body), /No archived chats\. Chats you archive show up here\./);
    await view.close();

    db.archived.add('c-tan');
    finePointer = true;
    const mouse = await mount(h(app.ChatInbox, { box: 'buying', archived: true, hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'None.' }));
    assert.match(text(document.querySelector('[data-testid="archived-note"]')), /Use the ⋯ on a chat to move it back to Chats\./);
    await act(async () => { rowFor('Tan’s Satay').querySelector('[data-testid="chat-options"]').click(); });
    await settle();
    const sheet = document.querySelector('[data-testid="chat-options-sheet"]');
    assert.ok(button('Move back to Chats', sheet) && button('Delete chat', sheet), 'Archived: Move back to Chats, or Delete chat');
    finePointer = false;
    await mouse.close();
    passed('Archived: says new messages leave a chat there, and moves a chat back to Chats (with Undo)');
  }

  // ── 8. A problem: the chat stays, and it says so ────────────────────────────────────────
  {
    db.fail = 'chat_archive';
    globalThis.toasts = [];
    const view = await mount(h(app.ChatInbox, { box: 'buying', hrefFor: (c) => `/explore/chats/${c.id}`, emptyText: 'None.' }));
    await swipeLeft(rowFor('Kopi Corner'));
    await act(async () => { rowFor('Kopi Corner').querySelector('[data-testid="chat-swipe-archive"]').click(); });
    await settle(80);
    assert.ok(globalThis.toasts.some((t) => t.kind === 'error' && /Couldn't archive that chat/.test(t.message)));
    assert.ok(rowFor('Kopi Corner'), 'still in Chats');
    db.fail = null;
    await view.close();
    passed("offline: archiving says it couldn't, and the chat stays where it was");
  }

  // ── 9. In a chat: Online, or last seen ─────────────────────────────────────────────────
  {
    const head = { id: 'c-kopi', my_role: 'buyer', tenant_id: 't-kopi', shop_name: 'Kopi Corner', shop_slug: 'kopi-corner', buyer_name: 'Alvin',
      product_id: 'p1', product_name: 'Kaya toast set', price: 4.5, currency: 'SGD', listing_available: true, sold_out: false, other_read_at: null };
    globalThis.threadHead = { ...head, online: true, last_seen_at: minutesAgo(0) };
    let view = await mount(h(app.ChatThread, { conversationId: 'c-kopi', variant: 'pane' }));
    let presence = document.querySelector('[data-testid="chat-presence"]');
    assert.equal(text(presence), 'Online · Seller');
    assert.ok(presence.querySelector('[aria-hidden="true"]'), 'with the green dot');
    await view.close();

    globalThis.threadHead = { ...head, my_role: 'seller', buyer_name: 'Mei Ling', shop_name: 'Perfect Five', online: false, last_seen_at: minutesAgo(12) };
    view = await mount(h(app.ChatThread, { conversationId: 'c-mei', variant: 'pane' }));
    presence = document.querySelector('[data-testid="chat-presence"]');
    assert.equal(text(presence), 'Last seen 12 min ago · Buyer · Perfect Five');
    await view.close();

    globalThis.threadHead = { ...head, online: false, last_seen_at: null };
    view = await mount(h(app.ChatThread, { conversationId: 'c-kopi', variant: 'pane' }));
    assert.equal(text(document.querySelector('[data-testid="chat-presence"]')), 'Seller', 'never seen: just who they are');
    await view.close();
    passed('in a chat: "Online · Seller" with a green dot, "Last seen 12 min ago · Buyer · shop", or just who they are');
  }

  // ── 10. Sellio says it's open: every minute, and on leaving ─────────────────────────────
  {
    db.calls.length = 0;
    const realSetInterval = globalThis.setInterval;
    const ticks = [];
    globalThis.setInterval = (fn, ms) => { ticks.push({ fn, ms }); return realSetInterval(() => {}, 1e9); };
    win.setInterval = globalThis.setInterval;
    let visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const view = await mount(h(app.PresencePing));
    await settle(40);
    assert.deepEqual(callsOf('presence_ping'), [{ p_leaving: false }], 'on screen: once at the start');
    const minute = ticks.find((t) => t.ms === 60000);
    assert.ok(minute, 'then every minute');
    await act(async () => { minute.fn(); });
    await settle();
    assert.equal(callsOf('presence_ping').length, 2);
    visibility = 'hidden';
    await act(async () => { document.dispatchEvent(new win.Event('visibilitychange')); });
    await settle();
    assert.deepEqual(callsOf('presence_ping').at(-1), { p_leaving: true }, 'leaving: said once');
    visibility = 'visible';
    await act(async () => { document.dispatchEvent(new win.Event('visibilitychange')); });
    await settle();
    assert.deepEqual(callsOf('presence_ping').at(-1), { p_leaving: false }, 'back: online again');
    await view.close();
    globalThis.setInterval = realSetInterval;
    win.setInterval = realSetInterval;

    db.calls.length = 0;
    globalThis.signedIn = false;
    const out = await mount(h(app.PresencePing));
    await settle(40);
    assert.equal(callsOf('presence_ping').length, 0, 'signed out: nothing to tell');
    await out.close();
    globalThis.signedIn = true;
    const appSource = await readFile(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
    assert.match(appSource, /<PresencePing \/>/, 'mounted once for the whole app');
    assert.ok(appSource.indexOf('path="/explore/chats/archived"') > 0 && appSource.indexOf('path="/explore/chats/archived"') < appSource.indexOf('path="/explore/chats/:conversationId"'), 'the Archived page has its own address');
    passed('Sellio tells the database it is open: at the start, every minute, once on leaving, again on return; not when signed out');
  }

  // ── 11. The shop's Chats page: Archived, and a deleted open chat closes ─────────────────
  {
    db.archived.add('c-mei');
    const view = await mount(h(app.ChatsPage), { at: '/Chats' });
    const archivedRow = document.querySelector('[data-testid="archived-chats-row"]');
    assert.equal(archivedRow?.getAttribute('href'), '/Chats?archived=1', "the shop's Archived");
    assert.match(text(archivedRow), /^Archived\s*1$/);
    assert.equal(rowFor('Mei Ling'), undefined);
    assert.match(text(document.querySelector('h1')), /^Chats$/);
    await view.close();
    const archivedView = await mount(h(app.ChatsPage), { at: '/Chats?archived=1' });
    assert.match(text(document.querySelector('h1')), /^Archived chats$/);
    assert.match(text(document.body), /Chats you've archived \(just for you\)\./);
    assert.ok(rowFor('Mei Ling'), "the shop's archived chat");
    assert.deepEqual(callsOf('chat_list').at(-1), { p_box: 'selling', p_tenant_id: 't-home', p_archived: true });
    db.archived.delete('c-mei');
    await archivedView.close();
    passed("the shop's Chats page: Archived at the top, and its own Archived chats page");
  }

  console.log(passes + ' chat-archive checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
