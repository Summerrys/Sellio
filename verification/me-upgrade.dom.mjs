// Me > profile > Upgrade to Business (Alvin, 10 Nov 2026): on the Me tab the profile window's
// button only closed the window (Me had no plan window); it now opens the business plans there,
// as the side menu's profile does. And the side menu's Chats for a free home shop is the bottom
// bar's Chat (Explore's), with the same count.
// Run: node verification/me-upgrade.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore/me', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.scrollTo = () => {};
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-me-upgrade-'));
const local = path.join(process.cwd(), '.me-upgrade-bundle.mjs');
const mocks = {
  tenant: [
    "import React from 'react';",
    'const TenantContext = React.createContext(null);',
    'export default TenantContext;',
    'export const useTenant = () => globalThis.tenantState;',
  ].join('\n'),
  subscription: 'export const useSubscription = () => ({ subscription: null, tier: "starter" });',
  clients: [
    'const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle: async () => ({ data: null }), then(r) { return Promise.resolve({ data: [], error: null }).then(r); } };',
    'export const getSupabase = async () => ({ from: () => query, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: {} }), signOut: async () => ({}) } });',
    "export const SUPABASE_URL = 'https://project.example.invalid';",
  ].join('\n'),
  profile: 'export const cookieUtils = { clear() {} }; export const useAppUser = () => globalThis.appUserState;',
  toast: 'export const toast = { error() {}, success() {} };',
  push: "export const pushStatus = async () => 'unavailable'; export const askAndroid = async () => false;",
  ratings: 'export const amIModerator = async () => false; export const moderationQueue = async () => []; export const ratingReviewQueue = async () => []; export const ratingText = () => ""; export const shopRatingOverview = async () => null;',
  purchases: 'export const purchaseSummary = async () => null;',
  nothing: 'export default function Nothing() { return null; } export const TAB_BAR_SPACE = "80px"; export const markExploreHome = () => {};',
};
const plugin = { name: 'me-upgrade-fixtures', setup(builder) {
  for (const [filter, key] of [[/tenant\/TenantContext$/, 'tenant'], [/useSubscription$/, 'subscription'], [/supabaseClient$/, 'clients'],
    [/AppUserContext$/, 'profile'], [/^sonner$/, 'toast'], [/pushNotifications$/, 'push'], [/lib\/ratings$/, 'ratings'],
    [/lib\/purchases$/, 'purchases'], [/(^|\/)ExploreTabBar$|(^|\/)ShopBell$/, 'nothing']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const buttonNamed = (label) => [...document.body.querySelectorAll('button')].find((b) => text(b) === label);

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as ExploreMe } from '@/components/explore/ExploreMe'; export { default as TenantContext } from '@/components/tenant/TenantContext';" },
    outfile: path.join(tmp, 'me.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'me.mjs'), local);
  const { ExploreMe, TenantContext } = await import(pathToFileURL(local));

  const opened = [];
  win.open = (url) => { opened.push(url); return null; };
  async function showMe() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(TenantContext.Provider, { value: globalThis.tenantState },
        React.createElement(MemoryRouter, null, React.createElement(ExploreMe))));
    });
    return async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; };
  }

  // Mei's free home shop, its 7-day trial not used yet.
  const shop = { id: 'shop-1', name: 'Mei’s Bakes', slug: 'meis-bakes', seller_type: 'individual', has_used_trial: false, owner_email: 'mei@bakes.sg' };
  globalThis.appUserState = { appUser: { id: 'u-1', full_name: 'Mei', email: 'mei@bakes.sg', tenant_id: 'shop-1' }, clearAppUser() {} };
  globalThis.tenantState = { user: { id: 'u-1', email: 'mei@bakes.sg', full_name: 'Mei' }, tenant: shop, tenantId: 'shop-1', isOwner: true,
    subscription: null, noStore: false, isLoading: false, hasPermission: (p) => p !== 'orders.create' };
  let close = await showMe();
  const profile = [...document.body.querySelectorAll('button')].find((b) => /Profile, password and account/.test(text(b)));
  assert.ok(profile, 'the profile row');
  await click(profile);
  const upgrade = buttonNamed('Upgrade to Business');
  assert.ok(upgrade, 'the profile window says Upgrade to Business');
  await click(upgrade);
  const dialogText = text(document.body);
  assert.match(dialogText, /Upgrade to Business/, 'the plan window opened');
  const trials = [...document.body.querySelectorAll('button')].filter((b) => text(b) === 'Start free trial →');
  assert.equal(trials.length, 3, 'three plans, each with the free trial');
  await click(trials[0]);
  assert.equal(opened.length, 1, 'Stripe opens');
  const params = new URLSearchParams(opened[0].split('?')[1]);
  assert.equal(params.get('client_reference_id'), 'shop-1', "for Mei's shop");
  await close();
  passed('Me > profile > Upgrade to Business opens the business plans (free for 7 days), not just closing the window');

  // Someone else's login to the shop (not the owner): no upgrade button to press.
  globalThis.tenantState = { ...globalThis.tenantState, isOwner: false };
  close = await showMe();
  await click([...document.body.querySelectorAll('button')].find((b) => /Profile, password and account/.test(text(b))));
  assert.equal(buttonNamed('Upgrade to Business'), undefined, 'only the owner');
  await close();
  passed('only the owner gets Upgrade to Business');

  // The side menu's Chats (Layout): a free home shop's opens the bottom bar's Chat, with its count;
  // a business keeps its own Chats page. And /Chats itself sends a home shop there.
  const layout = await readFile(path.join(process.cwd(), 'src/Layout.jsx'), 'utf8');
  assert.match(layout, /const homeShop = isShopTenant\(tenant\) && !hasPermission\?\.\('orders\.create'\);/);
  assert.match(layout, /\{ label: 'Chats', icon: MessageCircle, page: 'Chats', to: homeShop \? '\/explore\/chats' : null, permission: 'orders\.view' \}/);
  assert.match(layout, /const chatsWaiting = homeShop\s*\? \(Number\(chatUnread\.buying\) \|\| 0\) \+ \(Number\(chatUnread\.selling\) \|\| 0\)\s*: Number\(chatUnread\.by_tenant\?\.\[tenant\?\.id\]\) \|\| 0;/);
  assert.match(layout, /const to = item\.to \|\| createPageUrl\(item\.page\);\s*const isActive = item\.to \? location\.pathname\.startsWith\(item\.to\) : currentPageName === item\.page;/);
  assert.match(layout, /<Link\s+key=\{item\.page\}\s+to=\{to\}/);
  assert.match(layout, /if \(to !== window\.location\.pathname \+ window\.location\.search\) navigate\(to, \{ replace: handOverBackStep\(\) \}\);/);
  assert.match(layout, /\{ page: 'Chats', to: '\/explore\/chats', label: 'Chat', icon: MessageCircle, badge: shopChatsWaiting \}/, 'the bottom bar: the same place');
  const chats = await readFile(path.join(process.cwd(), 'src/pages/Chats.jsx'), 'utf8');
  assert.match(chats, /if \(isShopTenant\(tenant\) && !hasPermission\('orders\.create'\)\) \{\s*const to = selected \? chatUrl\(selected\) : archived \? '\/explore\/chats\/archived' : '\/explore\/chats';\s*return <Navigate to=\{to\} replace \/>;/);
  passed("a free home shop's side-menu Chats is the bottom bar's Chat (same place, same count); /Chats goes there too");

  console.log(passes + ' me-upgrade checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
