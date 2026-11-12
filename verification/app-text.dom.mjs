// The owner app in Bahasa Indonesia, Phase 2 (Alvin, 12 Nov 2026: "proceed with phase 2"):
// lib/appText.js and the sign-up and onboarding screens (group 1). English stays the default;
// Indonesian shows once a group is signed off (LIVE_GROUPS) or in a reviewer's preview
// (?preview_language=id). Covers: who gets which language, {blanks} (also links and bold names),
// the language switch and the preview badge, and real sign-up screens in Indonesian with no
// English phrase left on them.
// Run: node verification/app-text.dom.mjs   (jsdom installed in /tmp/sellio-verification)
process.env.TZ = 'UTC'; // no time zone that would say Indonesia (lib/countries.js visitorCountry)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: (navigation|HTMLCanvasElement|window\.scrollTo)/.test(error?.message)) console.error(error); });
// A reviewer opens the sign-in page from the preview link (with another parameter that stays).
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/Auth?preview_language=id&from=whatsapp', pretendToBeVisual: true, virtualConsole });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'SVGElement', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.scrollTo = () => {};
globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 200 });

// The phone's languages, as navigator.languages reports them.
const setPhoneLanguages = (languages) => Object.defineProperty(win.navigator, 'languages', { value: languages, configurable: true });
setPhoneLanguages(['en-US']);

// React's own warnings (a list without keys, say) are failures here.
const reactWarnings = [];
const realError = console.error;
console.error = (...args) => { const line = args.map(String).join(' '); if (/Warning|key/.test(line)) reactWarnings.push(line); realError(...args); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const act = React.act;
const h = React.createElement;

const mocks = {
  clients: "export const getSupabase = async () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }); export const getMobileOAuthClient = () => null; export const SUPABASE_URL = 'https://project.example.invalid';",
  profile: 'export const useAppUser = () => ({ setAppUser() {} });',
  navigation: 'export const completeAuthNavigation = () => {};',
  deletion: 'export const accountDeletionDestination = (value) => value;',
  toast: 'export const toast = Object.assign(() => {}, { error() {}, success() {}, custom() {}, message() {}, info() {} });',
  social: 'export const SocialLogin = { initialize: async () => {}, logout: async () => {}, login: async () => ({}) };',
  google: "export const GOOGLE_WEB_CLIENT_ID = 'client'; export const googleSignInAvailable = () => true; export const startGoogleSignIn = async () => ({});",
  back: 'export const useBackToClose = () => {}; export const handOverBackStep = () => false;',
};
const routes = [[/supabaseClient$/, 'clients'], [/AppUserContext$/, 'profile'], [/authNavigation$/, 'navigation'], [/AccountDeletionForm$/, 'deletion'],
  [/^sonner$/, 'toast'], [/^@capgo\/capacitor-social-login$/, 'social'], [/googleSignIn$/, 'google'], [/useBackToClose$/, 'back']];
const fixtures = { name: 'app-text-fixtures', setup(builder) {
  for (const [filter, key] of routes) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path] }));
} };

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-app-text-'));
const locals = [];
// One bundle, so the screens and the test share one lib/appText.js.
async function bundle(name, lines) {
  const outfile = path.join(tmp, name + '.mjs');
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'js', contents: lines.join('\n') },
    outfile, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [fixtures], logLevel: 'silent', loader: { '.js': 'jsx' },
  });
  const local = path.join(process.cwd(), `.app-text-${name}.mjs`);
  await copyFile(outfile, local);
  locals.push(local);
  return import(pathToFileURL(local));
}

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = (ms = 40) => act(async () => { await sleep(ms); });
const click = async (el, what = 'control') => {
  assert.ok(el, `${what} is there`);
  await act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
  await settle();
};
const buttonNamed = (label, root = document) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
async function mount(element) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await settle();
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}

