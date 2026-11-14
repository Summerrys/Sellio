// Profile photos (Alvin, 10 Nov 2026: "use their [Google] profile photo and replace the profile
// placeholder as their photo. They can also edit and change another image if they wish to"):
// the photo in place of the letter, and "Profile photo": choose one (shrunk, put in the person's
// own folder, then made their photo; the old upload removed), use the Google photo, or remove it.
// Sellio's server (my_profile_photo, set_profile_photo) and the storage bucket are stand-ins.
// Run: node verification/profile-photo.dom.mjs   (jsdom installed in /tmp/sellio-verification)
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
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'File', 'Blob']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

// Sellio's server and storage, as stand-ins: the photo as the person last chose it.
const FOLDER = '00000000-0000-0000-0000-00000000abcd';
const GOOGLE = 'https://lh3.googleusercontent.com/a/mei=s256-c';
const server = { choice: null, path: null, google: GOOGLE, calls: [], uploads: [], removed: [], failUpload: false };
const answer = () => ({
  source: server.choice === 'upload' ? 'upload' : server.choice === 'none' ? null : (server.google ? 'google' : null),
  path: server.choice === 'upload' ? server.path : null, google: server.google, folder: FOLDER,
});
globalThis.fakeClient = {
  rpc: async (name, args) => {
    server.calls.push([name, args]);
    if (name === 'my_profile_photo') return { data: answer(), error: null };
    if (name === 'set_profile_photo') {
      const old = server.path;
      if (args.p_choice === 'upload') {
        if (!server.uploads.some((u) => u.path === args.p_path)) return { data: null, error: { message: 'That photo didn’t upload. Please try again.' } };
        server.choice = 'upload'; server.path = args.p_path;
      } else {
        server.choice = args.p_choice === 'google' ? null : 'none'; server.path = null;
      }
      return { data: { ...answer(), replaced: old && old !== server.path ? old : null }, error: null };
    }
    return { data: null, error: null };
  },
  storage: {
    from: (bucket) => ({
      upload: async (p, blob, options) => {
        if (server.failUpload) return { data: null, error: { message: 'boom' } };
        server.uploads.push({ bucket, path: p, type: options.contentType, cache: options.cacheControl, upsert: options.upsert, size: blob.size });
        return { data: { path: p }, error: null };
      },
      remove: async (paths) => { server.removed.push(...paths.map((p) => `${bucket}/${p}`)); return { data: [], error: null }; },
    }),
  },
};
const toasts = [];
globalThis.toasts = toasts;
const mocks = {
  supabase: "export const getSupabase = async () => globalThis.fakeClient; export const SUPABASE_URL = 'https://project.supabase.co';",
  shrink: [
    "export const LONG_CACHE = '31536000';",
    'export async function shrinkImage(file, options) {',
    '  globalThis.shrunkWith = options;',
    "  if (file.name === 'photo.heic') return { blob: file, type: 'image/heic', ext: 'heic' };",
    "  return { blob: new Blob(['small'], { type: 'image/webp' }), type: 'image/webp', ext: 'webp' };",
    '}',
  ].join('\n'),
  pwa: 'export const isAndroid = () => !!globalThis.onPhone; export const isIOS = () => false;',
  chatCount: 'export default function ExploreChatCount() { return null; }',
  toast: 'export const toast = { error: (m, o) => globalThis.toasts.push(["error", m, o?.description]), success: (m) => globalThis.toasts.push(["success", m]), message: (m) => globalThis.toasts.push(["message", m]) };',
  camera: 'import React from "react"; export default function Camera({ children, className }) { return React.createElement("span", { className, "data-testid": "take-photo" }, children); }',
};
const plugin = { name: 'profile-photo-fixtures', setup(builder) {
  for (const [filter, key] of [[/supabaseClient$/, 'supabase'], [/lib\/imageShrink$/, 'shrink'], [/lib\/pwaInstall$/, 'pwa'], [/^sonner$/, 'toast'], [/NativeCameraScanControl$/, 'camera'], [/ExploreChatCount$/, 'chatCount']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-profile-photo-'));
const local = path.join(process.cwd(), '.profile-photo-bundle.mjs');
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async () => { await act(async () => { await sleep(20); }); };

try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: "export * from '@/components/profile/ProfilePhoto'; export * as photos from '@/lib/profilePhoto';" },
    outfile: path.join(tmp, 'photo.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'photo.mjs'), local);
  const { ProfileAvatar, ProfilePhotoEditor, photos } = await import(pathToFileURL(local));

  // Where a photo is shown from.
  assert.equal(photos.profilePhotoUrl(null), null);
  assert.equal(photos.profilePhotoUrl({ source: null, google: GOOGLE }), null, 'removed: the letter');
  assert.equal(photos.profilePhotoUrl({ source: 'google', google: GOOGLE }), GOOGLE);
  assert.equal(photos.profilePhotoUrl({ source: 'upload', path: `${FOLDER}/17.webp` }), `https://project.supabase.co/storage/v1/object/public/profile-photos/${FOLDER}/17.webp`);
  passed('the photo shown: Google’s, an upload’s public address, or none');

  const roots = [];
  async function render(element) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host); roots.push(root);
    await act(async () => root.render(element));
    await settle();
    return host;
  }
  async function cleanup() { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ''; }

  // Mei signed in with Google: her Google photo in place of "M", everywhere it's shown.
  let view = await render(React.createElement('div', null,
    React.createElement(ProfileAvatar, { email: 'Mei@Bakes.sg', initial: 'M', size: 32 }),
    React.createElement(ProfileAvatar, { email: 'mei@bakes.sg', initial: 'M', size: 56 })));
  let imgs = view.querySelectorAll('img[data-testid="profile-photo"]');
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].getAttribute('src'), GOOGLE);
  assert.equal(imgs[0].getAttribute('referrerpolicy'), 'no-referrer', "Google's photos load without a referrer");
  assert.equal(imgs[0].style.width, '32px');
  assert.equal(server.calls.filter(([n]) => n === 'my_profile_photo').length, 1, 'read once for both');
  // A photo that won't load: the letter.
  await act(async () => { imgs[1].dispatchEvent(new Event('error')); });
  assert.equal(view.querySelectorAll('img').length, 1);
  assert.equal(text(view.querySelectorAll('[data-testid="profile-initial"]')[0]), 'M');
  await cleanup();
  passed('a Google sign-in: the Google photo in place of the letter (read once); one that won’t load shows the letter');

  // The profile window's photo: a tap opens Profile photo. On a computer: Choose a photo; her
  // Google photo is the one shown, so no "Use my Google photo"; Remove photo.
  view = await render(React.createElement(ProfilePhotoEditor, { email: 'mei@bakes.sg', initial: 'M' }));
  const openSheet = async () => {
    await act(async () => { document.querySelector('[data-testid="profile-photo-button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return document.querySelector('[data-testid="profile-photo-options"]');
  };
  let sheet = await openSheet();
  assert.ok(sheet, 'Profile photo opens');
  assert.match(text(document.body), /Profile photo/);
  assert.deepEqual([...sheet.querySelectorAll('.text-\\[15px\\]')].map(text), ['Choose a photo', 'Remove photo']);
  assert.equal(sheet.querySelector('[data-testid="take-photo"]'), null, 'no camera on a computer');

  // Choose a photo: shrunk to 512px, put in her own folder (a new name, a year's caching),
  // made her photo; shown at once.
  const choose = async (file) => {
    const input = document.querySelector('[data-testid="profile-photo-options"] input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
  };
  await choose(new File(['big photo'], 'me.jpg', { type: 'image/jpeg' }));
  assert.deepEqual(globalThis.shrunkWith, { maxSide: 512 });
  assert.equal(server.uploads.length, 1);
  const first = server.uploads[0];
  assert.equal(first.bucket, 'profile-photos');
  assert.match(first.path, new RegExp(`^${FOLDER}/\\d+\\.webp$`), 'in her own folder');
  assert.equal(first.type, 'image/webp');
  assert.equal(first.cache, '31536000');
  assert.equal(first.upsert, false);
  assert.deepEqual(server.calls.at(-1), ['set_profile_photo', { p_choice: 'upload', p_path: first.path }]);
  assert.equal(document.querySelector('[data-testid="profile-photo-options"]'), null, 'the sheet closes');
  assert.equal(document.querySelector('[data-testid="profile-photo-button"] img').getAttribute('src'), `https://project.supabase.co/storage/v1/object/public/profile-photos/${first.path}`);
  assert.deepEqual(toasts.at(-1), ['success', 'Photo updated']);
  passed('Choose a photo: shrunk, put in her own folder, made her photo and shown at once');

  // Another photo: the first upload is removed.
  await sleep(5);
  sheet = await openSheet();
  assert.deepEqual([...sheet.querySelectorAll('.text-\\[15px\\]')].map(text), ['Choose a photo', 'Use my Google photo', 'Remove photo'], 'her own photo shown: Use my Google photo');
  await choose(new File(['another'], 'again.png', { type: 'image/png' }));
  assert.equal(server.uploads.length, 2);
  assert.deepEqual(server.removed, [`profile-photos/${first.path}`], 'the old upload removed');
  passed('a new photo replaces the old one, which is removed');

  // Use my Google photo: back to it; the upload removed.
  sheet = await openSheet();
  await act(async () => { [...sheet.querySelectorAll('button')].find((b) => /Use my Google photo/.test(text(b))).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
  assert.deepEqual(server.calls.at(-1), ['set_profile_photo', { p_choice: 'google' }]);
  assert.equal(document.querySelector('[data-testid="profile-photo-button"] img').getAttribute('src'), GOOGLE);
  assert.equal(server.removed.length, 2, 'the second upload removed too');
  assert.deepEqual(toasts.at(-1), ['success', 'Using your Google photo']);
  passed('Use my Google photo goes back to it');

  // Remove photo: the letter.
  sheet = await openSheet();
  await act(async () => { [...sheet.querySelectorAll('button')].find((b) => /Remove photo/.test(text(b))).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
  assert.deepEqual(server.calls.at(-1), ['set_profile_photo', { p_choice: 'none' }]);
  assert.equal(document.querySelector('[data-testid="profile-photo-button"] img'), null);
  assert.equal(text(document.querySelector('[data-testid="profile-initial"]')), 'M');
  sheet = await openSheet();
  assert.deepEqual([...sheet.querySelectorAll('.text-\\[15px\\]')].map(text), ['Choose a photo', 'Use my Google photo'], 'no photo: nothing to remove');
  passed('Remove photo shows the letter; then only choosing a photo or the Google one is offered');

  // A photo type a phone's browser can't show (HEIC that couldn't be shrunk): not uploaded.
  const before = server.uploads.length;
  await choose(new File(['heic'], 'photo.heic', { type: 'image/heic' }));
  assert.equal(document.querySelector('[data-testid="profile-photo-options"]'), null);
  assert.equal(server.uploads.length, before, 'not uploaded');
  assert.deepEqual(toasts.at(-1), ['error', 'Couldn’t change your photo', 'This photo can’t be used. Please choose a JPG, PNG or WebP photo.']);
  // The upload fails: said so; nothing changed.
  server.failUpload = true;
  sheet = await openSheet();
  await choose(new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
  assert.deepEqual(toasts.at(-1), ['error', 'Couldn’t change your photo', 'Couldn’t upload the photo. Please try again.']);
  assert.equal(server.choice, 'none', 'still none');
  server.failUpload = false;
  await cleanup();
  passed('a photo that can’t be used, or an upload that fails, says so and changes nothing');

  // On a phone: Take photo and Choose from gallery. Without a Google photo: no Google option.
  globalThis.onPhone = true;
  server.google = null; server.choice = null;
  photos.forgetProfilePhotos();
  await render(React.createElement(ProfilePhotoEditor, { email: 'phone@sellio.app', initial: 'P' }));
  assert.equal(document.querySelector('[data-testid="profile-photo-button"] img'), null, 'a phone sign-in: the letter');
  sheet = await openSheet();
  assert.ok(sheet.querySelector('[data-testid="take-photo"]'), 'Take photo');
  assert.deepEqual([...sheet.querySelectorAll('.text-\\[15px\\]')].map(text), ['Take photo', 'Choose from gallery']);
  await cleanup();
  passed('on a phone: Take photo and Choose from gallery; no Google photo, no Google option');

  // Where it's used: Me (a buyer changes it there; a seller in the profile window), the profile
  // window, and the side menu.
  const me = await readFile(path.join(process.cwd(), 'src/components/explore/ExploreMe.jsx'), 'utf8');
  assert.match(me, /const avatar = hasShop \? \(\s*<ProfileAvatar email=\{photoEmail\}[\s\S]*?\) : \(\s*<ProfilePhotoEditor email=\{photoEmail\}/);
  const panel = await readFile(path.join(process.cwd(), 'src/components/profile/AccountProfileModal.jsx'), 'utf8');
  assert.match(panel, /<ProfilePhotoEditor\s+email=\{user\?\.email\}\s+initial=\{initial\}\s+size=\{72\}/);
  const layout = await readFile(path.join(process.cwd(), 'src/Layout.jsx'), 'utf8');
  assert.match(layout, /<ProfileAvatar\s+email=\{user\?\.email\}[\s\S]{0,160}size=\{32\}/);
  passed('shown on Me, in the profile window (where it’s changed) and in the side menu');

  console.log(passes + ' profile-photo checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
process.exit(0);
