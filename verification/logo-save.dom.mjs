// The shop's logo in Settings > Business Identity (Alvin, 10 Nov 2026: "When I tried to upload
// another image in business identity, it did not load or save it"). The photo editor waits for a
// replacement photo to open before Save, Rotate and Crop work (a Save tapped meanwhile saved the
// photo from before), and the logo saves as soon as it's chosen, edited or removed (it waited for
// Save Changes at the foot of the page); Remove has Undo. Sellio's server and storage are
// stand-ins, and so are pictures and canvases: the test opens each photo itself, and a saved
// photo says which photo it was drawn from.
// Run: node verification/logo-save.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/TenantSettings', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLCanvasElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'File', 'FileReader']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Pictures open only when the test says so (a big phone photo can take seconds).
const images = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.crossOrigin = null; this._src = ''; this.naturalWidth = 0; this.naturalHeight = 0; images.push(this); }
  set src(value) { this._src = value; }
  get src() { return this._src; }
}
globalThis.Image = win.Image = FakeImage;
const picture = (src) => images.filter((img) => img._src === src).at(-1);
const latestPicture = () => images.filter((img) => img._src).at(-1);
// Canvases: a drawing remembers the photo drawn on it, and a saved one says which.
win.HTMLCanvasElement.prototype.getContext = function getContext() {
  const canvas = this;
  return { clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, imageSmoothingQuality: 'low', drawImage(source) { canvas.drawnFrom = source._src ?? source.drawnFrom; } };
};
win.HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
  return 'data:image/jpeg;base64,' + Buffer.from('drawn from ' + (this.drawnFrom || 'nothing')).toString('base64');
};
const drawnFrom = async (blob) => (typeof blob.text === 'function' ? blob.text() : null);
// A phone reads a big photo slowly: while reading.slow, each read waits until the test lets it go.
const reading = [];
const read = win.FileReader.prototype.readAsDataURL;
win.FileReader.prototype.readAsDataURL = function readAsDataURL(blob) {
  if (!reading.slow) return read.call(this, blob);
  const reader = this;
  // go(): read it; fail(): the read ends without a photo.
  reading.push(Object.assign(() => read.call(reader, blob), { fail: () => reader.onloadend?.() }));
};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;

