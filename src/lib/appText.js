// The owner app's own words in other languages: Bahasa Indonesia (Phase 2; Alvin, 12 Nov 2026:
// "proceed with phase 2"), then 中文 and Malay (16 Nov 2026). Buyers' store pages have their own
// dictionary (LanguageContext.jsx); this is for the people who run a shop.
//
// English is written in the code and is the key: t('Save changes'), with {name} blanks for
// values, t('{count} orders today', { count }). Each language lives in
// src/locales/<language>/<group>.json, one group of screens at a time, drafted by Claude from that
// language's glossary (src/locales/<language>/GLOSSARY.md) and loaded only for people who see it,
// so nobody else downloads it. A group shows in a language once it is switched on for that
// language (LIVE_GROUPS); until then only a reviewer sees it, in a preview (open any app page once
// with ?preview_language=zh, ms or id; ?preview_language=off ends it).
// scripts/check-app-text.mjs fails the build if a phrase is missing in any language.
//
// English stays the default. Bahasa Indonesia switches on from the phone's language first, then
// the shop's country, then where the person is (their time zone). 中文 and Malay only when picked:
// nobody is switched by their phone or their shop (Alvin, 16 Nov 2026). Everyone can switch
// between EN, 中文, MY and ID, on the sign-in pages and in the account panel, and the choice is
// remembered on that device.
import { cloneElement, isValidElement, useSyncExternalStore } from 'react';
import { visitorCountry } from './countries.js';

// The languages, in the switch's order (Alvin, 16 Nov 2026: EN, 中文, MY, ID). short: the
// switch's label; name: the language in its own words (screen readers, tooltips); locale: dates
// and numbers written with Intl.
export const APP_LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English', locale: 'en-SG' },
  { code: 'zh', short: '中文', name: '中文', locale: 'zh-SG' },
  { code: 'ms', short: 'MY', name: 'Bahasa Melayu', locale: 'ms-MY' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia', locale: 'id-ID' },
];
const LOCALE = Object.fromEntries(APP_LANGUAGES.map(({ code, locale }) => [code, locale]));

// Each language's words: one file per group of screens, loaded the first time someone sees it.
const LOADERS = {
  zh: () => import('../locales/zh/index.js'),
  ms: () => import('../locales/ms/index.js'),
  id: () => import('../locales/id/index.js'),
};
const TRANSLATED = Object.keys(LOADERS);

// Groups of screens that show in a language for everyone it's for; the others only in a preview
// of that language. Bahasa Indonesia: Alvin, 15 Nov 2026: "Switch groups 1 and 2 on together",
// and group 3 (Explore, Me and chat) on 16 Nov 2026: "Yes turn it on" (Iman's review continues in
// the review sheet; corrections go into the .json files). 中文 and
// Malay: every group, for everyone who picks them (Alvin, 16 Nov 2026: "there should be the EN,
// 中文, MY, ID for everyone"); the review sheets for Xie Lao Ma and the Wellness shop stay open
// for corrections. Switch a language's groups on together: a shop screen of a group that isn't
// on would show the phrases it shares with one that is.
export const LIVE_GROUPS = {
  zh: ['signup', 'shop', 'explore'],
  ms: ['signup', 'shop', 'explore'],
  id: ['signup', 'shop', 'explore'],
};
const liveGroups = (language) => LIVE_GROUPS[language] || [];

// Shops whose team gets a language before everyone else, on every screen while they work in
// that shop, still one tap from English (their own choice wins). Alvin, 16 Nov 2026: "do not
// make it mandatory or switch the language that they have now. You can change Xie lao ma ones
// first though. Wellness shop dont change."
export const SHOP_FIRST = {
  'b95be0b8-e10b-4acd-a91d-e0e1f7469bca': 'zh', // Xie Lao Ma 蟹老妈
};

const CHOICE_KEY = 'sellio_app_language';
const PREVIEW_KEY = 'sellio_app_language_preview';
const LANGUAGES = APP_LANGUAGES.map(({ code }) => code);

// preview: the language a reviewer is checking on this device (null: none). shopId, shopCountry:
// the shop the person is working in (TenantProvider tells it).
const state = { choice: null, shopId: null, shopCountry: null, preview: null, catalog: null, catalogFor: '', version: 0 };
// A stored preview: a language, or '1' from a link made before 中文 and Malay (Indonesian).
function previewLanguage(value) {
  if (value === '1' || value === true) return 'id';
  return TRANSLATED.includes(value) ? value : null;
}
const listeners = new Set();

const hasWindow = () => typeof window !== 'undefined';
function readStorage(key) {
  try { return hasWindow() ? window.localStorage.getItem(key) : null; } catch { return null; }
}
function writeStorage(key, value) {
  try {
    if (!hasWindow()) return;
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* private mode: the choice lasts this visit */ }
}
function notify() {
  state.version += 1;
  listeners.forEach((listener) => listener());
}

function phoneLanguage() {
  if (typeof navigator === 'undefined') return null;
  const first = (navigator.languages?.length ? navigator.languages[0] : navigator.language) || '';
  // Older Android reports Indonesian as "in".
  return /^(id|in)(-|_|$)/i.test(first) ? 'id' : null;
}

