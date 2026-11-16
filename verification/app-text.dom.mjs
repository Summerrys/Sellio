// The owner app in Bahasa Indonesia, Phase 2 (Alvin, 12 Nov 2026: "proceed with phase 2"):
// lib/appText.js and the sign-up and onboarding screens (group 1). English stays the default;
// Indonesian shows once a group is switched on (LIVE_GROUPS: sign-up and the shop screens since
// 15 Nov 2026) or in a reviewer's preview
// (?preview_language=id). Covers: who gets which language, {blanks} (also links and bold names),
// the language switch and the preview badge, and real sign-up screens in Indonesian with no
// English phrase left on them.
// Run: node verification/app-text.dom.mjs   (jsdom installed in /tmp/sellio-verification)
process.env.TZ = 'UTC'; // no time zone that would say Indonesia (lib/countries.js visitorCountry)
// The language under test: Indonesian, or 中文 / Malay (APP_TEXT_LANGUAGE=zh|ms; app-text-zh.dom.mjs
// and app-text-ms.dom.mjs run this file that way): the same screens, with no English left on them.
const L = process.env.APP_TEXT_LANGUAGE || 'id';
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
const dom = new JSDOM('<html><head></head><body></body></html>', { url: `https://sellio.sg/Auth?preview_language=${L}&from=whatsapp`, pretendToBeVisual: true, virtualConsole });
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
  const local = path.join(process.cwd(), `.app-text-${name}-${L}.mjs`);
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
    `export { default as catalog } from '@/locales/${L}/signup.json';`,
    "export { GROUPS as ID_GROUPS } from '@/locales/id/index.js';",
    `export { GROUPS as LANGUAGE_GROUPS } from '@/locales/${L}/index.js';`,
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
  assert.equal(localStorage.getItem('sellio_app_language_preview'), L, 'and stays on, on this device (the language it previews)');
  assert.equal(localStorage.getItem('sellio_app_language'), L);
  assert.equal(win.location.search, '?from=whatsapp', 'The preview parameter leaves the address; others stay');
  assert.equal(appText.appLanguage(), L);
  assert.equal(appText.appLocale(), { id: 'id-ID', zh: 'zh-SG', ms: 'ms-MY' }[L]);
  assert.equal(appT('Save'), 'Save', 'Nothing is downloaded until a screen uses the words (store pages never do)');
  await appText.appTextReady();
  assert.equal(appT('Save'), { id: 'Simpan', zh: '保存', ms: 'Simpan' }[L], 'Loaded when asked for');
  assert.deepEqual(appText.LIVE_GROUPS.id, ['signup', 'shop'], 'Groups 1 and 2 are switched on for everyone (Alvin, 15 Nov 2026)');
  assert.deepEqual([appText.LIVE_GROUPS.zh, appText.LIVE_GROUPS.ms], [['signup', 'shop', 'explore'], ['signup', 'shop', 'explore']],
    '中文 and Malay: every group, for everyone who picks them (Alvin, 16 Nov 2026)');
  passed('A preview link: on for this device, the address cleaned up, and the words load only when a screen wants them');

  // 2. Blanks
  const W = {
    id: { step: 'Langkah 2 dari 5', stepMissing: 'Langkah 2 dari {total}', hi: 'Hai {total}!', sent: 'Kami mengirimnya ke <strong>a***@mail.com</strong>.',
      terms: 'Syarat dan Ketentuan', privacy: 'Kebijakan Privasi', line: 'Dengan melanjutkan, Anda menyetujuiSyarat dan Ketentuan serta Kebijakan Privasi Sellio.' },
    zh: { step: '第 2 步，共 5 步', stepMissing: '第 2 步，共 {total} 步', hi: '{total}，您好！', sent: '我们已发送到 <strong>a***@mail.com</strong>。',
      terms: '条款与条件', privacy: '隐私政策', line: '继续即表示您同意 Sellio 的条款与条件和隐私政策。' },
    ms: { step: 'Langkah 2 daripada 5', stepMissing: 'Langkah 2 daripada {total}', hi: 'Hai {total}!', sent: 'Kami telah menghantarnya ke <strong>a***@mail.com</strong>.',
      terms: 'Terma dan Syarat', privacy: 'Dasar Privasi', line: 'Dengan meneruskan, anda bersetuju denganTerma dan Syarat serta Dasar Privasi Sellio.' },
  }[L];
  assert.equal(appT('Step {step} of {total}', { step: 2, total: 5 }), W.step);
  assert.equal(appT('Step {step} of {total}', { step: 2 }), W.stepMissing, 'A blank with no value stays as written');
  assert.equal(appT('Hi {firstName}!', { firstName: '{total}' }), W.hi, 'A value is never filled in again');
  assert.equal(appT('A phrase nobody has translated'), 'A phrase nobody has translated', 'English when there is no translation');
  let page = await mount(h('p', null, appT('We sent it to {forgotMaskedEmail}.', { forgotMaskedEmail: h('strong', null, 'a***@mail.com') })));
  assert.equal(page.host.querySelector('p').innerHTML, W.sent, 'A bold name in the sentence');
  await page.unmount();
  page = await mount(h(app.TermsLine));
  assert.equal(page.host.querySelector('a[href="/terms"]')?.textContent, W.terms);
  assert.equal(page.host.querySelector('a[href="/privacy"]')?.textContent, W.privacy);
  assert.ok(page.host.querySelector('br'), 'The line break is kept');
  assert.equal(page.host.textContent, W.line);
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
  assert.equal(appText.appLanguageAvailable(), true, 'Switched on: no preview needed');
  assert.equal(appText.appLanguage(), 'id', 'Someone who picked Indonesian sees it');
  await appText.appTextReady();
  assert.equal(appT('Save'), 'Simpan', 'The words of the live groups load');
  assert.equal(appT('Kitchen Display'), 'Layar Dapur');
  await act(async () => { await appText.resetAppTextForTests({ preview: false }); });
  assert.equal(appText.appLanguage(), 'en', 'Nothing points to Indonesian: English');
  passed("Who gets Indonesian: their choice, else the phone's language, else the shop's country, else an Indonesian time zone (live for everyone)");

  // 4. The switch and the preview badge
  await act(async () => { await appText.resetAppTextForTests({ preview: false }); });
  page = await mount(h(React.Fragment, null, h(app.AppLanguageSwitch), h(app.AppLanguagePreviewBadge)));
  assert.ok(page.host.querySelector('[data-testid="app-language-switch"]'), 'Switched on: everyone can pick a language');
  assert.equal(page.host.querySelector('[data-testid="app-language-preview"]'), null, 'and no preview badge outside a preview');
  await page.unmount();
  await act(async () => { await appText.resetAppTextForTests({ preview: L, choice: L }); });
  localStorage.setItem('sellio_app_language_preview', L); localStorage.setItem('sellio_app_language', L);
  page = await mount(h(React.Fragment, null, h(app.AppLanguageSwitch), h(app.AppLanguagePreviewBadge)));
  const group = page.host.querySelector('[data-testid="app-language-switch"]');
  assert.equal(group?.getAttribute('aria-label'), { id: 'Bahasa', zh: '语言', ms: 'Bahasa' }[L]);
  // Short labels (Alvin, 16 Nov 2026: EN, 中文, MY, ID), named in full for screen readers: all four,
  // switched on for everyone.
  const SHORT = { id: 'ID', zh: '中文', ms: 'MY' };
  assert.deepEqual([...page.host.querySelectorAll('[data-testid="app-language-switch"] button')].map((b) => [text(b), b.getAttribute('aria-label')]),
    [['EN', 'English'], ['中文', '中文'], ['MY', 'Bahasa Melayu'], ['ID', 'Bahasa Indonesia']]);
  assert.equal(buttonNamed(SHORT[L], page.host)?.getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed('EN', page.host)?.getAttribute('aria-pressed'), 'false');
  const badge = () => page.host.querySelector('[data-testid="app-language-preview"]');
  const badgeWords = () => [text(badge()?.querySelector('span')), text(badge()?.querySelector('button'))];
  assert.deepEqual(badgeWords(), { id: ['Pratinjau Bahasa Indonesia', 'Akhiri pratinjau'], zh: ['中文预览', '结束预览'], ms: ['Pratonton Bahasa Melayu', 'Tamatkan pratonton'] }[L]);
  const languageBefore = appText.appLanguage();
  await click(buttonNamed('EN', page.host), 'EN');
  assert.equal(buttonNamed('EN', page.host)?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem('sellio_app_language'), 'en', 'The choice is remembered');
  assert.deepEqual(badgeWords(), [{ id: 'Indonesian preview', zh: 'Chinese preview', ms: 'Malay preview' }[L], 'End preview'], 'Still a preview, in English now');
  assert.notEqual(languageBefore, appText.appLanguage());
  await click(buttonNamed('End preview', page.host), 'End preview');
  assert.equal(badge(), null, 'The badge goes');
  assert.ok(page.host.querySelector('[data-testid="app-language-switch"]'), 'The switch stays: the groups are live');
  assert.equal(appText.isAppLanguagePreview(), false);
  assert.equal(localStorage.getItem('sellio_app_language_preview'), null);
  assert.equal(localStorage.getItem('sellio_app_language'), null);
  await page.unmount();
  passed('The switch (each language in its own words) and the preview badge; ending the preview puts this device back');

  // 4b. Who is offered 中文 and Malay (Alvin, 16 Nov 2026: "there should be the EN, 中文, MY, ID for
  // everyone"): everyone can pick them, nobody is switched to them by their phone or their shop,
  // and Xie Lao Ma's shop still has 中文 first, one tap from English.
  await act(async () => { await appText.resetAppTextForTests({ preview: false }); });
  assert.deepEqual(appText.availableAppLanguages(), ['en', 'zh', 'ms', 'id'], 'EN, 中文, MY and ID for everyone');
  setPhoneLanguages(['zh-CN']);
  assert.equal(appText.appLanguage(), 'en', 'A Chinese phone stays in English: 中文 only when picked');
  setPhoneLanguages(['ms-MY']);
  assert.equal(appText.appLanguage(), 'en', 'A Malay phone too');
  setPhoneLanguages(['en-US']);
  await act(async () => { await appText.resetAppTextForTests({ preview: false, choice: 'ms', shopCountry: 'Malaysia' }); });
  assert.equal(appText.appLanguage(), 'ms', 'Someone who picked MY sees it, with no preview');
  assert.equal(appText.isAppLanguagePreview(), false);
  await appText.appTextReady();
  assert.equal(appT('Kitchen Display'), 'Paparan Dapur', 'The shop screens');
  assert.equal(appT('Fresh finds'), 'Penemuan terbaharu', 'and Explore, Me and chat');
  await act(async () => { await appText.resetAppTextForTests({ preview: false, choice: 'zh' }); });
  assert.equal(appText.appLanguage(), 'zh', 'Someone who picked 中文 sees it');
  await appText.appTextReady();
  assert.equal(appT('Kitchen Display'), '厨房显示屏');
  const xieLaoMa = Object.keys(appText.SHOP_FIRST).find((id) => appText.SHOP_FIRST[id] === 'zh');
  assert.equal(xieLaoMa, 'b95be0b8-e10b-4acd-a91d-e0e1f7469bca', "Xie Lao Ma's shop has 中文 first");
  await act(async () => { await appText.resetAppTextForTests({ preview: false, shopId: xieLaoMa, shopCountry: 'Malaysia' }); });
  assert.equal(appText.appLanguage(), 'zh', "Xie Lao Ma's team gets 中文 while they work in that shop");
  assert.deepEqual(appText.availableAppLanguages(), ['en', 'zh', 'ms', 'id']);
  await appText.appTextReady();
  assert.equal(appT('Kitchen Display'), '厨房显示屏', 'Every group of screens, not only the live ones');
  assert.equal(appText.isAppLanguagePreview(), false, 'No preview badge for them');
  page = await mount(h(app.AppLanguageSwitch));
  await click(buttonNamed('EN', page.host), 'EN');
  assert.equal(appText.appLanguage(), 'en', 'One tap back to English');
  assert.equal(localStorage.getItem('sellio_app_language'), 'en', 'and it stays their choice on this device');
  await page.unmount();
  localStorage.removeItem('sellio_app_language');
  await act(async () => { await appText.resetAppTextForTests({ preview: false, shopId: 'be7b5ad1-a464-4fe7-9d38-1f44873308e1', shopCountry: 'Malaysia' }); });
  assert.equal(appText.appLanguage(), 'en', 'The Wellness shop stays in English until someone there picks another');
  assert.deepEqual(appText.availableAppLanguages(), ['en', 'zh', 'ms', 'id'], 'and can pick EN, 中文, MY or ID, like everyone else');
  await act(async () => { await appText.resetAppTextForTests({ preview: true }); });
  assert.equal(appText.appLanguagePreview(), 'id', 'A preview stored before 中文 and Malay ("1") is an Indonesian one');
  passed("EN, 中文, MY and ID for everyone; 中文 and Malay only when picked, but first in Xie Lao Ma's shop (one tap from English)");

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
    assert.deepEqual(leftovers(shown), [], `${what}: English left on the ${L} screen`);
    assert.deepEqual(shown.match(ENGLISH_WORDS) || [], [], `${what}: English words on the ${L} screen: ${shown}`);
    return shown;
  };
  await act(async () => { await appText.resetAppTextForTests({ preview: L, choice: L }); });
  // What each screen must say in the language under test.
  const S = {
    id: { signIn: ['Nomor Ponsel', 'Lupa kata sandi?', 'Masuk dengan Google', 'Dengan melanjutkan, Anda menyetujui', 'EN', 'ID'], forgot: 'Lupa kata sandi?',
      reset: ['Reset Kata Sandi', 'Masukkan nomor ponsel yang terdaftar'], join: ['Buat akun Sellio Anda', 'Lanjutkan dengan Google', 'Kirim email verifikasi', 'Sudah punya akun?'],
      plans: ['sekitar Rp255.000, ditagih dalam Rupiah', 'Harga belum termasuk PPN.', 'Hingga 100 pesanan/bulan', 'Mulai Uji Coba Gratis'], progress: ['1 / 3 Selesai', 'Progres Anda'],
      industries: ['Makanan & Minuman / Kafe / Restoran', 'Ritel', 'Jasa'], colour: 'Biru Laut', table: 'Meja 3' },
    zh: { signIn: ['手机号码', '忘记密码？', '使用 Google 登录', '继续即表示您同意', 'EN', '中文', 'ID'], forgot: '忘记密码？',
      reset: ['重设密码', '输入您注册的手机号码'], join: ['创建您的 Sellio 账号', '使用 Google 继续', '发送验证邮件', '已经有账号？'],
      plans: ['约 Rp255.000，以印尼盾收费', '价格未含 PPN（增值税）。', '每月最多 100 张订单', '开始免费试用'], progress: ['已完成 1 / 3', '您的进度'],
      industries: ['餐饮/咖啡馆/餐厅', '零售', '服务'], colour: '海洋蓝', table: '3号桌' },
    ms: { signIn: ['Nombor Telefon', 'Lupa kata laluan?', 'Log masuk dengan Google', 'Dengan meneruskan, anda bersetuju', 'EN', 'MY', 'ID'], forgot: 'Lupa kata laluan?',
      reset: ['Tetapkan Semula Kata Laluan', 'Masukkan nombor telefon berdaftar anda'], join: ['Cipta akaun Sellio anda', 'Teruskan dengan Google', 'Hantar e-mel pengesahan', 'Sudah ada akaun?'],
      plans: ['kira-kira Rp255.000, dicaj dalam Rupiah', 'Harga belum termasuk PPN (VAT).', 'Sehingga 100 pesanan/bulan', 'Mulakan Percubaan Percuma'], progress: ['1 / 3 Selesai', 'Kemajuan Anda'],
      industries: ['Makanan & Minuman / Kafe / Restoran', 'Runcit', 'Perkhidmatan'], colour: 'Biru Lautan', table: 'Meja 3' },
  }[L];

  page = await mount(h(MemoryRouter, null, h(app.Auth)));
  let shown = checkScreen(page.host, 'Sign in');
  for (const words of S.signIn) assert.ok(shown.includes(words), `Sign in shows "${words}": ${shown}`);
  await click(buttonNamed(S.forgot, page.host), S.forgot);
  shown = checkScreen(page.host, 'Forgot password');
  for (const words of S.reset) assert.ok(shown.includes(words), `Forgot password shows "${words}": ${shown}`);
  await page.unmount();

  page = await mount(h(MemoryRouter, null, h(app.Join)));
  shown = checkScreen(page.host, 'Create an account');
  for (const words of S.join) assert.ok(shown.includes(words), `Create an account shows "${words}": ${shown}`);
  await page.unmount();

  setPhoneLanguages(['id-ID']); // an Indonesian phone: Indonesian plans (in the language picked)
  page = await mount(h(app.AuthPricingModal, { onClose() {} }));
  shown = checkScreen(page.host, 'Business plans');
  for (const words of S.plans) assert.ok(shown.includes(words), `Business plans show "${words}": ${shown}`);
  assert.equal(plans.rupiahNote(18), 'about Rp255.000, charged in Rupiah', 'The landing page stays in English');
  await page.unmount();
  setPhoneLanguages(['en-US']);

  page = await mount(h(app.OnboardingProgress, { currentStep: 2, completedSteps: [1], steps: [{ title: appT('Business Theme') }, { title: appT('Branch Setup') }, { title: appT('Menu Setup') }] }));
  shown = checkScreen(page.host, 'Onboarding progress');
  for (const words of S.progress) assert.ok(shown.includes(words), `Onboarding progress shows "${words}": ${shown}`);
  await page.unmount();

  // Names from shared lists: shown in the owner's language, stored in English
  assert.deepEqual(app.INDUSTRY_OPTIONS.map((option) => [option.value, appT(option.label)]), [['f&b', S.industries[0]], ['retail', S.industries[1]], ['service', S.industries[2]]]);
  assert.equal(app.COLOR_SETS[0].name, 'Ocean Blue', "A colour's id stays English");
  assert.equal(appT(app.COLOR_SETS[0].name), S.colour);
  assert.equal(appT('Table {number}', { number: 3 }), S.table, 'New tables are named in the owner’s language');
  assert.ok(!reactWarnings.some((line) => /unique "key"/.test(line)), reactWarnings.join('\n'));
  passed(`Sign in, forgot password, create an account, business plans and onboarding progress in ${L}, with no English phrase left`);

  // 6. The catalog: every group of the language under test, each phrase with its blanks, and
  // no words of the wrong language: Malay in the Indonesian, Indonesian in the Malay, Traditional
  // characters in the Chinese (Simplified, as Singapore and Malaysia write it).
  const blanks = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
  const [wrong, rule] = {
    id: [/\b(kamu|kau|sila|percuma|kedai|kata laluan|telefon|bimbit|anda)\b/, 'Indonesian, formal "Anda" (not Malay, not "kamu")'],
    zh: [/[們這為個說時會對還請網頁點買賣單號碼帳戶購車圖設刪編輯關閉開啟訂確認選擇項價錢務員廳檔統計報導處預覽機電腦視頻訊聯絡銷額庫類別標籤優稅費總結據廚營間週隨錄註冊驗誤後試動態頭檢連線載]/, 'Simplified Chinese (no Traditional characters)'],
    ms: [/\b(ponsel|kata sandi|akun|unduh|unggah|hapus|pengaturan|silakan|gratis|toko|dasbor|kamu|kau|tautan|nomor|kode|berhasil)\b/i, 'Malaysian Malay (no Indonesian words)'],
  }[L];
  let count = 0;
  for (const [groupName, words] of Object.entries(app.LANGUAGE_GROUPS)) {
    assert.deepEqual(Object.keys(words), Object.keys(app.ID_GROUPS[groupName]), `${L}/${groupName}.json has the same phrases as the Indonesian`);
    for (const [english, translated] of Object.entries(words)) {
      count++;
      assert.ok(typeof translated === 'string' && translated.trim(), `"${english}" is translated`);
      assert.equal(blanks(translated), blanks(english), `"${english}" keeps its blanks`);
      assert.ok(!wrong.test(translated), `"${translated}": ${rule}`);
    }
  }
  assert.deepEqual(Object.keys(app.LANGUAGE_GROUPS), ['signup', 'shop', 'explore'], 'Group 1 is the sign-up and onboarding screens (group 2, the shop screens: app-text-shop.dom.mjs; group 3, Explore: app-text-explore.dom.mjs)');
  passed(`The catalog: ${count} phrases in 3 groups, each with its blanks, ${rule}`);

  // 7. Ending a preview with the link, as another device would (a fresh copy of the module)
  localStorage.setItem('sellio_app_language_preview', '1'); localStorage.setItem('sellio_app_language', 'id');
  dom.reconfigure({ url: 'https://sellio.sg/Dashboard' });
  const before = await bundle('before', ["export * from '@/lib/appText';"]);
  assert.equal(before.appLanguagePreview(), 'id', 'A preview link opened before 中文 and Malay (stored "1") still previews Indonesian');
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
