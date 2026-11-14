// The shop's side menu on Explore's Listings and Chat (Alvin, 10 Nov 2026: "bottom navigation
// 'Listings' should also show the side menu hamburger so users can navigate using it. Same goes
// for bottom navigation Chat. Sidebar menu Chat should be the same as the bottom Chat."). The real
// Layout renders an Explore page with its real header (ExploreTabHeader with shopMenu); the shop's
// data comes from stand-ins.
// Run: node verification/shop-menu.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore/chats', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'history', 'location']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.scrollTo = () => {};
win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-shop-menu-'));
const local = path.join(process.cwd(), '.shop-menu-bundle.mjs');
const nothing = 'export default function Nothing() { return null; }';
const mocks = {
  tenant: [
    "import React from 'react';",
    'const TenantContext = React.createContext(null);',
    'export default TenantContext;',
    'export const useTenant = () => globalThis.tenantState;',
    'export function TenantProvider({ children }) { const state = globalThis.tenantState; return React.createElement(TenantContext.Provider, { value: state }, children(state)); }',
  ].join('\n'),
  passthrough: 'export function ThemeProvider({ children }) { return children; } export function NotificationProvider({ children }) { return children; }',
  appUser: 'export const useAppUser = () => globalThis.appUserState;',
  refresh: 'export const useAppRefreshHandler = () => {};',
  chat: 'export const useChatUnread = () => ({ buying: 1, selling: 1, by_tenant: { "shop-1": 1 }, archived: {} });',
  sell: 'export function SellProvider({ children }) { return children; } export const useSell = () => ({ openSell() {} });',
  clients: [
    'const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle: async () => ({ data: null, error: null }), then(r) { return Promise.resolve({ data: [], error: null }).then(r); } };',
    'export const getSupabase = async () => ({ from: () => query, rpc: async (name) => ({ data: name === "my_profile_photo" ? globalThis.photoAnswer : null, error: null }), auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => ({}) }, channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; }, removeChannel() {} });',
    "export const SUPABASE_URL = 'https://project.example.invalid';",
  ].join('\n'),
  billing: 'export const reconcileBilling = async () => null; export const openBillingPortal = async () => false; export const formatBillingAmount = () => "";',
  pwa: 'export const installPromptSeen = () => true; export const offerInstall = () => {}; export const OFFER_INSTALL_EVENT = "sellio:offer-install"; export const isAndroid = () => false; export const isIOS = () => false;',
  push: 'export const offerPushAlerts = () => {};',
  files: 'export const inAppFiles = () => false; export const clearExpiredFiles = () => {};',
  device: 'export const rememberThisPhone = () => {};',
  toast: 'export const toast = Object.assign(() => {}, { error() {}, success() {}, info() {}, message() {} }); export const Toaster = () => null;',
  nothing,
};
const routes = [
  [/components\/tenant\/TenantContext$/, 'tenant'],
  [/components\/theme\/ThemeProvider$|components\/notifications\/NotificationProvider$/, 'passthrough'],
  [/lib\/AppUserContext$/, 'appUser'], [/lib\/AppRefreshContext$/, 'refresh'], [/lib\/chat$/, 'chat'], [/lib\/sell$/, 'sell'],
  [/lib\/supabaseClient$/, 'clients'], [/lib\/billing$/, 'billing'], [/lib\/pwaInstall$/, 'pwa'], [/lib\/pushOffer$/, 'push'],
  [/lib\/appFiles$/, 'files'], [/lib\/deviceKey$/, 'device'], [/^sonner$/, 'toast'], [/ExploreChatCount$/, 'nothing'],
  [/notifications\/NotificationBell$|orders\/KitchenAutoPrint$|dev\/RoleSwitcher$|onboarding\/InstallBanner$|chat\/ChatHeaderButton$|subscription\/(UpgradeWall|BillingRecoveryWall|SubscriptionEndedNotice|BillingStatusBanner|TrialReminderModal|PlanFeatureNotice|PricingModal)$|profile\/AccountProfileModal$|ui-custom\/AppLoader$|navigation\/(BottomTabBar|MerchantTabBar)$/, 'nothing'],
];
const plugin = { name: 'shop-menu-fixtures', setup(builder) {
  for (const [filter, key] of routes) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const unprevented = [];
const click = async (el) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => { el.dispatchEvent(event); });
  if (el.tagName === 'A' && !event.defaultPrevented) unprevented.push(text(el));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as Layout } from '@/Layout'; export { ExploreTabHeader } from '@/components/explore/shared';" },
    outfile: path.join(tmp, 'layout.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent', loader: { '.js': 'jsx' },
  });
  await copyFile(path.join(tmp, 'layout.mjs'), local);
  const { Layout, ExploreTabHeader } = await import(pathToFileURL(local));

  let where = '';
  function Where() { where = useLocation().pathname; return null; }
  // An Explore page as App.jsx has it: Layout (currentPageName "Explore") around the page.
  function Page({ title }) {
    return React.createElement('div', null, React.createElement(ExploreTabHeader, { title, shopMenu: true }), React.createElement('main', null, title + ' page'));
  }
  async function show(at, title) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client },
        React.createElement(MemoryRouter, { initialEntries: [at] },
          React.createElement(Where),
          React.createElement(Routes, null,
            React.createElement(Route, { path: '/explore/chats', element: React.createElement(Layout, { currentPageName: 'Explore' }, React.createElement(Page, { title: 'Chats' })) }),
            React.createElement(Route, { path: '/explore/listings', element: React.createElement(Layout, { currentPageName: 'Explore' }, React.createElement(Page, { title: 'My listings' })) }),
            React.createElement(Route, { path: '*', element: React.createElement('p', null, 'elsewhere') }),
          ))));
    });
    await act(async () => { await sleep(30); });
    return async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; };
  }
  const menuButton = () => document.querySelector('[data-testid="shop-menu-button"]');
  const drawer = () => document.querySelector('[data-testid="shop-menu"]');
  const link = (label) => [...(drawer()?.querySelectorAll('a') || [])].find((a) => text(a).replace(/\d+$/, '').trim() === label);
  const lit = (a) => a?.className.includes('text-white');

  // Mei's free home shop: she owns it, it has no counter.
  const shop = { id: 'shop-1', name: 'Mei’s Bakes', slug: 'meis-bakes', seller_type: 'individual', plan: 'free' };
  const home = (extra = {}) => ({
    user: { id: 'u-1', email: 'mei@bakes.sg', full_name: 'Mei Tan', role: 'admin', has_seen_tour: true },
    tenant: shop, tenantUser: { is_owner: true }, tenantId: 'shop-1', isSuperAdmin: false, isLoading: false, isOwner: true, noStore: false,
    hasPermission: (p) => p !== 'orders.create', canUseFeature: () => true, ...extra,
  });
  globalThis.appUserState = { appUser: { id: 'u-1', email: 'mei@bakes.sg', full_name: 'Mei Tan', role: 'admin', tenant_id: 'shop-1' }, clearAppUser() {} };
  globalThis.photoAnswer = { source: 'google', google: 'https://lh3.googleusercontent.com/a/mei=s256-c', path: null, folder: '00000000-0000-0000-0000-000000000001' };
  globalThis.tenantState = home();

  // Chat: the button, then the Dashboard's menu with Chats lit up and the bottom bar's count.
  let close = await show('/explore/chats', 'Chats');
  assert.ok(menuButton(), 'the menu button on Chat');
  assert.equal(menuButton().getAttribute('aria-label'), 'Open menu');
  assert.ok(menuButton().compareDocumentPosition(document.querySelector('h1')) & win.Node.DOCUMENT_POSITION_FOLLOWING, 'before the title');
  assert.equal(drawer(), null, 'closed at first');
  await click(menuButton());
  assert.ok(drawer(), 'a tap opens the menu');
  for (const label of ['Dashboard', 'Manage listings', 'Orders', 'Chats', 'Settings', 'Explore']) assert.ok(link(label), label);
  assert.equal(link('Chats').getAttribute('href'), '/explore/chats', "Chats is the bottom bar's Chat");
  assert.ok(lit(link('Chats')), 'Chats lit up');
  assert.match(text(link('Chats')), /^Chats\s*2$/, 'with the bottom bar’s count (buying and selling)');
  assert.equal(lit(link('Explore')), false, 'Explore isn’t lit on its Chat page');
  assert.equal(lit(link('Dashboard')), false);
  assert.equal(lit(link('Manage listings')), false, 'Manage listings isn’t lit on Chat');
  assert.match(text(drawer()), /Mei’s Bakes/);
  assert.ok(drawer().querySelector('[data-testid="profile-photo"]'), 'the footer shows her photo');
  await click(link('Chats'));
  assert.equal(drawer(), null, 'the page already open: the menu just closes');
  assert.equal(where, '/explore/chats');
  passed("a home shop's Chat: the menu button opens the Dashboard's menu, Chats lit up with the bottom bar's count");

  await click(menuButton());
  await click(link('Dashboard'));
  assert.equal(drawer(), null);
  assert.equal(where, '/Dashboard', 'the menu takes her to the Dashboard');
  await close();
  passed('from the menu to the Dashboard');

  // Chat to Listings by the menu: Manage listings is the bottom bar's Listings (Alvin, 10 Nov
  // 2026: "When I'm in Listing page, the side menu Manage listing is not active/highlighted").
  close = await show('/explore/chats', 'Chats');
  await click(menuButton());
  assert.equal(link('Manage listings').getAttribute('href'), '/explore/listings', "Manage listings is the bottom bar's Listings");
  await click(link('Manage listings'));
  assert.equal(drawer(), null);
  assert.equal(where, '/explore/listings', 'straight to her listings');
  assert.equal(text(document.querySelector('h1')), 'My listings');
  await close();
  passed('from Chat to her listings by the menu');

  // Listings: the same button, Manage listings lit up; the scrim closes the menu.
  close = await show('/explore/listings', 'My listings');
  assert.ok(menuButton(), 'the menu button on Listings');
  await click(menuButton());
  assert.ok(drawer());
  assert.ok(lit(link('Manage listings')), 'Manage listings lit up on her listings');
  assert.equal(link('Manage listings').getAttribute('aria-current'), 'page');
  for (const label of ['Dashboard', 'Orders', 'Chats', 'Settings', 'Explore']) assert.equal(lit(link(label)), false, `${label} isn’t lit`);
  await click(link('Manage listings'));
  assert.equal(drawer(), null, 'the page already open: the menu just closes');
  assert.equal(where, '/explore/listings');
  await click(menuButton());
  await click(drawer().firstElementChild);
  assert.equal(drawer(), null, 'a tap beside the menu closes it');
  await close();
  passed('Listings has the button too, Manage listings lit up there; a tap beside the menu closes it');

  // Not a home shop's owner: no button.
  globalThis.tenantState = home({ hasPermission: () => true });
  close = await show('/explore/chats', 'Chats');
  assert.equal(menuButton(), null, 'a business (it has the counter): its own bar, no menu here');
  await close();
  globalThis.tenantState = home({ tenant: null, tenantId: null, isOwner: false, noStore: true, tenantUser: null, hasPermission: () => false });
  globalThis.appUserState = { appUser: { id: 'u-2', email: 'buyer@example.com', full_name: 'Jia Hui', role: 'user' }, clearAppUser() {} };
  close = await show('/explore/chats', 'Chats');
  assert.equal(menuButton(), null, 'a buyer without a shop');
  await close();
  globalThis.tenantState = home({ isOwner: false });
  globalThis.appUserState = { appUser: { id: 'u-1', email: 'mei@bakes.sg', full_name: 'Mei Tan', role: 'admin', tenant_id: 'shop-1' }, clearAppUser() {} };
  close = await show('/explore/chats', 'Chats');
  assert.equal(menuButton(), null, 'not the owner');
  await close();
  passed('no menu button for a business, a buyer, or someone who isn’t the owner');

  // The wiring that stays in the source: Back closes it on Explore too; the profile and plan
  // windows its footer opens are there; ExploreChats and ExploreListings ask for the button.
  const layout = await readFile(path.join(process.cwd(), 'src/Layout.jsx'), 'utf8');
  assert.match(layout, /const exploreShopMenu = currentPageName === 'Explore' && freeShopNav && isOwner && !!displayUser && !!tenantId && !staffAccount;/);
  assert.match(layout, /useBackToClose\(mobileOpen && \(workspaceShown \|\| exploreShopMenu\), \(\) => setMobileOpen\(false\)\);/);
  assert.match(layout, /<ShopMenuContext\.Provider value=\{exploreShopMenu \? openShopMenu : null\}>[\s\S]*?\{exploreShopMenu && mobileOpen && menuDrawer\(true\)\}[\s\S]*?<AccountProfileModal[\s\S]*?onOpenPricing=\{\(\) => setShowPricingModal\(true\)\}[\s\S]*?<PricingModal open=\{showPricingModal\}/);
  for (const [file, title] of [['src/components/explore/ExploreChats.jsx', 'Chats'], ['src/components/explore/ExploreListings.jsx', 'My listings']]) {
    assert.match(await readFile(path.join(process.cwd(), file), 'utf8'), new RegExp(`<ExploreTabHeader title="${title}" shopMenu `), `${file}: shopMenu`);
  }
  passed('Back closes it on Explore too; its profile and plan windows are there; Chats and Listings ask for the button');

  assert.deepEqual(unprevented, [], 'every menu link is followed in the app, never by a page load');
  console.log(passes + ' shop-menu checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
