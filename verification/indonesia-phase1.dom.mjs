// Indonesia, Phase 1 in the app (Alvin, 12 Nov 2026: "Proceed with this"). Indonesia is a country
// of its own (lib/countries.js): rupiah, +62 mobiles, WIB/WITA/WIT, QRIS, and PBJT or PPN at a
// tap. Buyers get the store page in Bahasa Indonesia, which an Indonesian shop's page opens in.
// Singapore and Malaysia stay as they were, and no screen names them for everyone.
// Settings > Business Profile: country, currency and time zone, which lock once the shop has an
// order. (The database side: verification/indonesia-phase1.sql. Plan prices:
// verification/indonesia-plans.test.mjs.)
// Run: node verification/indonesia-phase1.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM, VirtualConsole } = require('jsdom');
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: (navigation|HTMLCanvasElement)/.test(error?.message)) console.error(error); });
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/TenantSettings', pretendToBeVisual: true, virtualConsole });
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
win.Element.prototype.scrollIntoView ||= function scrollIntoView() {};
win.Element.prototype.hasPointerCapture ||= function hasPointerCapture() { return false; };
win.Element.prototype.releasePointerCapture ||= function releasePointerCapture() {};
win.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.scrollTo = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const act = React.act;
const h = React.createElement;

// Sellio's server, as a stand-in: tenants updates are kept; the shop's orders are counted.
const server = { updates: [], orders: 0, translations: [] };
const answer = (result) => {
  const query = new Proxy({}, { get: (_, key) => (key === 'then' ? (resolve, reject) => Promise.resolve(result).then(resolve, reject) : () => query) });
  return query;
};
globalThis.fakeClient = {
  from: (table) => {
    if (table === 'tenants') {
      return { update: (values) => ({ eq: async (column, id) => { server.updates.push({ values, column, id }); return { error: null }; } }) };
    }
    if (table === 'orders') return answer({ data: null, count: server.orders, error: null });
    return answer({ data: [], error: null });
  },
  storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  functions: { invoke: async (name, options) => { server.translations.push({ name, ...options.body }); return { data: { translations: {} }, error: null }; } },
};
const mocks = {
  supabase: 'export const getSupabase = async () => globalThis.fakeClient;',
  shrink: "export const LOGO_MAX_SIDE = 800; export const LONG_CACHE = '31536000'; export class UnreadablePhotoError extends Error {} export const UNREADABLE_PHOTO_MESSAGE = 'This photo did not come through in full.'; export async function checkPhoto() {} export async function shrinkImage(input) { return { blob: input, type: 'image/jpeg', ext: 'jpg' }; }",
  toast: 'export const toast = Object.assign(() => {}, { success() {}, error() {}, message() {}, info() {} });',
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
// The dictionaries are the modules' own; the test reads them as they are.
const SHOWN = {
  'LanguageContext.jsx': 'export { DICTIONARY as __DICTIONARY };',
  'shopSelling.js': 'export { SHOP_TEXT as __SHOP_TEXT, BUYER_STATUS as __BUYER_STATUS };',
};
const plugin = { name: 'indonesia-fixtures', setup(builder) {
  for (const [filter, key] of routes) builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'jsx', contents: mocks[args.path], resolveDir: process.cwd() }));
  builder.onLoad({ filter: /src\/lib\/(LanguageContext\.jsx|shopSelling\.js)$/ }, async (args) => ({
    loader: 'jsx', resolveDir: path.dirname(args.path),
    contents: `${await readFile(args.path, 'utf8')}\n${SHOWN[path.basename(args.path)]}\n`,
  }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => act(async () => { await sleep(30); });
const click = async (el, what = 'control') => {
  assert.ok(el, `${what} is there`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
  await settle();
};
const byTestId = (id, root = document) => root.querySelector(`[data-testid="${id}"]`);
const buttonNamed = (label, root = document) => [...root.querySelectorAll('button')].find((b) => text(b) === label);
const offered = () => [...document.querySelectorAll('[role="option"]')].map(text);
// Opens a list (a Select) and picks an option by its words.
const pick = async (testid, label) => {
  await click(byTestId(testid), testid);
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => text(o) === label);
  assert.ok(option, `${label} is offered: ${offered().join(' | ')}`);
  await click(option, label);
  await settle();
};

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-indonesia-'));
const local = path.join(process.cwd(), '.indonesia-phase1-bundle.mjs');
try {
  await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'js',
      contents: [
        "export * as countries from '@/lib/countries';",
        "export * as money from '@/lib/money';",
        "export * as accountFlow from '@/lib/accountFlow';",
        "export * as shopSelling from '@/lib/shopSelling';",
        "export * as language from '@/lib/LanguageContext';",
        "export * as printer from '@/lib/printerUtils';",
        "export { default as BusinessProfileTab } from '@/components/settings/BusinessProfileTab';",
      ].join('\n'),
    },
    outfile: path.join(tmp, 'bundle.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent', loader: { '.js': 'jsx' },
  });
  await copyFile(path.join(tmp, 'bundle.mjs'), local);
  const { countries, money, accountFlow, shopSelling, language, printer, BusinessProfileTab } = await import(pathToFileURL(local));
  const { formatMoney } = money;

  // ── Indonesia is a country of its own; Singapore and Malaysia as before ──
  {
    const { COUNTRIES, countryNamed, shopCountry, paymentQrName, taxNameFor, visitorCountry } = countries;
    assert.deepEqual(COUNTRIES.map((c) => [c.name, c.currency, c.dial, c.timezone, c.qr]), [
      ['Singapore', 'SGD', '65', 'Asia/Singapore', 'PayNow'],
      ['Malaysia', 'MYR', '60', 'Asia/Kuala_Lumpur', 'DuitNow'],
      ['Indonesia', 'IDR', '62', 'Asia/Jakarta', 'QRIS'],
    ]);
    assert.deepEqual(countryNamed('Indonesia').zones.map((z) => z.zone), ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'], 'WIB, WITA and WIT');
    assert.deepEqual(countryNamed('Indonesia').taxPresets.map((p) => [p.label, p.rate]), [['No tax', 0], ['PBJT 10%', 10], ['PPN 11%', 11]]);
    assert.equal(countryNamed('Indonesia').tax.rate, 0, 'no tax unless the shop adds one');
    assert.equal(shopCountry({ currency: 'IDR' }).name, 'Indonesia', 'a rupiah shop is in Indonesia');
    assert.equal(shopCountry({ country: 'Malaysia', currency: 'SGD' }).name, 'Malaysia', 'its own country first');
    assert.equal(shopCountry({}).name, 'Singapore');
    assert.deepEqual([{ country: 'Indonesia' }, { currency: 'SGD' }, { currency: 'MYR' }].map(paymentQrName), ['QRIS', 'PayNow', 'DuitNow']);
    assert.deepEqual([10, 11, 0, 5].map((rate) => taxNameFor({ country: 'Indonesia' }, rate)), ['PBJT', 'PPN', 'Tax', 'Tax']);
    assert.equal(taxNameFor({ country: 'Singapore' }, 9), 'GST');
    assert.equal(taxNameFor({ currency: 'MYR' }, 6), 'SST');
    for (const zone of ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura']) assert.equal(visitorCountry({ zone, languages: [] }), 'Indonesia', zone);
    assert.equal(visitorCountry({ zone: 'Asia/Kuching', languages: [] }), 'Malaysia');
    assert.equal(visitorCountry({ zone: 'Asia/Singapore', languages: ['id-ID'] }), 'Singapore', 'the time zone first');
    assert.equal(visitorCountry({ zone: 'Europe/London', languages: ['in'] }), 'Indonesia', 'older Android says "in"');
    assert.equal(visitorCountry({ zone: 'Europe/London', languages: ['en-GB', 'id_ID'] }), 'Indonesia');
    assert.equal(visitorCountry({ zone: 'America/New_York', languages: ['en-US', 'ind'] }), null);
    passed('Indonesia: rupiah, +62, Jakarta time (WITA and WIT too), QRIS, and no tax unless PBJT or PPN is added');
  }

  // ── +62 mobiles: sign-up, staff and checkout follow the same rule as the database ──
  {
    const { PHONE_COUNTRIES, phoneCountryFor, fullPhone, accountErrorMessage } = accountFlow;
    assert.deepEqual(PHONE_COUNTRIES.map((c) => c.code), ['+65', '+60', '+62']);
    assert.deepEqual(['Indonesia', 'Malaysia', 'Singapore', undefined, 'Thailand'].map((c) => phoneCountryFor(c).code), ['+62', '+60', '+65', '+65', '+65']);
    for (const c of countries.COUNTRIES) {
      assert.equal(String(PHONE_COUNTRIES.find((p) => p.code === `+${c.dial}`).pattern), String(c.phone.pattern), `${c.name}: one rule`);
    }
    const id = phoneCountryFor('Indonesia');
    assert.equal(fullPhone(id, '0812-3456-7890'), '+6281234567890', 'a leading 0 is dropped');
    assert.equal(fullPhone(id, '857 2210 274'), '+628572210274');
    assert.equal(fullPhone(id, '0812'), null, 'too short');
    assert.equal(fullPhone(id, '8012345678'), null, 'Indonesian mobiles are 8 then 1–9');
    assert.equal(fullPhone(id, '8123456789012'), null, 'too long');
    assert.equal(fullPhone(phoneCountryFor('Singapore'), '9123 4567'), '+6591234567', 'Singapore as before');
    assert.equal(accountErrorMessage({ hint: 'phone_invalid' }), 'Please enter a valid mobile number.');

    const { normaliseBuyerPhone } = shopSelling;
    assert.deepEqual(['0812 3456 7890', '6281234567890', '+62 812-3456-7890', '(0857) 2210 274'].map(normaliseBuyerPhone),
      ['+6281234567890', '+6281234567890', '+6281234567890', '+628572210274'], 'as Indonesians type them');
    assert.deepEqual(['0812', '021 1234 5678', '+62 21 1234 5678'].map(normaliseBuyerPhone), [null, null, null], 'landlines and short numbers are refused');
    assert.deepEqual(['9123 4567', '012 345 6789'].map(normaliseBuyerPhone), ['+6591234567', '+60123456789'], 'Singapore and Malaysia as before');
    passed('+62 mobiles: 08…, 628… and +62 8… all become +628…; the same rule in sign-up, staff, checkout and the database');
  }

  // ── Money: rupiah as Indonesians write it, in selling summaries and receipts ──
  {
    assert.equal(shopSelling.sellingSummary({ delivery: { enabled: true, fee_mode: 'extra', fee: 15000, free_above: 1500000 } }, 'IDR'),
      'Delivery Rp15.000, free above Rp1.500.000');
    assert.equal(shopSelling.sellingSummary({ delivery: { enabled: true, fee_mode: 'extra', fee: 5, free_above: 60 } }, 'SGD'), 'Delivery S$5.00, free above S$60.00');
    const lines = (bytes) => Buffer.from(bytes).toString('latin1')
      .replace(/\x1b@|\x1ba[\x00-\x02]|\x1bE[\x00\x01]|\x1bd[\s\S]|\x1d![\s\S]|\x1dVB\x00/g, '')
      .split('\n').map((l) => l.replace(/[\x00-\x1f]/g, '').trimEnd()).filter(Boolean);
    const rupiah = lines(printer.buildTestReceipt('Kue Bu Sri', 'thermal_58', { currency: 'IDR', tax: { name: 'PBJT', rate: 10 } }));
    assert.ok(rupiah.some((l) => /^2x Nasi Lemak +Rp70\.000$/.test(l)), rupiah.join(' | '));
    assert.ok(rupiah.some((l) => /^Subtotal: +Rp103\.000$/.test(l)) && rupiah.some((l) => /^PBJT \(10%\): +Rp10\.300$/.test(l)) && rupiah.some((l) => /^TOTAL: +Rp113\.300$/.test(l)));
    assert.ok(rupiah.every((l) => l.length <= 32), 'fits 58mm paper');
    const untaxed = lines(printer.buildTestReceipt('Kue Bu Sri', 'thermal_80', { currency: 'IDR', tax: { name: 'Tax', rate: 0 } }));
    assert.ok(!untaxed.some((l) => /Tax|GST/.test(l)), 'no tax line without tax');
    const dollars = lines(printer.buildTestReceipt('Kopi Corner', 'thermal_80'));
    assert.ok(dollars.some((l) => /^GST \(9%\): +S\$0\.93$/.test(l)) && dollars.some((l) => /^TOTAL: +S\$11\.23$/.test(l)), 'Singapore as before, in S$');
    assert.equal(formatMoney(113300, 'IDR'), 'Rp113.300');
    passed('Rupiah as Indonesians write it (Rp15.000) in selling summaries and receipts, with the shop’s own tax');
  }

  // ── Bahasa Indonesia on the store page ──
  {
    const { __DICTIONARY: dict, SUPPORTED_LANGUAGES } = language;
    assert.deepEqual(SUPPORTED_LANGUAGES.map((l) => l.code), ['en', 'zh', 'ms', 'id']);
    const tokens = (value) => [...String(value).matchAll(/\{[a-z]+\}/gi)].map((m) => m[0]).sort();
    const sameWords = (name, all) => {
      const keys = Object.keys(all.en).sort();
      for (const code of Object.keys(all)) {
        assert.deepEqual(Object.keys(all[code]).sort(), keys, `${name}: ${code} has every phrase`);
        for (const key of keys) {
          assert.equal(typeof all[code][key], typeof all.en[key], `${name}.${code}.${key}`);
          if (typeof all.en[key] === 'string') {
            assert.ok(all[code][key].trim(), `${name}.${code}.${key} is written`);
            assert.deepEqual(tokens(all[code][key]), tokens(all.en[key]), `${name}.${code}.${key} keeps its blanks`);
          }
        }
      }
      return keys.length;
    };
    assert.ok(sameWords('storefront', dict) > 100, 'the whole storefront dictionary');
    sameWords('home shop', shopSelling.__SHOP_TEXT);
    sameWords('order status', shopSelling.__BUYER_STATUS);
    assert.equal(dict.id.payStep1, 'Buka aplikasi bank atau e-wallet Anda');
    assert.equal(dict.en.payStep1, 'Open your banking or e-wallet app', 'no bank names from one country');
    for (const code of ['en', 'zh', 'ms', 'id']) {
      assert.ok(!/PayNow|DuitNow|PayLah|DBS|OCBC|UOB|Touch ?N ?Go|Singapore|Malaysia/i.test(JSON.stringify(dict[code])), `${code}: no one country's words`);
    }
    assert.equal(shopSelling.shopT('id', 'delivery'), shopSelling.__SHOP_TEXT.id.delivery);
    assert.equal(shopSelling.buyerStatusLabel('id', 'ready', 'delivery', false), 'Sedang diantar');
    passed('The store page in Bahasa Indonesia: every phrase written, with its blanks, and no one country’s bank names');

    // An Indonesian shop's page opens in Bahasa Indonesia and its menu is taken as Indonesian;
    // a visitor's own choice still wins, and English is then a translation of the menu.
    const { LanguageProvider, useLanguage, useTranslatedText, prewarmTranslations } = language;
    const seen = {};
    function Probe({ shopLanguage, menuText }) {
      const ctx = useLanguage();
      const translated = useTranslatedText(menuText);
      Object.assign(seen, { lang: ctx.lang, contentLang: ctx.contentLang, translated, setLang: ctx.setLang, t: ctx.t });
      React.useEffect(() => { if (shopLanguage) { ctx.preferLanguage(shopLanguage); ctx.setContentLang(shopLanguage); } }, [shopLanguage]);
      return null;
    }
    const mountProbe = async (props) => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => { root.render(h(LanguageProvider, null, h(Probe, props))); });
      await settle();
      return async () => { await act(async () => root.unmount()); host.remove(); };
    };
    localStorage.clear();
    server.translations.length = 0;
    let close = await mountProbe({ shopLanguage: 'id', menuText: 'Kue lapis legit' });
    assert.equal(seen.lang, 'id', 'opens in Bahasa Indonesia');
    assert.equal(seen.contentLang, 'id');
    assert.equal(seen.t('placeOrder'), dict.id.placeOrder);
    assert.equal(seen.translated, 'Kue lapis legit', 'the menu is shown as written');
    assert.equal(server.translations.length, 0, 'nothing to translate');
    await act(async () => { seen.setLang('en'); }); await settle();
    assert.deepEqual(server.translations.map((r) => [r.name, r.language, r.texts]), [['translateContent', 'en', ['Kue lapis legit']]], 'English: the menu is translated');
    assert.equal(localStorage.getItem('sellio_storefront_lang'), 'en', 'the choice is remembered');
    await close();
    close = await mountProbe({ shopLanguage: 'id', menuText: 'Kue lapis legit' });
    assert.equal(seen.lang, 'en', 'a visitor’s own choice wins');
    assert.equal(seen.contentLang, 'id');
    await close();
    localStorage.clear();
    close = await mountProbe({ shopLanguage: null, menuText: 'Kaya toast' });
    assert.equal(seen.lang, 'en', 'other shops open in English, as before');
    assert.equal(seen.contentLang, 'en');
    await close();
    server.translations.length = 0;
    prewarmTranslations(['Nasi goreng spesial'], ['en', 'zh', 'ms']);
    await sleep(20);
    assert.deepEqual(server.translations.map((r) => r.language).sort(), ['en', 'ms', 'zh'], 'an Indonesian menu is readied in English, Chinese and Malay');
    passed('An Indonesian shop’s page opens in Bahasa Indonesia; a visitor’s choice wins; its menu translates into English');
  }

  // ── Settings > Business Profile: country, currency, time zone and tax ──
  {
    let host; let root;
    const open = async (tenant, orders = 0) => {
      server.orders = orders;
      host = document.createElement('div'); document.body.appendChild(host);
      root = createRoot(host);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      await act(async () => { root.render(h(QueryClientProvider, { client }, h(BusinessProfileTab, { tenant, tenantId: tenant.id }))); });
      await settle();
      await click(buttonNamed('Location & Contact', host), 'Location & Contact');
      await click(buttonNamed('Tax Settings', host), 'Tax Settings');
    };
    const close = async () => { await act(async () => root.unmount()); host.remove(); };
    const trigger = (id) => byTestId(id, host);
    const phone = () => [...host.querySelectorAll('input')].find((i) => i.placeholder && /^\+\d/.test(i.placeholder));
    const taxInput = () => host.querySelector('input[type="number"][max="100"]');
    const presets = () => [...(byTestId('tax-presets', host)?.querySelectorAll('button') || [])].map(text);
    const save = async () => { await click([...host.querySelectorAll('button')].find((b) => /Save Changes/.test(text(b))), 'Save Changes'); };

    // An Indonesian home shop with no orders yet, on WITA.
    await open({ id: 'shop-id', name: 'Kue Bu Sri', seller_type: 'individual', country: 'Indonesia', currency: 'IDR', timezone: 'Asia/Makassar', phone: '', settings: { tax_rate: 0 } });
    assert.equal(text(trigger('business-country')), 'Indonesia');
    assert.equal(text(trigger('business-currency')), 'IDR — Indonesian Rupiah');
    assert.equal(trigger('business-country').disabled, false, 'no orders: the country can change');
    assert.equal(byTestId('country-locked', host), null);
    assert.equal(text(trigger('business-timezone')), 'WITA, Central Indonesia (UTC+8)');
    assert.equal(phone().placeholder, '+62 812 3456 7890');
    assert.deepEqual(presets(), ['No tax', 'PBJT 10%', 'PPN 11%']);
    assert.match(text(host), /PBJT is the regional tax on food and drink/);
    await pick('business-timezone', 'WIT, Eastern Indonesia (UTC+9)');
    assert.equal(text(trigger('business-timezone')), 'WIT, Eastern Indonesia (UTC+9)');
    await click(buttonNamed('PBJT 10%', host), 'PBJT 10%');
    assert.equal(taxInput().value, '10');
    await save();
    let sent = server.updates.at(-1);
    assert.equal(sent.id, 'shop-id');
    assert.deepEqual([sent.values.country, sent.values.currency, sent.values.timezone, sent.values.settings.tax_rate], ['Indonesia', 'IDR', 'Asia/Jayapura', 10]);
    passed('Settings: an Indonesian shop picks WIB, WITA or WIT and a tax with one tap; the phone hint is Indonesian');

    // Moving the shop to Singapore takes its currency and clock with it; back again, Jakarta.
    await pick('business-country', 'Singapore');
    assert.equal(text(trigger('business-currency')), 'SGD — Singapore Dollar');
    assert.equal(trigger('business-timezone'), null, 'one clock in Singapore: no choice');
    assert.equal(phone().placeholder, '+65 9123 4567');
    assert.deepEqual(presets(), [], 'no presets in Singapore');
    assert.equal(taxInput().placeholder, 'e.g. 9');
    await save();
    sent = server.updates.at(-1);
    assert.deepEqual([sent.values.country, sent.values.currency, sent.values.timezone], ['Singapore', 'SGD', 'Asia/Singapore']);
    await pick('business-country', 'Indonesia');
    assert.equal(text(trigger('business-currency')), 'IDR — Indonesian Rupiah');
    assert.equal(text(trigger('business-timezone')), 'WIB, Western Indonesia (UTC+7)', 'Jakarta time to start');
    await close();
    passed('Changing the country brings its currency, clock, phone hint and tax presets with it');

    // Once a shop has an order, its country and currency stay.
    await open({ id: 'shop-busy', name: 'Warung Budi', seller_type: 'merchant', country: 'Indonesia', currency: 'IDR', timezone: 'Asia/Jakarta', settings: { tax_rate: 11 } }, 3);
    assert.equal(trigger('business-country').disabled, true);
    assert.equal(trigger('business-currency').disabled, true);
    assert.equal(text(byTestId('country-locked', host)), "Country and currency can't change once your shop has orders: its prices and reports are in IDR.");
    assert.ok(trigger('business-timezone') && !trigger('business-timezone').disabled, 'its time zone can still change');
    await close();
    passed('A shop with orders keeps its country and currency (old prices and reports stay right)');

    // Singapore and Malaysia shops: as before, with nothing new to choose.
    await open({ id: 'shop-sg', name: 'Kopi Corner', seller_type: 'merchant', country: 'Singapore', currency: 'SGD', timezone: 'Asia/Singapore', settings: { tax_rate: 9 } });
    assert.equal(trigger('business-timezone'), null);
    assert.deepEqual(presets(), []);
    assert.equal(phone().placeholder, '+65 9123 4567');
    await close();
    await open({ id: 'shop-my', name: 'Kedai Ali', seller_type: 'merchant', country: 'Malaysia', currency: 'MYR', timezone: 'Asia/Singapore', settings: { tax_rate: 6 } });
    assert.equal(trigger('business-timezone'), null);
    assert.equal(phone().placeholder, '+60 12 345 6789');
    await save();
    sent = server.updates.at(-1);
    assert.deepEqual([sent.values.country, sent.values.currency, sent.values.timezone], ['Malaysia', 'MYR', 'Asia/Singapore'], 'its clock as stored (the database keeps Malaysia on UTC+8)');
    await close();
    passed('Singapore and Malaysia shops: as before, with no time zone or tax presets to pick');
  }

  // ── No screen names Singapore or Malaysia for everyone ──
  {
    const files = [];
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
      }
    };
    await walk(path.join(process.cwd(), 'src'));
    // Where a country's own words belong: its entry, the old 'paynow' payment method's report label,
    // the Terms (examples from each country) and the legal pages (who runs Sellio).
    const ALLOWED = /src\/lib\/countries\.js$|src\/lib\/reportData\.js$|src\/pages\/(Terms|Privacy)\.jsx$/;
    const BANNED = /PayNow|DuitNow|PayLah|Touch ?N ?Go|\bTNG\b|\bUEN\b|Singapore or Malaysia|All of Singapore|Tampines|HDB|\bBlk\b|123 Main Street|DBS|OCBC|\bUOB\b|"\+65\.\.\."/;
    const found = [];
    for (const file of files) {
      if (ALLOWED.test(file)) continue;
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        const code = line.trim();
        if (/^(\/\/|\/\*|\*|\{\/\*)/.test(code)) return; // comments
        if (BANNED.test(code)) found.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${code.slice(0, 120)}`);
      });
    }
    assert.deepEqual(found, [], 'country-specific words on screens');
    passed('No screen hint names Singapore or Malaysia, their banks or payment brands, outside a shop’s own country');
  }

  console.log(`\n${passes} Indonesia (phase 1) checks passed.`);
} finally {
  await rm(tmp, { recursive: true, force: true });
  await rm(local, { force: true });
  dom.window.close();
}
// React Query and jsdom keep timers running after the last check.
process.exit(0);