// The language a shop's team gets first (SHOP_FIRST), if theirs has one.
const shopFirst = () => (state.shopId && SHOP_FIRST[state.shopId]) || null;

// The language the person would get: their choice; else their shop's first language; else
// Indonesian if something says so; else English.
export function wantedAppLanguage() {
  if (LANGUAGES.includes(state.choice)) return state.choice;
  if (shopFirst()) return shopFirst();
  if (phoneLanguage() === 'id') return 'id';
  if (state.shopCountry === 'Indonesia') return 'id';
  // Where they are: the time zone only. Their phone's other languages don't count here: someone
  // who put English first wants English.
  if (hasWindow() && visitorCountry({ languages: [] }) === 'Indonesia') return 'id';
  return 'en';
}

// A language shown on every screen: the one this device previews, or the shop's first language.
const everyGroup = (language) => TRANSLATED.includes(language) && (state.preview === language || shopFirst() === language);

// Whether a language can be picked: English always; another once a group of it is signed off,
// on a device previewing it, or in a shop that has it first.
function languageOpen(language) {
  return language === 'en' || everyGroup(language) || (TRANSLATED.includes(language) && liveGroups(language).length > 0);
}

// The languages the switch offers, in its order.
export function availableAppLanguages() {
  return LANGUAGES.filter(languageOpen);
}

// Whether there is anything to switch to.
export function appLanguageAvailable() {
  return availableAppLanguages().length > 1;
}

// The language the app shows now.
export function appLanguage() {
  const wanted = wantedAppLanguage();
  return languageOpen(wanted) ? wanted : 'en';
}

// For dates and numbers written with Intl.
export function appLocale() {
  return LOCALE[appLanguage()];
}

export function isAppLanguagePreview() {
  return Boolean(state.preview);
}

// The language this device is previewing, or null.
export function appLanguagePreview() {
  return state.preview;
}

// The groups a language shows: null for every group (a preview of it, or a shop that has it first).
function groupsShown(language) {
  return everyGroup(language) ? null : liveGroups(language);
}

// What the loaded words must be for what the app shows now ('' in English).
function catalogKey() {
  const language = appLanguage();
  if (language === 'en') return '';
  const shown = groupsShown(language);
  return `${language}|${shown ? shown.join(',') : '*'}`;
}

const loaded = new Map(); // catalogKey -> words, so switching back is instant
let loading = null;
function useCatalog(key, catalog) {
  state.catalog = catalog;
  state.catalogFor = key;
  notify();
}
function loadCatalog() {
  const key = catalogKey();
  if (!key || state.catalogFor === key) return Promise.resolve();
  if (loaded.has(key)) { useCatalog(key, loaded.get(key)); return Promise.resolve(); }
  if (loading?.key === key) return loading.promise;
  const language = key.split('|')[0];
  const promise = LOADERS[language]()
    .then(({ GROUPS }) => {
      const shown = groupsShown(language);
      const catalog = {};
      for (const [group, phrases] of Object.entries(GROUPS)) {
        if (!shown || shown.includes(group)) Object.assign(catalog, phrases);
      }
      loaded.set(key, catalog);
      // Someone who switched again meanwhile gets the words of their newer choice instead.
      if (catalogKey() === key) useCatalog(key, catalog);
    })
    .catch((error) => { console.warn(`Sellio: the words in "${language}" did not load`, error); })
    .finally(() => { if (loading?.key === key) loading = null; });
  loading = { key, promise };
  return promise;
}

// Resolves once the words the app will show are ready (at once in English), or after
// `timeout` ms at the latest, so a slow connection never holds the app back.
export function appTextReady({ timeout = 1500 } = {}) {
  return Promise.race([loadCatalog(), new Promise((resolve) => setTimeout(resolve, timeout))]);
}

const BLANK = /\{([a-zA-Z0-9_]+)\}/g;