try {
  const app = await bundle('screens', [
    "export * as appText from '@/lib/appText';",
    "export * as plans from '@/lib/plans';",
    "export { INDUSTRY_OPTIONS } from '@/lib/industry';",
    "export { COLOR_SETS } from '@/components/theme/themeUtils';",
    "export { default as catalog } from '@/locales/id/signup.json';",
    "export { ID_GROUPS } from '@/locales/id/index.js';",
    "export { default as TermsLine } from '@/components/auth/TermsLine';",
    "export { default as AppLanguageSwitch, AppLanguageRow, AppLanguagePreviewBadge } from '@/components/ui-custom/AppLanguageSwitch';",
    "export { default as AuthPricingModal } from '@/components/auth/AuthPricingModal';",
    "export { default as OnboardingProgress } from '@/components/onboarding/OnboardingProgress';",
    "export { default as Auth } from '@/pages/Auth';",
    "export { default as Join } from '@/pages/Join';",
  ]);
  const { appText, plans, catalog } = app;
  const { appT } = appText;

  // 1. The preview link
  assert.equal(appText.isAppLanguagePreview(), true, 'The preview is on');
  assert.equal(localStorage.getItem('sellio_app_language_preview'), '1', 'and stays on, on this device');
  assert.equal(localStorage.getItem('sellio_app_language'), 'id');
  assert.equal(win.location.search, '?from=whatsapp', 'The preview parameter leaves the address; others stay');
  assert.equal(appText.appLanguage(), 'id');
  assert.equal(appText.appLocale(), 'id-ID');
  assert.equal(appT('Save'), 'Save', 'Nothing is downloaded until a screen uses the words (store pages never do)');
  await appText.appTextReady();
  assert.equal(appT('Save'), 'Simpan', 'Loaded when asked for');
  assert.deepEqual(appText.LIVE_GROUPS, [], 'No group is switched on for everyone yet (waiting for a native speaker)');
  passed('A preview link: on for this device, the address cleaned up, and the words load only when a screen wants them');

  // 2. Blanks
  assert.equal(appT('Step {step} of {total}', { step: 2, total: 5 }), 'Langkah 2 dari 5');
  assert.equal(appT('Step {step} of {total}', { step: 2 }), 'Langkah 2 dari {total}', 'A blank with no value stays as written');
  assert.equal(appT('Hi {firstName}!', { firstName: '{total}' }), 'Hai {total}!', 'A value is never filled in again');
  assert.equal(appT('A phrase nobody has translated'), 'A phrase nobody has translated', 'English when there is no Indonesian');
  let page = await mount(h('p', null, appT('We sent it to {forgotMaskedEmail}.', { forgotMaskedEmail: h('strong', null, 'a***@mail.com') })));
  assert.equal(page.host.querySelector('p').innerHTML, 'Kami mengirimnya ke <strong>a***@mail.com</strong>.', 'A bold name in the sentence');
  await page.unmount();
  page = await mount(h(app.TermsLine));
  assert.equal(page.host.querySelector('a[href="/terms"]')?.textContent, 'Syarat dan Ketentuan');
  assert.equal(page.host.querySelector('a[href="/privacy"]')?.textContent, 'Kebijakan Privasi');
  assert.ok(page.host.querySelector('br'), 'The line break is kept');
  assert.equal(page.host.textContent, 'Dengan melanjutkan, Anda menyetujuiSyarat dan Ketentuan serta Kebijakan Privasi Sellio.');
  await act(async () => { appText.setAppLanguage('en'); });
  assert.equal(page.host.textContent, 'By continuing, you agree to Sellio’sTerms and Conditions and Privacy Policy.', 'The same line in English, at once');
  await page.unmount();
  assert.ok(!reactWarnings.some((line) => /unique "key"/.test(line)), 'Links and bold names in a sentence have keys: ' + reactWarnings.join('\n'));
  passed('Blanks: values, links and bold names in their place; a missing one stays; English when nothing is translated');

  // 3. Who gets Indonesian
  const wanted = async ({ phone = ['en-US'], choice = null, shop = null } = {}) => {
    setPhoneLanguages(phone);
    await act(async () => { await appText.resetAppTextForTests({ preview: true, choice, shopCountry: shop }); });
    return appText.wantedAppLanguage();
  };
  assert.equal(await wanted(), 'en', 'English by default');
  assert.equal(await wanted({ phone: ['id-ID', 'en-US'] }), 'id', "The phone's language first");
  assert.equal(await wanted({ phone: ['in-ID'] }), 'id', 'Older Android says "in"');
  assert.equal(await wanted({ phone: ['en-GB', 'id-ID'] }), 'en', 'Only the first language counts (the person put English first)');
  assert.equal(await wanted({ shop: 'Indonesia' }), 'id', "Then the shop's country");
  assert.equal(await wanted({ shop: 'Singapore' }), 'en');
  assert.equal(await wanted({ phone: ['id-ID'], choice: 'en' }), 'en', 'A choice beats everything');
  assert.equal(await wanted({ choice: 'id', shop: 'Malaysia' }), 'id');
  process.env.TZ = 'Asia/Makassar';
  assert.equal(await wanted(), 'id', 'Then where they are: an Indonesian time zone (WITA here)');
  process.env.TZ = 'Asia/Singapore';
  assert.equal(await wanted({ phone: ['en-SG', 'id-ID'] }), 'en', 'Not in Indonesia, English first: English');
  process.env.TZ = 'UTC';
  setPhoneLanguages(['en-US']);
  await act(async () => { await appText.resetAppTextForTests({ preview: false, choice: 'id' }); });
  assert.equal(appText.appLanguageAvailable(), false);
  assert.equal(appText.appLanguage(), 'en', 'Before sign-off, even someone who picked Indonesian sees English');
  assert.equal(appT('Save'), 'Save');
  passed("Who gets Indonesian: their choice, else the phone's language, else the shop's country; nobody before sign-off but a reviewer");

  // 4. The switch and the preview badge
  await act(async () => { await appText.resetAppTextForTests({ preview: false }); });
  page = await mount(h(React.Fragment, null, h(app.AppLanguageSwitch), h(app.AppLanguageRow), h(app.AppLanguagePreviewBadge)));
  assert.equal(page.host.innerHTML, '', 'Nothing shows before sign-off');
  await page.unmount();
  await act(async () => { await appText.resetAppTextForTests({ preview: true, choice: 'id' }); });
  localStorage.setItem('sellio_app_language_preview', '1'); localStorage.setItem('sellio_app_language', 'id');
  page = await mount(h(React.Fragment, null, h(app.AppLanguageSwitch), h(app.AppLanguagePreviewBadge)));
  const group = page.host.querySelector('[data-testid="app-language-switch"]');
  assert.equal(group?.getAttribute('aria-label'), 'Bahasa');
  assert.equal(buttonNamed('Bahasa Indonesia', page.host)?.getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed('English', page.host)?.getAttribute('aria-pressed'), 'false');
  const badge = () => page.host.querySelector('[data-testid="app-language-preview"]');
  const badgeWords = () => [text(badge()?.querySelector('span')), text(badge()?.querySelector('button'))];
  assert.deepEqual(badgeWords(), ['Pratinjau Bahasa Indonesia', 'Akhiri pratinjau']);
  const languageBefore = appText.appLanguage();
  await click(buttonNamed('English', page.host), 'English');
  assert.equal(buttonNamed('English', page.host)?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem('sellio_app_language'), 'en', 'The choice is remembered');
  assert.deepEqual(badgeWords(), ['Indonesian preview', 'End preview'], 'Still a preview, in English now');
  assert.notEqual(languageBefore, appText.appLanguage());
  await click(buttonNamed('End preview', page.host), 'End preview');
  assert.equal(badge(), null, 'The badge goes');
  assert.equal(page.host.querySelector('[data-testid="app-language-switch"]'), null, 'and so does the switch, before sign-off');
  assert.equal(appText.isAppLanguagePreview(), false);
  assert.equal(localStorage.getItem('sellio_app_language_preview'), null);
  assert.equal(localStorage.getItem('sellio_app_language'), null);
  await page.unmount();
  passed('The switch (each language in its own words) and the preview badge; ending the preview puts this device back');

  // 5. Real screens in Indonesian: no English phrase from the catalog left on them
  const english = [];
  for (const phrase of Object.keys(catalog)) {
    for (const part of phrase.split(/\{[a-zA-Z0-9_]+\}/)) {
      const words = part.trim().split(/\s+/).filter(Boolean);
      if (words.length >= 3 && part.trim().length >= 12) english.push(part.trim());
    }
  }
  const leftovers = (shown) => english.filter((part) => shown.includes(part));
  // Words that only English uses: they catch text that was never marked for translation.
  const ENGLISH_WORDS = /\b(the|your|you|and|with|for|of|is|are|this|that|to|or|in|on|at|by|from|will|can|please|sign|our)\b/gi;
  // What's on screen: not the page's own <style> or <script>.
  const visible = (host) => { const copy = host.cloneNode(true); copy.querySelectorAll('style, script').forEach((el) => el.remove()); return text(copy); };
  const checkScreen = (host, what) => {
    const shown = visible(host);
    assert.ok(!/\[object Object\]/.test(shown), `${what}: no "[object Object]"`);
    assert.deepEqual(leftovers(shown), [], `${what}: English left on the Indonesian screen`);
    assert.deepEqual(shown.match(ENGLISH_WORDS) || [], [], `${what}: English words on the Indonesian screen: ${shown}`);
    return shown;
  };
  await act(async () => { await appText.resetAppTextForTests({ preview: true, choice: 'id' }); });

  page = await mount(h(MemoryRouter, null, h(app.Auth)));
  let shown = checkScreen(page.host, 'Sign in');
  for (const words of ['Nomor Ponsel', 'Lupa kata sandi?', 'Masuk dengan Google', 'Dengan melanjutkan, Anda menyetujui', 'Bahasa Indonesia']) {
    assert.ok(shown.includes(words), `Sign in shows "${words}": ${shown}`);
  }
  await click(buttonNamed('Lupa kata sandi?', page.host), 'Lupa kata sandi?');
  shown = checkScreen(page.host, 'Forgot password');
  assert.ok(shown.includes('Reset Kata Sandi') && shown.includes('Masukkan nomor ponsel yang terdaftar'), shown);
  await page.unmount();

  page = await mount(h(MemoryRouter, null, h(app.Join)));
  shown = checkScreen(page.host, 'Create an account');
  for (const words of ['Buat akun Sellio Anda', 'Lanjutkan dengan Google', 'Kirim email verifikasi', 'Sudah punya akun?']) {
    assert.ok(shown.includes(words), `Create an account shows "${words}": ${shown}`);
  }
  await page.unmount();

  setPhoneLanguages(['id-ID']); // an Indonesian phone: Indonesian plans
  page = await mount(h(app.AuthPricingModal, { onClose() {} }));
  shown = checkScreen(page.host, 'Business plans');
  assert.ok(shown.includes('sekitar Rp255.000, ditagih dalam Rupiah'), 'The rupiah line, in Indonesian: ' + shown);
  assert.ok(shown.includes('Harga belum termasuk PPN.'), 'How Indonesian owners pay');
  assert.ok(shown.includes('Hingga 100 pesanan/bulan') && shown.includes('Mulai Uji Coba Gratis'), shown);
  assert.equal(plans.rupiahNote(18), 'about Rp255.000, charged in Rupiah', 'The landing page stays in English');
  await page.unmount();
  setPhoneLanguages(['en-US']);

  page = await mount(h(app.OnboardingProgress, { currentStep: 2, completedSteps: [1], steps: [{ title: appT('Business Theme') }, { title: appT('Branch Setup') }, { title: appT('Menu Setup') }] }));
  shown = checkScreen(page.host, 'Onboarding progress');
  assert.ok(shown.includes('1 / 3 Selesai') && shown.includes('Progres Anda'), shown);
  await page.unmount();

  // Names from shared lists: shown in Indonesian, stored in English
  assert.deepEqual(app.INDUSTRY_OPTIONS.map((option) => [option.value, appT(option.label)]), [['f&b', 'Makanan & Minuman / Kafe / Restoran'], ['retail', 'Ritel'], ['service', 'Jasa']]);
  assert.equal(app.COLOR_SETS[0].name, 'Ocean Blue', "A colour's id stays English");
  assert.equal(appT(app.COLOR_SETS[0].name), 'Biru Laut');
  assert.equal(appT('Table {number}', { number: 3 }), 'Meja 3', 'New tables are named in the owner’s language');
  assert.ok(!reactWarnings.some((line) => /unique "key"/.test(line)), reactWarnings.join('\n'));
  passed('Sign in, forgot password, create an account, business plans and onboarding progress in Indonesian, with no English phrase left');

  // 6. The catalog
  const blanks = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
  const notIndonesian = /\b(kamu|kau|sila|percuma|kedai|kata laluan|telefon|bimbit|anda)\b/;
  for (const [english, indonesian] of Object.entries(catalog)) {
    assert.ok(typeof indonesian === 'string' && indonesian.trim(), `"${english}" has Indonesian`);
    assert.equal(blanks(indonesian), blanks(english), `"${english}" keeps its blanks`);
    assert.ok(!notIndonesian.test(indonesian), `"${indonesian}": Indonesian, formal "Anda" (not Malay, not "kamu")`);
  }
  assert.deepEqual(Object.keys(app.ID_GROUPS), ['signup'], 'Group 1 is the sign-up and onboarding screens');
  passed(`The catalog: ${Object.keys(catalog).length} phrases, each with its blanks, in Indonesian (formal "Anda", no Malay words)`);

  // 7. Ending a preview with the link, as another device would (a fresh copy of the module)
  localStorage.setItem('sellio_app_language_preview', '1'); localStorage.setItem('sellio_app_language', 'id');
  dom.reconfigure({ url: 'https://sellio.sg/Dashboard?preview_language=off' });
  const fresh = await bundle('fresh', ["export * from '@/lib/appText';"]);
  assert.equal(fresh.isAppLanguagePreview(), false);
  assert.equal(localStorage.getItem('sellio_app_language_preview'), null);
  assert.equal(localStorage.getItem('sellio_app_language'), null);
  assert.equal(win.location.search, '');
  assert.equal(fresh.appLanguage(), 'en');
  passed('?preview_language=off ends the preview on that device');

  console.log(`\nAll ${passes} checks passed.`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  for (const local of locals) await rm(local, { force: true });
}
dom.window.close();
process.exit(0);