// Sellio's server and storage, as stand-ins.
const BUCKET_URL = 'https://project.supabase.co/storage/v1/object/public/product-images/';
const server = { updates: [], uploads: [], failUpload: false };
globalThis.fakeClient = {
  from: (table) => {
    if (table === 'tenants') {
      return { update: (values) => ({ eq: async (column, id) => { server.updates.push({ values, column, id }); return { error: null }; } }) };
    }
    const query = { select() { return query; }, eq() { return query; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
    return query;
  },
  storage: {
    from: (bucket) => ({
      upload: async (where, blob, options) => {
        if (server.failUpload) return { data: null, error: { message: 'new row violates row-level security policy' } };
        server.uploads.push({ bucket, path: where, blob, options });
        return { data: { path: where }, error: null };
      },
      getPublicUrl: (where) => ({ data: { publicUrl: BUCKET_URL + where } }),
    }),
  },
};
const toasts = [];
globalThis.toasts = toasts;
const mocks = {
  supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
  shrink: [
    "export const LOGO_MAX_SIDE = 800; export const LONG_CACHE = '31536000';",
    'export class UnreadablePhotoError extends Error {}',
    "export const UNREADABLE_PHOTO_MESSAGE = 'This photo did not come through in full.';",
    "export async function checkPhoto(file) { if (file?.name === 'cut-off.jpg') throw new UnreadablePhotoError('This photo didn’t come through in full from your phone. Please take it again or choose another photo.'); }",
    "export async function shrinkImage(input, options) { globalThis.shrunkWith = options; return { blob: input, type: 'image/jpeg', ext: 'jpg' }; }",
  ].join('\n'),
  toast: [
    'export const toast = Object.assign((m) => globalThis.toasts.push(["message", m]), {',
    '  success: (m, o) => globalThis.toasts.push(["success", m, o]),',
    '  error: (m, o) => globalThis.toasts.push(["error", m, o?.description]),',
    '  message: (m) => globalThis.toasts.push(["message", m]),',
    '});',
  ].join('\n'),
  tenant: 'export const useTenant = () => ({ hasPermission: () => true, canUseFeature: () => true });',
  refresh: 'export const useAppReloadGuard = () => {};',
  back: [
    'import { useState } from "react";',
    'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
    'export function useOpenWithBack(open, defaultOpen, onOpenChange) { const [own, setOwn] = useState(!!defaultOpen); return open === undefined ? [own, (next) => { setOwn(next); onOpenChange?.(next); }] : [open, onOpenChange]; }',
  ].join('\n'),
  nothing: 'export default function Nothing() { return null; }',
};
const routes = [
  [/lib\/supabaseClient$/, 'supabase'], [/lib\/imageShrink$/, 'shrink'], [/^sonner$/, 'toast'],
  [/components\/tenant\/TenantContext$/, 'tenant'], [/lib\/AppRefreshContext$/, 'refresh'], [/lib\/useBackToClose$/, 'back'],
  [/settings\/PrinterSettings$|ui-custom\/AddressMap$/, 'nothing'],
];
const plugin = { name: 'logo-fixtures', setup(builder) {
  for (const [filter, key] of routes) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => act(async () => { await sleep(30); });
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); }); await settle(); };
const button = (label, root = document) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
// A photo chosen in a file input, as a browser has it: the input's value names the file.
const choose = async (input, file) => {
  let value = 'C:\\fakepath\\' + file.name;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  Object.defineProperty(input, 'value', { get: () => value, set: (next) => { value = next; }, configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
};
const openPicture = async (img, width = 1200, height = 800) => { img.naturalWidth = width; img.naturalHeight = height; await act(async () => { img.onload?.(); }); await settle(); };
const asDataUrl = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(file); });

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-logo-'));
const local = path.join(process.cwd(), '.logo-save-bundle.mjs');
try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export { default as ImageEditModal } from '@/components/onboarding/ImageEditModal'; export { default as BusinessProfileTab } from '@/components/settings/BusinessProfileTab';" },
    outfile: path.join(tmp, 'logo.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent', loader: { '.js': 'jsx' },
  });
  await copyFile(path.join(tmp, 'logo.mjs'), local);
  const { ImageEditModal, BusinessProfileTab } = await import(pathToFileURL(local));

  // ── The photo editor: Save, Rotate and Crop wait for the photo on screen ──
  {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    const saved = [];
    let closed = 0;
    const OLD = BUCKET_URL + 'shop-1/logo/1.jpg';
    await act(async () => { root.render(React.createElement(ImageEditModal, { src: OLD, onSave: (data) => saved.push(data), onClose: () => { closed++; } })); });
    await settle();
    const save = () => button('Save');
    const rotate = () => button('Rotate');
    const crop = () => button('Crop');
    const note = () => document.querySelector('[data-testid="photo-opening"]');
    assert.ok(note(), 'the logo shows as opening');
    assert.match(text(note()), /Opening photo…/);
    assert.equal(save().disabled, true, 'Save waits for it');
    assert.equal(rotate().disabled, true, 'Rotate waits for it');
    assert.equal(crop().disabled, true, 'Crop waits for it');
    await openPicture(picture(OLD));
    assert.equal(note(), null, 'opened');
    assert.equal(save().disabled, false);
    assert.equal(rotate().disabled, false);
    assert.equal(crop().disabled, false);
    assert.equal(document.querySelector('canvas').drawnFrom, OLD, 'drawn on screen');
    passed('the editor shows a photo as opening until it has, with Save, Rotate and Crop waiting for it');

    // Rotate turns the photo on screen: it doesn't open it again.
    const opened = images.length;
    await click(rotate());
    assert.equal(images.filter((img, i) => i >= opened && img._src).length, 0, 'not opened again');
    assert.equal(save().disabled, false, 'Save still works after a turn');
    assert.equal(note(), null);
    passed('Rotate doesn’t open the photo again');

    // A replacement that didn't come through whole from the phone is refused, and the photo
    // on screen can still be saved.
    const replace = host.querySelector('input[type="file"]');
    await choose(replace, new File(['half'], 'cut-off.jpg', { type: 'image/jpeg' }));
    assert.deepEqual(toasts.at(-1), ['error', 'This photo didn’t come through in full from your phone. Please take it again or choose another photo.', undefined]);
    assert.equal(save().disabled, false, 'the photo on screen can still be saved');
    assert.equal(note(), null);
    passed('a replacement that didn’t come through whole is refused; the photo on screen stays usable');

    // Replace: from the moment a photo is chosen, Save waits — while the phone reads it, then
    // while it opens. A Save tapped meanwhile saved the photo from before (the bug).
    const fresh = new File(['fresh logo'], 'fresh.png', { type: 'image/png' });
    const freshUrl = await asDataUrl(fresh);
    const second = new File(['second logo'], 'second.png', { type: 'image/png' });
    const secondUrl = await asDataUrl(second);
    const third = new File(['third logo'], 'third.png', { type: 'image/png' });
    const thirdUrl = await asDataUrl(third);
    reading.slow = true;
    await choose(replace, fresh);
    assert.equal(reading.length, 1, 'being read');
    assert.equal(picture(freshUrl), undefined);
    assert.equal(save().disabled, true, 'Save waits while the phone reads the photo');
    assert.equal(rotate().disabled, true);
    assert.match(text(note()), /Opening photo…/);
    await click(save());
    assert.deepEqual(saved, [], 'nothing saved while it’s read (until 10 Nov 2026 this saved the old photo)');
    assert.equal(closed, 0, 'and the editor stays open');
    await act(async () => { reading.shift()(); });
    await settle();
    const freshPicture = picture(freshUrl);
    assert.ok(freshPicture, 'read: now it opens');
    assert.equal(save().disabled, true, 'Save waits while it opens');
    assert.match(text(note()), /Opening photo…/);
    await click(save());
    assert.deepEqual(saved, [], 'nothing saved while it opens');
    passed('a Save tapped while the replacement is read or opens saves nothing (it used to save the old photo)');

    // Replaced again before the first was read: the first, read late, changes nothing.
    await choose(replace, second);
    await choose(replace, third);
    assert.equal(reading.length, 2);
    const [readSecond, readThird] = reading.splice(0);
    reading.slow = false;
    await act(async () => { readThird(); });
    await settle();
    await act(async () => { readSecond(); });
    await settle();
    assert.equal(picture(secondUrl), undefined, 'the second, read late, isn’t opened');
    assert.ok(picture(thirdUrl), 'the last one chosen is');
    // And a photo that opens late, after the one now on screen, isn't the one saved either.
    const lateOpen = freshPicture.onload;
    assert.equal(save().disabled, true);
    await openPicture(picture(thirdUrl));
    assert.equal(save().disabled, false);
    assert.equal(document.querySelector('canvas').drawnFrom, thirdUrl, 'the last photo chosen on screen');
    freshPicture.naturalWidth = 640; freshPicture.naturalHeight = 480;
    await act(async () => { lateOpen?.(); });
    await settle();
    await click(save());
    assert.equal(saved.length, 1);
    assert.equal(Buffer.from(saved[0].split(',')[1], 'base64').toString(), 'drawn from ' + thirdUrl, 'Save saves the photo on screen');
    assert.equal(closed, 1);
    passed('replaced again: the last photo chosen is the one saved, not one read or opened late');

    await act(async () => root.unmount()); host.remove();
  }

  // A photo that can't be opened says so, and isn't saved blank.
  {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    const saved = [];
    const GONE = BUCKET_URL + 'shop-1/logo/gone.jpg';
    await act(async () => { root.render(React.createElement(ImageEditModal, { src: GONE, onSave: (data) => saved.push(data), onClose() {} })); });
    await settle();
    await act(async () => { picture(GONE).onerror?.(); });
    await settle();
    assert.match(text(document.querySelector('[data-testid="photo-opening"]')), /^Couldn’t open this photo\. Tap Replace to choose it again\.$/);
    assert.equal(button('Save').disabled, true);
    assert.equal(button('Replace').disabled, false, 'Replace still works');
    assert.equal(button('Delete').disabled, false, 'and Delete');
    await click(button('Save'));
    assert.deepEqual(saved, []);
    passed('a photo that can’t be opened says so, with Save off and Replace on');

    // Replace: a photo the phone can't read says so; then one that opens is saved.
    const replace = host.querySelector('input[type="file"]');
    const good = new File(['good logo'], 'good.png', { type: 'image/png' });
    const goodUrl = await asDataUrl(good);
    reading.slow = true;
    await choose(replace, new File(['unreadable'], 'unreadable.png', { type: 'image/png' }));
    await act(async () => { reading.shift().fail(); });
    await settle();
    reading.slow = false;
    assert.deepEqual(toasts.at(-1), ['error', 'Couldn’t open that photo. Please choose it again.', undefined]);
    assert.equal(button('Save').disabled, true, 'still nothing to save');
    await choose(replace, good);
    await openPicture(picture(goodUrl));
    await click(button('Save'));
    assert.equal(Buffer.from(saved[0].split(',')[1], 'base64').toString(), 'drawn from ' + goodUrl);
    await act(async () => root.unmount()); host.remove();
    passed('a replacement the phone can’t read says so; one that opens is saved');
  }

  // ── Settings > Business Identity: the logo saves straight away ──
  const OLD = BUCKET_URL + 'shop-1/logo/1.jpg';
  const shop = { id: 'shop-1', name: 'Mei’s Bakes', seller_type: 'individual', currency: 'SGD', logo_url: OLD, settings: {} };
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidated = [];
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (filters) => { invalidated.push(filters?.queryKey); return invalidate(filters); };
  const render = async (tenant) => {
    await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(BusinessProfileTab, { tenant, tenantId: 'shop-1' }))); });
    await settle();
  };
  await render(shop);
  const logo = () => host.querySelector('img[alt="Logo"]');
  const box = () => logo()?.parentElement;
  const loading = () => host.querySelector('[data-testid="logo-loading"]');
  const settingsInput = () => host.querySelector('input[type="file"]');
  const shown = async () => { await act(async () => { logo().dispatchEvent(new Event('load')); }); await settle(); };

  assert.equal(logo().getAttribute('src'), OLD);
  assert.ok(loading(), 'the logo shows as loading until it has');
  assert.equal(logo().style.opacity, '0');
  await shown();
  assert.equal(loading(), null);
  assert.equal(logo().style.opacity, '1');
  passed('Settings shows the logo as loading until it has');

  // The editor, from a tap on the logo: replace, Save, and it's the shop's logo at once.
  await click(box());
  assert.ok(button('Save'), 'the editor opens');
  await openPicture(picture(OLD));
  const editorInput = [...document.querySelectorAll('input[type="file"]')].find((input) => input !== settingsInput());
  const fresh = new File(['fresh logo'], 'fresh.png', { type: 'image/png' });
  const freshUrl = await asDataUrl(fresh);
  await choose(editorInput, fresh);
  await click(button('Save'));
  assert.deepEqual(server.uploads, [], 'Save waits for the replacement here too');
  await openPicture(picture(freshUrl));
  await click(button('Save'));
  await settle();
  assert.equal(button('Save'), undefined, 'the editor closed');
  assert.equal(server.uploads.length, 1, 'uploaded');
  const upload = server.uploads[0];
  assert.equal(upload.bucket, 'product-images');
  assert.match(upload.path, /^shop-1\/logo\/\d+\.jpg$/);
  assert.equal(await drawnFrom(upload.blob), 'drawn from ' + freshUrl, 'the new photo, not the old one');
  assert.equal(globalThis.shrunkWith.maxSide, 800, 'shrunk to a logo’s size');
  const NEW = BUCKET_URL + upload.path;
  assert.deepEqual(server.updates, [{ values: { logo_url: NEW }, column: 'id', id: 'shop-1' }], 'saved as the shop’s logo at once (no Save Changes)');
  assert.deepEqual(toasts.at(-1).slice(0, 2), ['success', 'Logo saved']);
  assert.ok(invalidated.some((key) => key?.[0] === 'currentTenant'), 'the menu’s logo is fetched again');
  assert.equal(logo().getAttribute('src'), NEW, 'Settings shows the new logo');
  assert.ok(loading(), 'loading until it shows');
  await shown();
  passed('edited in the editor: the new photo is uploaded and saved as the logo straight away');

  // The shop fetched again (the old logo while the new one saved, then the new one).
  await render({ ...shop, logo_url: NEW });
  assert.equal(logo().getAttribute('src'), NEW);
  passed('the shop fetched again keeps the new logo');

  // Remove: at once, with Undo.
  await click(button('Remove logo'));
  assert.deepEqual(server.updates.at(-1).values, { logo_url: '' }, 'removed at once');
  const removed = toasts.at(-1);
  assert.equal(removed[0], 'success');
  assert.equal(removed[1], 'Logo removed');
  assert.equal(removed[2]?.action?.label, 'Undo');
  assert.equal(logo(), null);
  assert.match(text(host), /Upload Logo/);
  await act(async () => { removed[2].action.onClick(); });
  await settle();
  assert.deepEqual(server.updates.at(-1).values, { logo_url: NEW }, 'Undo puts it back');
  assert.equal(logo().getAttribute('src'), NEW);
  await shown();
  passed('Remove logo removes it at once, and Undo puts it back');

  // A photo chosen from the page (no editor): saved at once.
  await click(button('Remove logo'));
  await render({ ...shop, logo_url: '' });
  const picked = new File(['picked'], 'picked.png', { type: 'image/png' });
  const updatesBefore = server.updates.length;
  await choose(settingsInput(), picked);
  assert.equal(server.uploads.length, 2);
  assert.equal(server.uploads[1].blob.name, 'picked.png', 'the chosen photo uploaded');
  const PICKED = BUCKET_URL + server.uploads[1].path;
  assert.deepEqual(server.updates.slice(updatesBefore).map((u) => u.values), [{ logo_url: PICKED }], 'and saved as the logo');
  assert.equal(settingsInput().value, '', 'the same photo can be chosen again');
  assert.equal(logo().getAttribute('src'), PICKED);
  passed('a photo chosen on the page is uploaded and saved as the logo at once');

  // An upload that doesn't go through: plain words, and the logo stays as it was.
  server.failUpload = true;
  const updatesNow = server.updates.length;
  await choose(settingsInput(), new File(['nope'], 'nope.png', { type: 'image/png' }));
  server.failUpload = false;
  assert.equal(server.updates.length, updatesNow, 'nothing saved');
  const failure = toasts.at(-1);
  assert.equal(failure[0], 'error');
  assert.equal(failure[1], 'Couldn’t save the logo');
  assert.doesNotMatch(failure[2] || '', /row-level|policy/i, 'in plain words');
  assert.equal(logo().getAttribute('src'), PICKED, 'the logo stays as it was');
  passed('an upload that fails says so in plain words; the logo stays as it was');

  // A logo that can't be shown: says so; a tap chooses another (the editor couldn't open it).
  await act(async () => { logo().dispatchEvent(new Event('error')); });
  await settle();
  assert.match(text(box()), /Couldn’t show the logo\. Tap to choose it again\./);
  let chooserOpened = 0;
  settingsInput().click = () => { chooserOpened++; };
  await click(box());
  assert.equal(chooserOpened, 1, 'the photo chooser opens');
  assert.equal(button('Save'), undefined, 'not the editor');
  passed('a logo that can’t be shown says so, and a tap chooses another');

  // Save Changes saves the other details, never the logo.
  const name = [...host.querySelectorAll('input')].find((input) => input.value === 'Mei’s Bakes');
  const setValue = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setValue.call(name, 'Mei’s Bakes & Co'); name.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle();
  await click(button('Save Changes'));
  const details = server.updates.at(-1).values;
  assert.equal(details.name, 'Mei’s Bakes & Co');
  assert.equal('logo_url' in details, false, 'Save Changes leaves the logo alone');
  passed('Save Changes saves the other details and leaves the logo alone');

  await act(async () => root.unmount()); host.remove();
  console.log(passes + ' logo checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
