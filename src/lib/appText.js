// The owner app's own words in Bahasa Indonesia (Phase 2; Alvin, 12 Nov 2026: "proceed with
// phase 2"). Buyers' store pages have their own dictionary (LanguageContext.jsx); this is for
// the people who run a shop.
//
// English is written in the code and is the key: t('Save changes'), with {name} blanks for
// values, t('{count} orders today', { count }). Indonesian lives in src/locales/id/<group>.json,
// one group of screens at a time, drafted by Claude from the glossary (src/locales/id/GLOSSARY.md)
// and loaded only for people who see it, so nobody else downloads it. A group shows once a
// native speaker has signed it off (LIVE_GROUPS); until then only a reviewer sees it, in a
// preview (open any app page once with ?preview_language=id; ?preview_language=off ends it).
// scripts/check-app-text.mjs fails the build if a phrase has no Indonesian.
//
// English stays the default. Bahasa Indonesia switches on from the phone's language first, then
// the shop's country, then where the person is (their time zone). Anyone can switch, and the
// choice is remembered on that device.
import { cloneElement, isValidElement, useSyncExternalStore } from 'react';
import { visitorCountry } from './countries';

// Groups of screens a native speaker has signed off. The others show only in a preview.
export const LIVE_GROUPS = [];

const CHOICE_KEY = 'sellio_app_language';
const PREVIEW_KEY = 'sellio_app_language_preview';
const LANGUAGES = ['en', 'id'];

const state = { choice: null, shopCountry: null, preview: false, catalog: null, catalogFor: '', version: 0 };
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

// The language the person would get; 'en' unless something says Indonesian.
export function wantedAppLanguage() {
  if (LANGUAGES.includes(state.choice)) return state.choice;
  if (phoneLanguage() === 'id') return 'id';
  if (state.shopCountry === 'Indonesia') return 'id';
  // Where they are: the time zone only. Their phone's other languages don't count here: someone
  // who put English first wants English.
  if (hasWindow() && visitorCountry({ languages: [] }) === 'Indonesia') return 'id';
  return 'en';
}

// Whether Bahasa Indonesia can be picked yet: a group is signed off, or this is a preview.
export function appLanguageAvailable() {
  return LIVE_GROUPS.length > 0 || state.preview;
}

// The language the app shows now.
export function appLanguage() {
  return appLanguageAvailable() && wantedAppLanguage() === 'id' ? 'id' : 'en';
}

// For dates and numbers written with Intl.
export function appLocale() {
  return appLanguage() === 'id' ? 'id-ID' : 'en-SG';
}

export function isAppLanguagePreview() {
  return state.preview;
}

function groupsShown() {
  return state.preview ? null : LIVE_GROUPS; // null: every group (a preview)
}

let loading = null;
function loadCatalog() {
  const key = state.preview ? '*' : LIVE_GROUPS.join(',');
  if (appLanguage() !== 'id' || state.catalogFor === key) return Promise.resolve();
  if (loading?.key === key) return loading.promise;
  const promise = import('../locales/id/index.js')
    .then(({ ID_GROUPS }) => {
      const shown = groupsShown();
      const catalog = {};
      for (const [group, phrases] of Object.entries(ID_GROUPS)) {
        if (!shown || shown.includes(group)) Object.assign(catalog, phrases);
      }
      state.catalog = catalog;
      state.catalogFor = key;
      notify();
    })
    .catch((error) => { console.warn('Sellio: the Indonesian words did not load', error); })
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

// A phrase in the app's language, its {blanks} filled in. English when there is no Indonesian.
export function appT(phrase, vars) {
  const text = appLanguage() === 'id' && state.catalog && typeof phrase === 'string' ? (state.catalog[phrase] ?? phrase) : phrase;
  return fill(String(text ?? ''), vars);
}

// Marks a phrase written outside a component (a list of tabs, say) for translation; the screen
// that shows it passes it through t() then.
export const N_ = (phrase) => phrase;

export function setAppLanguage(language) {
  if (!LANGUAGES.includes(language)) return;
  state.choice = language;
  writeStorage(CHOICE_KEY, language);
  notify();
  loadIfShown();
}

// The shop the person is working in (TenantProvider tells it): an Indonesian shop's team gets
// Bahasa Indonesia unless they chose otherwise.
export function noteShopCountry(country) {
  const next = country || null;
  if (state.shopCountry === next) return;
  state.shopCountry = next;
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
export function useAppText() {
  useSyncExternalStore(subscribe, version, version);
  const language = appLanguage();
  return {
    t: appT,
    language,
    locale: appLocale(),
    available: appLanguageAvailable(),
    preview: state.preview,
    textKey: `${language}:${language === 'id' ? state.catalogFor : ''}`,
    setLanguage: setAppLanguage,
    endPreview: endAppLanguagePreview,
  };
}

// Ends a reviewer's preview on this device: back to how the app chooses for everyone.
export function endAppLanguagePreview() {
  writeStorage(PREVIEW_KEY, null);
  writeStorage(CHOICE_KEY, null);
  state.preview = false;
  state.choice = null;
  notify();
}

// Tests start from a clean slate.
export function resetAppTextForTests({ preview = false, choice = null, shopCountry = null } = {}) {
  Object.assign(state, { choice, shopCountry, preview, catalog: null, catalogFor: '' });
  loading = null;
  notify();
  return loadCatalog();
}

function start() {
  if (!hasWindow()) return;
  try {
    const url = new URL(window.location.href);
    const preview = url.searchParams.get('preview_language');
    if (preview === 'id') {
      writeStorage(PREVIEW_KEY, '1');
      writeStorage(CHOICE_KEY, 'id');
    } else if (preview === 'off') {
      writeStorage(PREVIEW_KEY, null);
      writeStorage(CHOICE_KEY, null);
    }
    if (preview) {
      url.searchParams.delete('preview_language');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* an odd address: no preview */ }
  state.preview = readStorage(PREVIEW_KEY) === '1';
  state.choice = readStorage(CHOICE_KEY);
}
start();
