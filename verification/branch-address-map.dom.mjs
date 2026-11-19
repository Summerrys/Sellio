// The business set-up's branch step shows the address on Google's map as it's typed, as Settings
// and a home seller's collection address do (Alvin, 20 Nov 2026: "the address did not show the
// map while I key in that we have in the free home seller interface"). The address becomes the
// store page's address, so the map says so; the country picked in step 1 is added when the
// address doesn't name it, and a few letters aren't enough to look for.
// Run: node verification/branch-address-map.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Onboarding', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Node', 'Event',
  'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-branch-map-'));
const local = path.join(process.cwd(), '.branch-address-map-step.mjs');
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const type = (field, value) => act(async () => {
  assert.ok(field, 'the address box is there');
  Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new win.Event('input', { bubbles: true }));
});

try {
  const outfile = path.join(tmp, 'step.mjs');
  await build({ entryPoints: ['src/components/onboarding/Step2Business.jsx'], outfile, bundle: true, packages: 'external', format: 'esm',
    platform: 'node', jsx: 'automatic', loader: { '.js': 'jsx' }, alias: { '@': path.join(process.cwd(), 'src') }, logLevel: 'silent' });
  await copyFile(outfile, local);
  const { default: Step2Business } = await import(pathToFileURL(local));

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Step2Business, { formData: { country: 'Malaysia' }, updateFormData() {}, nextStep() {}, prevStep() {} }));
  });
  const address = host.querySelector('textarea[name="address"]');
  const map = () => host.querySelector('[data-testid="branch-address-map"]');

  // Nothing to look for yet, nor with a few letters.
  assert.equal(map(), null, 'no map before an address');
  await type(address, '12 W');
  await wait(800);
  assert.equal(map(), null, 'no map for a few letters');
  passed('No map until there is an address to look for');

  // A moment after typing stops: the place on Google's map, the country added.
  await type(address, '12 Jalan Ampang');
  await wait(800);
  const place = '12 Jalan Ampang, Malaysia';
  const frame = map()?.querySelector('iframe');
  assert.equal(frame?.getAttribute('src'), `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=16&output=embed`, 'the map follows the address, in the country picked in step 1');
  assert.equal(frame.getAttribute('title'), 'Map of your store address');
  assert.match(map().textContent, /Shown on your store page\. Check the pin; wrong spot\? Add the postal code\./);
  const open = host.querySelector('[data-testid="branch-address-map-open"]');
  assert.ok(open && open.textContent.includes('Open in Maps') && decodeURIComponent(open.getAttribute('href') || '').includes(place), 'Open in Maps opens the same place');
  // Right under the address box, before the opening hours.
  const after = (a, b) => Boolean(a.compareDocumentPosition(b) & win.Node.DOCUMENT_POSITION_FOLLOWING);
  const hours = [...host.querySelectorAll('h3')].find((h) => h.textContent.includes('Operating Hours'));
  assert.ok(after(address, map()) && after(map(), hours), 'under the address, before the opening hours');
  passed('Typing the branch address shows it on Google\'s map (the country added), with Open in Maps, under the address');

  // An address that names its country keeps it as it is.
  await type(address, '1 Jalan Sultan, 50000 Kuala Lumpur, Malaysia');
  await wait(800);
  assert.equal(map().querySelector('iframe').getAttribute('src'), `https://maps.google.com/maps?q=${encodeURIComponent('1 Jalan Sultan, 50000 Kuala Lumpur, Malaysia')}&z=16&output=embed`);
  passed('An address that names its country is looked for as typed');

  await act(async () => root.unmount());
  console.log(`\n${passes} branch address map checks passed`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
}
