// A new chat message tells you on the web, outside the Chat page (Alvin, 14 Nov 2026): Explore's
// header Chat link carries the unread count on wide screens (the bottom bar's Chat already did on
// phones); a new chat alert pops up unless that chat is open on screen; and the bell's count
// follows alerts marked read elsewhere (reading a chat marks its alerts read).
// Run: node verification/chat-alerts.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-chat-alerts-'));
const locals = [];
async function bundle(entry, name, contents) {
  const plugin = { name: 'chat-alerts-fixtures', setup(builder) {
    for (const [filter, key] of [[/lib\/AppUserContext$/, 'appUser'], [/lib\/chat$/, 'chat'], [/MerchantTabBar$/, 'merchant'],
      [/navigation\/ShopMenu$/, 'shopMenu'], [/lib\/db$/, 'db'], [/supabaseClient$/, 'clients'], [/tenant\/TenantContext$/, 'tenant'],
      [/^sonner$/, 'toast']]) {
      if (contents[key]) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
    }
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: contents[args.path] }));
  } };
  const outfile = path.join(tmp, name + '.mjs');
  await build({ entryPoints: [entry], outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent', jsx: 'automatic' });
  const local = path.join(process.cwd(), `.chat-alerts-${name}.mjs`);
  await copyFile(outfile, local);
  locals.push(local);
  return import(pathToFileURL(local));
}

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const setVisibility = (state) => Object.defineProperty(win.document, 'visibilityState', { value: state, configurable: true });
const goTo = (url) => win.history.replaceState(null, '', url);

try {
  // 1. Explore's header tabs on wide screens: Chat carries the unread count.
  const shared = await bundle('src/components/explore/shared.jsx', 'shared', {
    appUser: 'export const useAppUser = () => ({ appUser: globalThis.fixture.appUser });',
    chat: 'export const useChatUnread = (enabled) => { globalThis.fixture.unreadEnabled = enabled; return enabled ? globalThis.fixture.unread : { buying: 0, selling: 0 }; };',
    merchant: 'export const useBusinessBar = (hasShop) => hasShop && globalThis.fixture.business;',
    shopMenu: 'export const ShopMenuButton = () => null;',
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const renderTabs = async (fixture) => {
    globalThis.fixture = fixture;
    await act(async () => {
      root.render(React.createElement(MemoryRouter, { initialEntries: ['/explore'] }, React.createElement(shared.ExploreDesktopTabs)));
    });
    const chatLink = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/explore/chats');
    return { chatLink, badge: container.querySelector('[data-testid="chat-tab-unread"]') };
  };

  let tabs = await renderTabs({ appUser: { email: 'buyer@example.com' }, business: false, unread: { buying: 1, selling: 0 } });
  assert.ok(tabs.chatLink, 'The Chat link is there');
  assert.equal(tabs.badge?.textContent, '1', 'A buying chat with a new message shows 1 on Chat');
  assert.equal(tabs.chatLink.querySelector('.sr-only')?.textContent, ', 1 unread', 'Screen readers hear "Chat, 1 unread"');
  tabs = await renderTabs({ appUser: { email: 'seller@example.com', tenant_id: 't1' }, business: false, unread: { buying: 2, selling: 3 } });
  assert.equal(tabs.badge?.textContent, '5', 'Buying and selling chats together, as the bottom bar');
  tabs = await renderTabs({ appUser: { email: 'big@example.com' }, business: false, unread: { buying: 120, selling: 0 } });
  assert.equal(tabs.badge?.textContent, '99+');
  tabs = await renderTabs({ appUser: { email: 'buyer@example.com' }, business: false, unread: { buying: 0, selling: 0 } });
  assert.equal(tabs.badge, null, 'Nothing new: no badge');
  assert.equal(tabs.chatLink.textContent, 'Chat', 'Just "Chat"');
  tabs = await renderTabs({ appUser: { email: 'owner@example.com', tenant_id: 't2' }, business: true, unread: { buying: 4, selling: 4 } });
  assert.equal(tabs.badge, null, 'A business has its own chats button beside the bell');
  assert.equal(globalThis.fixture.unreadEnabled, false);
  tabs = await renderTabs({ appUser: null, business: false, unread: { buying: 1, selling: 0 } });
  assert.equal(tabs.badge, null, 'Signed out: no badge');
  assert.equal(globalThis.fixture.unreadEnabled, false);
  await act(async () => { root.unmount(); });
  passed("Explore's header Chat link shows the unread count (not for a business or signed out)");

  // 2. Notifications: a new chat alert pops up unless that chat is open on screen.
  globalThis.toasts = [];
  globalThis.fetches = 0;
  const provider = await bundle('src/components/notifications/NotificationProvider.jsx', 'provider', {
    db: [
      'export default { entities: { Notification: {',
      '  filter: async () => { globalThis.fetches += 1; return []; },',
      '  update: async () => ({}),',
      '  subscribe: async (callback) => { globalThis.notify = callback; return () => { globalThis.notify = null; }; },',
      '} } };',
    ].join('\n'),
    clients: "export const getSupabase = async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'a' } } }) } });",
    tenant: "export const useTenant = () => ({ user: { email: 'buyer@example.com' } });",
    toast: 'export const toast = { info: (title, options) => { globalThis.toasts.push([title, options?.description]); }, success() {}, error() {} };',
  });

  const onScreen = provider.chatOnScreen;
  setVisibility('visible');
  goTo('/explore/chats/abc-123');
  assert.equal(onScreen('abc-123'), true, "Explore's chat page with that chat");
  assert.equal(onScreen('other'), false);
  setVisibility('hidden');
  assert.equal(onScreen('abc-123'), false, 'Not on screen while the tab is hidden');
  setVisibility('visible');
  goTo('/Chats?c=abc-123');
  assert.equal(onScreen('abc-123'), true, "The shop's Chats with that chat beside the list");
  goTo('/Chats');
  assert.equal(onScreen('abc-123'), false);
  assert.equal(onScreen(null), false);
  passed('chatOnScreen knows when a chat is open and visible');

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const providerRoot = createRoot(host);
  await act(async () => {
    providerRoot.render(React.createElement(QueryClientProvider, { client },
      React.createElement(provider.NotificationProvider, null, React.createElement('div'))));
  });
  for (let i = 0; i < 20 && typeof globalThis.notify !== 'function'; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.equal(typeof globalThis.notify, 'function', 'The provider listens for new notifications');
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  await settle();
  const alert = (conversationId, extra = {}) => ({ type: 'create', data: {
    user_email: 'buyer@example.com', type: 'chat_message', title: 'New message about Watch', message: 'Perfect Five: Hi',
    data: { conversation_id: conversationId }, priority: 'normal', ...extra } });

  goTo('/explore/chats');
  await act(async () => { globalThis.notify(alert('abc-123')); });
  assert.deepEqual(globalThis.toasts, [['New message about Watch', 'Perfect Five: Hi']], 'On the chats list: the alert pops up');

  globalThis.toasts = [];
  goTo('/explore/chats/abc-123');
  let before = globalThis.fetches;
  await act(async () => { globalThis.notify(alert('abc-123')); });
  await settle();
  assert.deepEqual(globalThis.toasts, [], 'That chat open on screen: no pop-up');
  assert.ok(globalThis.fetches > before, 'The bell still updates');

  await act(async () => { globalThis.notify(alert('xyz-999')); });
  assert.equal(globalThis.toasts.length, 1, 'Another chat: the alert pops up');

  globalThis.toasts = [];
  setVisibility('hidden');
  await act(async () => { globalThis.notify(alert('abc-123')); });
  assert.equal(globalThis.toasts.length, 1, 'The chat open in a hidden tab: the alert still pops up');
  setVisibility('visible');

  globalThis.toasts = [];
  await act(async () => { globalThis.notify(alert('abc-123', { type: 'new_order', title: 'New order #12', message: 'S$5.50' })); });
  assert.equal(globalThis.toasts.length, 1, 'Other alerts pop up as before');

  globalThis.toasts = [];
  await act(async () => { globalThis.notify({ type: 'create', data: { ...alert('zzz').data, user_email: 'someone@example.com' } }); });
  assert.equal(globalThis.toasts.length, 0, "Someone else's alert: nothing");
  passed('A new chat alert pops up unless that chat is open on screen');

  before = globalThis.fetches;
  await act(async () => { globalThis.notify({ type: 'update', data: { ...alert('abc-123').data, is_read: true } }); });
  await settle();
  assert.ok(globalThis.fetches > before, 'An alert marked read elsewhere refreshes the bell');
  assert.equal(globalThis.toasts.length, 0, 'No pop-up for an update');
  before = globalThis.fetches;
  await act(async () => { globalThis.notify({ type: 'update', data: { ...alert('abc-123').data, user_email: 'someone@example.com' } }); });
  await settle();
  assert.equal(globalThis.fetches, before, "Someone else's update: no refresh");
  passed("The bell follows alerts marked read elsewhere");

  await act(async () => { providerRoot.unmount(); });
  client.clear();
  console.log(passes + ' chat alert checks passed');
} finally {
  for (const local of locals) await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
