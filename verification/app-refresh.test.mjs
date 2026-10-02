// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/app-refresh.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const html = (js = 'old', css = 'old') => '<html><head><script type="module" src="/assets/index-' + js + '.js"></script><link rel="stylesheet" href="/assets/index-' + css + '.css"></head><body></body></html>';
const dom = new JSDOM(html(), { url: 'https://sellio.example.invalid/Products?filter=active#menu', pretendToBeVisual: true });
for (const key of ['document','Element','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','NodeFilter','DocumentFragment','CustomEvent','Node','Event','MouseEvent','MutationObserver','sessionStorage','localStorage','getComputedStyle','navigator','DOMParser']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
const navigations = [];
const location = { href: dom.window.location.href, origin: dom.window.location.origin, replace: value => navigations.push(value) };
globalThis.window = new Proxy(dom.window, {
  get(target, key) {
    if (key === 'location') return location;
    const value = Reflect.get(target, key, target);
    return ['addEventListener','removeEventListener'].includes(key) ? value.bind(target) : value;
  },
});
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
const React = await import('react');
const act = React.act || (await import('react-dom/test-utils')).act;
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const temporary = await mkdtemp(path.join(app, '.app-refresh-verification-'));
const originalFetch = globalThis.fetch;
let latestHtml = html(), fetchFails = false, fetchCalls = 0, lastRequest;
globalThis.fetch = async (url, options) => {
  fetchCalls++; lastRequest = { url, options };
  if (fetchFails) throw new Error('Offline');
  return new Response(latestHtml, { status: 200, headers: { 'content-type': 'text/html' } });
};
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
const click = el => { assert.ok(el, 'Expected control'); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
let passes = 0, root, client;
const passed = name => { passes++; console.log('PASS ' + name); };
try {
  const bundle = path.join(temporary, 'fixture.mjs');
  await build({
    stdin: {
      contents: "import React,{useContext} from 'react';import {useQuery} from '@tanstack/react-query';import Provider from './src/components/ui-custom/AppRefreshProvider.jsx';import {AppRefreshContext,useAppRefreshHandler,useAppReloadGuard} from './src/lib/AppRefreshContext.jsx';export * from './src/lib/appUpdates.js';function Page({name}){useQuery({queryKey:['page',name],queryFn:async()=>{globalThis.__pageReads++;return globalThis.__remoteData;}});useAppRefreshHandler(()=>{globalThis.__manualReads++;});useAppReloadGuard(()=>globalThis.__guard);return React.createElement('p',{id:'page'},name);}export default function Fixture({name}){return React.createElement(Provider,null,React.createElement(Page,{name}));}",
      sourcefile: 'app-refresh-fixture.jsx', resolveDir: app, loader: 'jsx',
    },
    outfile: bundle, bundle: true, packages: 'external', format: 'esm', platform: 'node',
    alias: { '@': path.join(app, 'src') }, logLevel: 'silent',
  });
  const { default: Fixture, getAppAssetVersion, fetchPublishedAppVersion, getAppReloadUrl, removeAppReloadParam } = await import(pathToFileURL(bundle).href);
  const baseline = getAppAssetVersion(document, location.href);
  assert.equal(baseline, '/assets/index-old.css|/assets/index-old.js');
  const same = new DOMParser().parseFromString(html() + '<script src="https://third-party.example/script.js"></script>', 'text/html');
  assert.equal(getAppAssetVersion(same, location.href), baseline);
  assert.notEqual(getAppAssetVersion(new DOMParser().parseFromString(html('old','new'), 'text/html'), location.href), baseline);
  passed('Version fingerprint detects CSS/JS changes and ignores unrelated scripts');

  assert.equal(await fetchPublishedAppVersion(location.origin), baseline);
  assert.equal(lastRequest.options.cache, 'no-store');
  assert.equal(lastRequest.options.credentials, 'same-origin');
  assert.ok(new URL(lastRequest.url).searchParams.has('__sellio_update_check'));
  await assert.rejects(fetchPublishedAppVersion(location.origin, { fetcher: async () => new Response('Denied', { status: 403 }) }));
  await assert.rejects(fetchPublishedAppVersion(location.origin, { fetcher: async () => new Response('<html>Sign in</html>') }));
  await assert.rejects(fetchPublishedAppVersion(location.origin, {
    timeoutMs: 5,
    fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')))),
  }));
  passed('Update check bypasses cached HTML and handles HTTP, invalid-page and timeout failures');

  globalThis.__pageReads = 0; globalThis.__manualReads = 0; globalThis.__remoteData = 'before';
  globalThis.__guard = { dirty: false, busy: false };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const render = async name => act(async () => {
    root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Fixture, { name })));
    await flush();
  });
  await render('Categories');
  client.setQueryData(['unvisited'], 'cached');
  const beforeReads = globalThis.__pageReads;
  globalThis.__remoteData = 'after';
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.equal(globalThis.__pageReads, beforeReads + 1);
  assert.equal(globalThis.__manualReads, 1);
  assert.equal(client.getQueryData(['page','Categories']), 'after');
  assert.equal(client.getQueryState(['unvisited']).isInvalidated, true);
  assert.equal(button('Reload'), undefined);
  assert.equal(navigations.length, 0);
  passed('Refresh updates active and manually loaded data, invalidates other pages and never reloads an unchanged app');

  await render('Reports');
  const reportReads = globalThis.__pageReads;
  latestHtml = html('new');
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.equal(globalThis.__pageReads, reportReads + 1);
  assert.ok(button('Reload'));
  assert.equal(document.querySelectorAll('.sellio-pull-refresh').length, 1);
  assert.equal(navigations.length, 0);
  assert.equal(container.querySelector('.sellio-pull-refresh').getAttribute('aria-busy'), 'false');
  passed('The same shared pull works after page navigation and offers Reload for a new release');

  await act(async () => click(document.querySelector('[aria-label="Update later"]')));
  assert.equal(button('Reload'), undefined);
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.ok(button('Reload'));
  passed('Update later is respected and another deliberate pull restores the notice');

  globalThis.__guard = { dirty: true, busy: false };
  await act(async () => click(button('Reload')));
  assert.ok(button('Keep working'));
  assert.equal(navigations.length, 0);
  await act(async () => { click(button('Keep working')); await flush(); });
  assert.equal(button('Reload anyway'), undefined);
  assert.equal(navigations.length, 0);
  await act(async () => click(button('Reload')));
  await act(async () => click(button('Reload anyway')));
  assert.equal(navigations.length, 1);
  const reloaded = new URL(navigations[0]);
  assert.equal(reloaded.pathname, '/Products');
  assert.equal(reloaded.searchParams.get('filter'), 'active');
  assert.equal(reloaded.hash, '#menu');
  assert.ok(reloaded.searchParams.has('__sellio_reload'));
  passed('Unsaved work requires explicit confirmation; cancel keeps it and confirmed reload retains route and filters');

  await act(async () => { click(button('Keep working')); await flush(); });
  globalThis.__guard = { dirty: false, busy: true };
  await act(async () => click(button('Reload')));
  assert.equal(navigations.length, 1);
  const blockedReads = globalThis.__manualReads;
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.equal(globalThis.__manualReads, blockedReads);
  assert.equal(container.querySelector('.sellio-pull-refresh').getAttribute('aria-busy'), 'false');
  passed('Refresh and reload wait while an order/save action is in progress');

  globalThis.__guard = { dirty: false, busy: false };
  const dialog = document.createElement('div'); dialog.setAttribute('role','dialog'); document.body.append(dialog);
  await act(async () => click(button('Reload')));
  assert.equal(navigations.length, 1);
  const target = document.querySelector('#page');
  const touch = (type, y) => {
    const event = new Event(type, { bubbles:true, cancelable:true });
    Object.defineProperty(event,'touches',{value:type === 'touchend' ? [] : [{clientX:0,clientY:y}]});
    target.dispatchEvent(event);
  };
  const modalReads = globalThis.__manualReads;
  await act(async () => { touch('touchstart',0); touch('touchmove',80); touch('touchend',80); await flush(); });
  assert.equal(globalThis.__manualReads, modalReads);
  dialog.remove();
  passed('An open editor blocks pull gestures and reload without losing its state');

  fetchFails = true;
  const offlineReads = globalThis.__manualReads;
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.equal(globalThis.__manualReads, offlineReads + 1);
  assert.equal(container.querySelector('.sellio-pull-refresh').getAttribute('aria-busy'), 'false');
  fetchFails = false; latestHtml = html();
  await act(async () => { click(button('Refresh view')); await flush(); });
  assert.equal(button('Reload'), undefined);
  passed('A failed update check releases the spinner; recovery or rollback clears stale update notices');

  location.href = getAppReloadUrl(location.href);
  window.history.replaceState({ retained:true }, '', location.href);
  removeAppReloadParam();
  assert.equal(dom.window.location.search, '?filter=active');
  assert.equal(dom.window.location.hash, '#menu');
  assert.deepEqual(window.history.state, { retained:true });
  passed('Reload cache-busting is cleaned without altering existing URL or history state');
  console.log(passes + ' checks passed');
} finally {
  if (root) await act(async () => root.unmount());
  client?.clear(); globalThis.fetch = originalFetch;
  await rm(temporary, { recursive:true, force:true });
  dom.window.close();
}