// Fills the {blanks}. A blank can be something on screen (a link, a bold name): then the result
// is a list of text and those elements, which React shows in place. A blank with no value stays
// as written.
function fill(text, vars) {
  if (!vars) return text;
  const value = (name) => (Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined);
  if (!Object.values(vars).some((v) => isValidElement(v))) {
    return text.replace(BLANK, (whole, name) => (value(name) != null ? String(value(name)) : whole));
  }
  const parts = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(BLANK)) {
    const filled = value(match[1]);
    if (filled == null) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(isValidElement(filled) ? cloneElement(filled, { key: `blank-${n++}` }) : String(filled));
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// The English phrase with its {blanks} filled: what a shared helper gives a screen that isn't
// translated yet, while a translated screen passes its t.
export function englishText(phrase, vars) {
  return fill(phrase, vars);
}

// A phrase in the app's language, its {blanks} filled in. English when it has no translation, or
// while the words of a language just picked are still loading.
export function appT(phrase, vars) {
  const language = appLanguage();
  const words = language !== 'en' && state.catalogFor.startsWith(`${language}|`) ? state.catalog : null;
  const text = words && typeof phrase === 'string' ? (words[phrase] ?? phrase) : phrase;
  return fill(String(text ?? ''), vars);
}

// Marks a phrase written outside a component (a list of tabs, say) for translation; the screen
// that shows it passes it through t() then.
export const N_ = (phrase) => phrase;

// A shop's own language: Bahasa Indonesia for a shop in Indonesia (once it's switched on), else
// English. Printed receipts and kitchen chits use it, for the shop's customers and its kitchen,
// whatever language the person printing has picked. (A Singapore or Malaysian shop's receipts
// stay English, whatever its owner reads the app in.)
export function shopLanguage(tenant) {
  return tenant?.country === 'Indonesia' && liveGroups('id').length > 0 ? 'id' : 'en';
}

// The words in one language whatever the app shows now: a t() for that language. English needs
// nothing; Indonesian loads the live groups' words once (the same file the app loads).
let wordsInIndonesian = null;
export async function wordsIn(language) {
  if (language !== 'id' || liveGroups('id').length === 0) return englishText;
  if (!wordsInIndonesian) {
    const { GROUPS } = await LOADERS.id();
    const catalog = {};
    for (const group of liveGroups('id')) Object.assign(catalog, GROUPS[group] || {});
    wordsInIndonesian = (phrase, vars) => fill(String(catalog[phrase] ?? phrase ?? ''), vars);
  }
  return wordsInIndonesian;
}

export function setAppLanguage(language) {
  if (!LANGUAGES.includes(language)) return;
  state.choice = language;
  writeStorage(CHOICE_KEY, language);
  notify();
  loadIfShown();
}

// The shop the person is working in (TenantProvider tells it): an Indonesian shop's team gets
// Bahasa Indonesia, and a shop in SHOP_FIRST its language, unless they chose otherwise.
export function noteShop({ id = null, country = null } = {}) {
  const nextId = id || null;
  const nextCountry = country || null;
  if (state.shopId === nextId && state.shopCountry === nextCountry) return;
  state.shopId = nextId;
  state.shopCountry = nextCountry;
  notify();
  loadIfShown();
}

function subscribe(listener) {
  listeners.add(listener);
  loadCatalog();
  return () => listeners.delete(listener);
}
// After a change: load the words if a screen is showing them (store pages never do).
function loadIfShown() {
  if (listeners.size > 0) loadCatalog();
}
const version = () => state.version;

// In a component: const { t } = useAppText(); the component shows the new language as soon as
// it changes. Words kept in useMemo or useState need textKey among their inputs, which changes
// whenever the language or the loaded words do.
//
// A screen of a group that isn't switched on yet names it: useAppText('explore'). It shows
// English then, but in a reviewer's preview of that language, so nobody sees it half translated
// (a phrase that a live group has would otherwise show translated among English ones). Once the
// group is in the language's LIVE_GROUPS, it shows like any other. Shared pieces don't call
// this: they take the t of the screen that shows them.
export function groupShown(group, language = appLanguage()) {
  return !group || language === 'en' || everyGroup(language) || liveGroups(language).includes(group);
}
export function useAppText(group) {
  useSyncExternalStore(subscribe, version, version);
  const current = appLanguage();
  const shown = groupShown(group, current);
  const language = shown ? current : 'en';
  return {
    t: shown ? appT : englishText,
    language,
    locale: LOCALE[language],
    languages: availableAppLanguages(),
    available: appLanguageAvailable(),
    preview: state.preview || false,
    textKey: `${language}:${language !== 'en' ? state.catalogFor : ''}`,
    setLanguage: setAppLanguage,
    endPreview: endAppLanguagePreview,
  };
}

// Ends a reviewer's preview on this device: back to how the app chooses for everyone.
export function endAppLanguagePreview() {
  writeStorage(PREVIEW_KEY, null);
  writeStorage(CHOICE_KEY, null);
  state.preview = null;
  state.choice = null;
  notify();
}

// Tests start from a clean slate. preview: a language (true: Indonesian, as before 中文 and Malay).
export function resetAppTextForTests({ preview = false, choice = null, shopCountry = null, shopId = null } = {}) {
  Object.assign(state, { choice, shopId, shopCountry, preview: previewLanguage(preview), catalog: null, catalogFor: '' });
  loading = null;
  loaded.clear();
  notify();
  return loadCatalog();
}

function start() {
  if (!hasWindow()) return;
  try {
    const url = new URL(window.location.href);
    const preview = url.searchParams.get('preview_language');
    if (TRANSLATED.includes(preview)) {
      writeStorage(PREVIEW_KEY, preview);
      writeStorage(CHOICE_KEY, preview);
    } else if (preview === 'off') {
      writeStorage(PREVIEW_KEY, null);
      writeStorage(CHOICE_KEY, null);
    }
    if (preview) {
      url.searchParams.delete('preview_language');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* an odd address: no preview */ }
  state.preview = previewLanguage(readStorage(PREVIEW_KEY));
  state.choice = readStorage(CHOICE_KEY);
}
start();
