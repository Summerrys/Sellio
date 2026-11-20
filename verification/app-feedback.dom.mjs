// The Sellio app's own rating (Alvin, 20 Nov 2026): "How's Sellio working for you?" once, on the
// third separate day someone opens the Android app; 1–4 stars: what could be better (Sellio only);
// 5 stars: Rate on Google Play; any answer (Maybe later, Skip, closing it) means it isn't asked
// again (per account; per phone signed out). And Admin → Feedback for Sellio's admins.
// Run: node verification/app-feedback.dom.mjs   (jsdom installed in /tmp/sellio-verification)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/tmp/sellio-verification/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://sellio.sg/explore', pretendToBeVisual: true });
const win = dom.window;
for (const key of ['document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'DocumentFragment', 'Node', 'Event',
  'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'NodeFilter', 'MouseEvent', 'MutationObserver', 'sessionStorage', 'localStorage', 'navigator', 'getComputedStyle', 'history', 'location']) {
  Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
win.scrollTo = () => {};
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'sellio-app-feedback-'));
const local = path.join(process.cwd(), '.app-feedback-bundle.mjs');
const mocks = {
  clients: [
    'export const getSupabase = async () => ({ rpc: async (name, args) => globalThis.rpcHandler(name, args) });',
    "export const SUPABASE_URL = 'https://project.example.invalid';",
  ].join('\n'),
  profile: 'export const cookieUtils = { clear() {} }; export const useAppUser = () => globalThis.appUserState;',
  toast: 'export const toast = Object.assign(() => {}, { error() {}, success(m) { (globalThis.toasts ||= []).push(m); } }); export const Toaster = () => null;',
  shared: "export const BOTTOM_INSET = '0px'; export const timeAgo = () => '5 min ago';",
  tabbar: "export default function TabBar() { return null; } export const TAB_BAR_SPACE = '80px';",
};
const plugin = { name: 'app-feedback-fixtures', setup(builder) {
  for (const [filter, key] of [[/supabaseClient$/, 'clients'], [/AppUserContext$/, 'profile'], [/^sonner$/, 'toast'],
    [/(^|\/)shared$/, 'shared'], [/ExploreTabBar$/, 'tabbar']]) {
    builder.onResolve({ filter }, () => ({ path: key, namespace: 'mock' }));
  }
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ loader: 'js', contents: mocks[args.path], resolveDir: process.cwd() }));
} };

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await act(async () => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }); };
const buttonNamed = (label) => [...document.body.querySelectorAll('button')].find((b) => text(b) === label);
const starButton = (n) => document.body.querySelector(`[role="radio"][aria-label^="${n} star"]`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (ms = 0) => { await act(async () => { await sleep(ms); }); };
const typeInto = async (field, value) => {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new win.Event('input', { bubbles: true })); });
};

let calls = [];
const submits = () => calls.filter((c) => c.name === 'submit_app_feedback');
let failNextSubmit = false;
let serverDone = false;
function useServer() {
  calls = [];
  globalThis.rpcHandler = async (name, args) => {
    calls.push({ name, args });
    if (name === 'submit_app_feedback') {
      if (failNextSubmit) { failNextSubmit = false; return { data: null, error: { message: 'Failed to fetch' } }; }
      return { data: { status: 'saved', id: 'fb-1' }, error: null };
    }
    if (name === 'app_feedback_status') return { data: { done: serverDone }, error: null };
    return { data: null, error: null };
  };
}

try {
  await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'js',
      contents: [
        "export { default as AppRatingPrompt, AppRatingSheet, calmMoment } from '@/components/feedback/AppRatingPrompt';",
        "export { default as AppFeedbackInbox } from '@/components/feedback/AppFeedbackInbox';",
        "export * as feedback from '@/lib/appFeedback';",
        "export { resetAppTextForTests, appTextReady } from '@/lib/appText';",
        "export { handleAndroidBack } from '@/lib/useBackToClose';",
      ].join('\n'),
    },
    outfile: path.join(tmp, 'feedback.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
    alias: { '@': path.join(process.cwd(), 'src') }, plugins: [plugin], logLevel: 'silent',
  });
  await copyFile(path.join(tmp, 'feedback.mjs'), local);
  const { AppRatingPrompt, AppRatingSheet, calmMoment, AppFeedbackInbox, feedback, resetAppTextForTests, appTextReady, handleAndroidBack } = await import(pathToFileURL(local));

  const opened = [];
  win.open = (url) => { opened.push(url); return null; };

  async function show(element) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(element); });
    return async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ''; };
  }
  const done = () => JSON.parse(localStorage.getItem('sellio_app_feedback_done') || '{}');
  let closed = 0;
  const sheet = (account) => React.createElement(AppRatingSheet, { open: true, account, onClose: () => { closed++; } });

  // ── The days ────────────────────────────────────────────────────────────────────────────────
  localStorage.clear();
  assert.equal(feedback.noteAppDay(new Date(2026, 10, 18, 9)), 1);
  assert.equal(feedback.noteAppDay(new Date(2026, 10, 18, 23)), 1, 'the same day counts once');
  assert.equal(feedback.noteAppDay(new Date(2026, 10, 20, 8)), 2);
  assert.equal(feedback.appDaysSoFar(), 2);
  assert.equal(feedback.noteAppDay(new Date(2026, 10, 25, 8)), 3, 'separate days, not in a row');
  assert.equal(feedback.noteAppDay(new Date(2026, 10, 26, 8)), 3, 'it stops counting at three');
  assert.equal(feedback.localDay(new Date(2026, 0, 5, 0, 30)), '2026-01-05', "the phone's own date");
  passed('the third separate day Sellio is opened is counted on the phone (the same day twice counts once)');

  feedback.noteAnswered('Mei@Bakes.sg ');
  assert.equal(feedback.answeredOnThisPhone('mei@bakes.sg'), true);
  assert.equal(feedback.answeredOnThisPhone('ali@kopi.sg'), false, 'another account on the same phone is asked');
  assert.equal(feedback.answeredOnThisPhone(''), false, 'signed out is asked separately');
  feedback.noteAnswered('');
  assert.equal(feedback.answeredOnThisPhone(null), true);
  passed('answered: per account when signed in, per phone when signed out');

  // ── Maybe later ─────────────────────────────────────────────────────────────────────────────
  localStorage.clear(); useServer(); closed = 0;
  let close = await show(sheet('mei@bakes.sg'));
  assert.equal(text(document.querySelector('#app-rating-title')), 'How’s Sellio working for you?');
  assert.match(text(document.body), /Tap a star\. Your rating goes straight to the Sellio team\./);
  assert.match(text(document.body), /Not good\s*Love it/);
  assert.equal(document.querySelectorAll('[role="radio"]').length, 5);
  await click(buttonNamed('Maybe later'));
  await settle();
  assert.equal(closed, 1, 'it closes');
  assert.equal(submits().length, 1);
  const dismissed = submits()[0].args;
  assert.equal(dismissed.p_outcome, 'dismissed');
  assert.equal(dismissed.p_stars, null);
  assert.equal(dismissed.p_language, 'en');
  assert.equal(dismissed.p_platform, 'web');
  assert.match(dismissed.p_device_id, /^dev_/);
  assert.equal(localStorage.getItem('sellio_device_id'), dismissed.p_device_id, "the phone's id store pages use too");
  assert.deepEqual(done().accounts, ['mei@bakes.sg'], 'not asked again for this account');
  await close();
  passed('Maybe later is kept (dismissed), and this account is not asked again');

  // ── 1–4 stars: feedback for Sellio only ─────────────────────────────────────────────────────
  localStorage.clear(); useServer(); closed = 0; opened.length = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(2));
  assert.equal(text(document.querySelector('#app-rating-title')), 'Thanks. What could be better?');
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'low');
  assert.equal(starButton(2).getAttribute('aria-checked'), 'true');
  const chips = [...document.querySelectorAll('button[aria-pressed]')].map(text);
  assert.deepEqual(chips, ['Ease of use', 'Speed', 'Ordering', 'Design', 'Something’s broken', 'Something else']);
  await click(buttonNamed('Speed'));
  await click(buttonNamed('Something’s broken'));
  await click(buttonNamed('Ease of use'));
  await click(buttonNamed('Ease of use')); // and off again
  assert.equal(buttonNamed('Speed').getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed('Ease of use').getAttribute('aria-pressed'), 'false');
  const note = document.querySelector('textarea');
  assert.equal(note.getAttribute('placeholder'), 'What happened, and what would help?');
  assert.equal(note.getAttribute('maxlength'), '2000');
  await typeInto(note, '  Printer keeps disconnecting  ');
  const contact = document.querySelector('input[type="checkbox"]');
  assert.ok(contact, 'signed in: You can contact me about this');
  assert.equal(contact.checked, false, 'not ticked for them');
  assert.match(text(contact.closest('label')), /You can contact me about this\s*We’ll use your account’s phone number or email\./);
  await act(async () => { contact.click(); });
  assert.equal(document.body.innerHTML.includes('play.google.com'), false, 'no Google Play link for 1–4 stars');
  await click(buttonNamed('Send feedback'));
  await settle();
  assert.equal(submits().length, 1);
  const low = submits()[0].args;
  assert.equal(low.p_outcome, 'rated');
  assert.equal(low.p_stars, 2);
  assert.deepEqual(low.p_topics, ['speed', 'broken']);
  assert.equal(low.p_comment, 'Printer keeps disconnecting');
  assert.equal(low.p_contact_ok, true);
  assert.equal(low.p_opened_play, false);
  assert.equal(text(document.querySelector('#app-rating-title')), 'Thanks, that really helps');
  assert.match(text(document.body), /The Sellio team reads every message\. If you said we can contact you, we’ll get back to you\./);
  await click(buttonNamed('Done'));
  assert.equal(closed, 1);
  assert.equal(submits().length, 1, 'sent once');
  assert.equal(opened.length, 0, 'nothing opened');
  await close();
  passed('1–4 stars: what could be better, a note and "You can contact me" go to Sellio, and no Google Play link');

  // Sending fails: say so, and Send feedback again works.
  localStorage.clear(); useServer(); closed = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(3));
  failNextSubmit = true;
  await click(buttonNamed('Send feedback'));
  await settle();
  assert.equal(text(document.querySelector('[role="alert"]')), "Couldn't send that. Check your connection and try again.");
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'low');
  await click(buttonNamed('Send feedback'));
  await settle();
  assert.equal(submits().length, 2);
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'sent');
  await close();
  passed('a feedback that could not be sent says so, and can be sent again');

  // Signed out: no contact box; Skip keeps the stars only.
  localStorage.clear(); useServer(); closed = 0;
  close = await show(sheet(''));
  await click(starButton(3));
  assert.equal(document.querySelector('input[type="checkbox"]'), null, 'no "You can contact me" when signed out');
  await click(buttonNamed('Speed'));
  await typeInto(document.querySelector('textarea'), 'slow');
  await click(buttonNamed('Skip'));
  await settle();
  assert.equal(closed, 1);
  const skipped = submits()[0].args;
  assert.equal(skipped.p_outcome, 'rated');
  assert.equal(skipped.p_stars, 3);
  assert.deepEqual(skipped.p_topics, []);
  assert.equal(skipped.p_comment, null);
  assert.equal(skipped.p_contact_ok, false);
  assert.equal(done().phone, true, 'this phone is not asked again while signed out');
  await close();
  passed('signed out: no contact box; Skip keeps just the stars, and the phone is not asked again');

  // Changing their mind: 4 stars, then 5.
  localStorage.clear(); useServer();
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(4));
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'low');
  await click(starButton(5));
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'five');
  await click(starButton(1));
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'low');
  assert.equal(submits().length, 0, 'nothing sent while choosing');
  await close();
  passed('the stars can still be changed after the first tap (5 goes to Google Play, 1–4 back to feedback)');

  // ── 5 stars: Google Play ────────────────────────────────────────────────────────────────────
  localStorage.clear(); useServer(); closed = 0; opened.length = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(5));
  assert.equal(text(document.querySelector('#app-rating-title')), 'Glad it’s working for you!');
  assert.match(text(document.body), /Would you leave that rating on Google Play too\? It helps other shops find Sellio\./);
  await click(buttonNamed('Rate on Google Play'));
  await settle();
  assert.deepEqual(opened, [feedback.PLAY_LISTING]);
  assert.equal(feedback.PLAY_LISTING, 'https://play.google.com/store/apps/details?id=com.base6985959ce9aaceadb8b7cc41.app');
  assert.equal(closed, 1);
  const five = submits()[0].args;
  assert.equal(five.p_outcome, 'rated');
  assert.equal(five.p_stars, 5);
  assert.equal(five.p_opened_play, true);
  assert.deepEqual(done().accounts, ['mei@bakes.sg']);
  await close();
  passed('5 stars: Rate on Google Play opens Sellio’s Play listing, and the 5 stars are kept for Sellio too');

  localStorage.clear(); useServer(); closed = 0; opened.length = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(5));
  await click(buttonNamed('Maybe later'));
  await settle();
  assert.equal(opened.length, 0);
  assert.equal(submits()[0].args.p_stars, 5);
  assert.equal(submits()[0].args.p_opened_play, false);
  assert.deepEqual(done().accounts, ['mei@bakes.sg'], 'not asked again');
  await close();
  passed('5 stars, Maybe later: the rating is kept and it is not asked again');

  // Closing it (Back, Escape, a tap outside) is an answer too.
  localStorage.clear(); useServer(); closed = 0;
  close = await show(sheet('mei@bakes.sg'));
  await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' })); });
  await settle();
  assert.equal(closed, 1);
  assert.equal(submits()[0].args.p_outcome, 'dismissed');
  await close();
  localStorage.clear(); useServer(); closed = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(2));
  await click(document.querySelector('[role="dialog"] > [aria-hidden="true"]')); // the dimmed page
  await settle();
  assert.equal(closed, 1);
  assert.equal(submits()[0].args.p_stars, 2, 'the stars they gave are kept');
  assert.deepEqual(done().accounts, ['mei@bakes.sg']);
  await close();
  localStorage.clear(); useServer(); closed = 0;
  close = await show(sheet('mei@bakes.sg'));
  await click(starButton(5));
  let handled;
  await act(async () => { handled = handleAndroidBack(); });
  await settle();
  assert.equal(handled, true, "the phone's Back closes it");
  assert.equal(closed, 1);
  assert.equal(submits()[0].args.p_stars, 5);
  assert.equal(submits()[0].args.p_opened_play, false);
  await close();
  passed('closing it with Back, Escape or a tap outside counts as an answer (not asked again)');

  // ── In the person's language ────────────────────────────────────────────────────────────────
  for (const [language, title, later] of [['zh', 'Sellio 用起来怎么样？', '以后再说'], ['ms', 'Bagaimanakah pengalaman anda dengan Sellio?', 'Mungkin nanti'], ['id', 'Bagaimana pengalaman Anda dengan Sellio?', 'Nanti saja']]) {
    localStorage.clear(); useServer();
    resetAppTextForTests({ choice: language });
    await appTextReady({ timeout: 5000 });
    close = await show(sheet('mei@bakes.sg'));
    await settle();
    assert.equal(text(document.querySelector('#app-rating-title')), title, language);
    await click(buttonNamed(later));
    await settle();
    assert.equal(submits()[0].args.p_language, language);
    await close();
  }
  resetAppTextForTests();
  passed('in the language the person set (中文, BM, ID), and Sellio is told which');

  // ── When it's asked ─────────────────────────────────────────────────────────────────────────
  const prompt = () => React.createElement(AppRatingPrompt, { settleMs: 30, retryMs: 30, retries: 100 });
  const dialogTitle = () => text(document.querySelector('[role="dialog"] #app-rating-title'));
  const yesterday = (n) => feedback.localDay(new Date(Date.now() - n * 86400000));
  globalThis.appUserState = { appUser: { email: 'mei@bakes.sg' } };

  localStorage.clear(); useServer(); serverDone = false;
  localStorage.setItem('sellio_app_days', JSON.stringify([yesterday(3)]));
  history.replaceState(null, '', '/explore');
  close = await show(prompt());
  await settle(150);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'the second day: not yet');
  assert.equal(feedback.appDaysSoFar(), 2, 'today counted');
  assert.equal(calls.length, 0, 'Sellio not even asked');
  await close();
  passed('not asked on the first or second day');

  localStorage.clear(); useServer(); serverDone = false;
  localStorage.setItem('sellio_app_days', JSON.stringify([yesterday(9), yesterday(4)]));
  close = await show(prompt());
  await settle(150);
  assert.equal(dialogTitle(), 'How’s Sellio working for you?', 'the third day: asked');
  assert.deepEqual(calls.map((c) => c.name), ['app_feedback_status'], 'after checking with Sellio');
  assert.match(calls[0].args.p_device_id, /^dev_/);
  await close();
  passed('asked on the third separate day, once Sellio says this account has not answered');

  localStorage.clear(); useServer(); serverDone = true;
  localStorage.setItem('sellio_app_days', JSON.stringify([yesterday(9), yesterday(4), yesterday(1)]));
  close = await show(prompt());
  await settle(150);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'answered on another phone');
  assert.deepEqual(done().accounts, ['mei@bakes.sg'], 'remembered here');
  await close();
  useServer(); serverDone = false;
  close = await show(prompt());
  await settle(150);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(calls.length, 0, 'this phone knows: Sellio not asked again');
  await close();
  passed('not asked again once answered (on any phone for the account), without asking Sellio every time');

  // Busy moments: wait for a calm one.
  localStorage.clear(); useServer(); serverDone = false;
  localStorage.setItem('sellio_app_days', JSON.stringify([yesterday(9), yesterday(4), yesterday(1)]));
  history.replaceState(null, '', '/Orders');
  assert.equal(calmMoment(), false, 'taking orders');
  for (const busy of ['/KitchenDisplay', '/Counter', '/store/kopi-corner', '/order/kopi-corner/t1', '/explore/cart', '/explore/chats/abc', '/Auth', '/Onboarding', '/admin/feedback']) {
    history.replaceState(null, '', busy);
    assert.equal(calmMoment(), false, busy);
  }
  history.replaceState(null, '', '/Orders');
  close = await show(prompt());
  await settle(150);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'not over the orders');
  history.replaceState(null, '', '/explore/me');
  const other = document.createElement('div');
  other.setAttribute('role', 'dialog');
  document.body.appendChild(other);
  await settle(120);
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'not over another window');
  other.remove();
  const field = document.createElement('input');
  document.body.appendChild(field);
  field.focus();
  await settle(120);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'not while typing');
  field.remove();
  document.documentElement.setAttribute('data-sellio-launch', '');
  await settle(120);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'not under the launch splash');
  document.documentElement.removeAttribute('data-sellio-launch');
  await settle(150);
  assert.equal(dialogTitle(), 'How’s Sellio working for you?', 'then, at a calm moment');
  await close();
  passed('it waits for a calm moment: not while taking orders, checking out, chatting or signing in, over another window or while typing');

  // Signed out: per phone.
  localStorage.clear(); useServer(); serverDone = false;
  globalThis.appUserState = { appUser: null };
  localStorage.setItem('sellio_app_days', JSON.stringify([yesterday(9), yesterday(4), yesterday(1)]));
  history.replaceState(null, '', '/explore');
  close = await show(prompt());
  await settle(150);
  assert.ok(document.querySelector('[role="dialog"]'), 'someone not signed in is asked too');
  await click(buttonNamed('Maybe later'));
  await settle();
  assert.equal(done().phone, true);
  assert.equal(submits()[0].args.p_contact_ok, false);
  await close();
  passed('people who are not signed in are asked too (once per phone)');

  // ── Admin → Feedback ────────────────────────────────────────────────────────────────────────
  const item = (over) => ({
    id: 'f1', created_at: '2026-11-20T08:00:00Z', stars: 2, topics: ['broken', 'speed'], comment: 'Printer keeps disconnecting',
    contact_ok: true, opened_play: false, role: 'seller', shop_name: 'Kopi Corner', language: 'en', platform: 'android',
    app_version: '2.0 (206)', is_test: false, status: 'new', handled_at: null, contact_email: 'ali@kopi.sg', contact_phone: '+6591234567', contact_name: 'Ali', ...over,
  });
  let admin = true;
  function useAdminServer() {
    calls = [];
    globalThis.rpcHandler = async (name, args) => {
      calls.push({ name, args });
      if (name === 'am_i_sellio_admin') return { data: admin, error: null };
      if (name === 'app_feedback_admin_summary') return { data: { ratings: 3, average: 3.7, by_stars: { 5: 1, 4: 1, 3: 0, 2: 1, 1: 0 }, low_open: 1, dismissed: 2, opened_play: 1, tests: args.p_include_test ? 0 : 1 }, error: null };
      if (name === 'app_feedback_admin_list') {
        const list = [item(), item({ id: 'f2', stars: 5, topics: [], comment: null, contact_ok: false, opened_play: true, role: 'buyer', shop_name: null, language: 'zh', contact_email: null, contact_phone: null })];
        return { data: args.p_filter === 'low' ? list.slice(0, 1) : list, error: null };
      }
      if (name === 'app_feedback_admin_mark') return { data: { status: args.p_done ? 'done' : 'new' }, error: null };
      if (name === 'app_feedback_admin_note_device') return { data: { status: 'noted' }, error: null };
      return { data: null, error: null };
    };
  }
  localStorage.clear(); useAdminServer(); admin = true;
  globalThis.appUserState = { appUser: { email: 'admin@example.com' } };
  globalThis.toasts = [];
  close = await show(React.createElement(AppFeedbackInbox));
  await settle(20);
  assert.match(text(document.body), /Feedback\s*How people rate the Sellio app/);
  assert.match(text(document.body), /3\.7\s*from 3 ratings/);
  const filterLabels = [...document.querySelectorAll('[aria-label="Filter by rating"] button')].map(text);
  assert.deepEqual(filterLabels, ['All · 3', '1–3★ · 1', '4★ · 1', '5★ · 1', 'To do · 1']);
  assert.match(text(document.body), /Maybe later: 2 · Opened Google Play: 1 · 1 test answer left out/);
  const cards = document.querySelectorAll('[data-testid="feedback-item"]');
  assert.equal(cards.length, 2);
  assert.match(text(cards[0]), /Printer keeps disconnecting/);
  assert.match(text(cards[0]), /Something’s broken\s*Speed\s*Contact OK/);
  assert.match(text(cards[0]), /Business · Kopi Corner · EN · Android · v2\.0 \(206\)/);
  assert.match(text(cards[1]), /No comment.*Opened Google Play.*Buyer · 中文 · Android/);
  assert.equal(calls.filter((c) => c.name === 'app_feedback_admin_note_device').length, 1, "this phone's answers become tests");
  assert.match(calls.find((c) => c.name === 'app_feedback_admin_note_device').args.p_device_id, /^dev_/);
  await click(buttonNamed('Contact'));
  const reach = document.querySelector('[data-testid="feedback-contact"]');
  assert.ok(reach, 'Contact shows how to reach them');
  assert.ok([...reach.querySelectorAll('a')].some((a) => a.getAttribute('href') === 'https://wa.me/6591234567'), 'WhatsApp');
  assert.ok([...reach.querySelectorAll('a')].some((a) => a.getAttribute('href') === 'tel:+6591234567'), 'Call');
  assert.ok([...reach.querySelectorAll('a')].some((a) => a.getAttribute('href').startsWith('mailto:ali@kopi.sg')), 'Email');
  assert.equal(cards[1].querySelector('button') && text(cards[1].querySelector('button')), 'Mark done', 'no Contact without permission');
  await click([...cards[0].querySelectorAll('button')].find((b) => text(b) === 'Mark done'));
  await settle(10);
  const mark = calls.find((c) => c.name === 'app_feedback_admin_mark');
  assert.deepEqual(mark.args, { p_id: 'f1', p_done: true });
  assert.equal(document.querySelectorAll('[data-testid="feedback-item"]')[0].dataset.status, 'done');
  await click(buttonNamed('1–3★ · 1'));
  await settle(10);
  assert.equal(calls.filter((c) => c.name === 'app_feedback_admin_list').at(-1).args.p_filter, 'low');
  assert.equal(document.querySelectorAll('[data-testid="feedback-item"]').length, 1);
  const testsBox = [...document.querySelectorAll('input[type="checkbox"]')][0];
  await act(async () => { testsBox.click(); });
  await settle(10);
  assert.equal(calls.filter((c) => c.name === 'app_feedback_admin_list').at(-1).args.p_include_test, true);
  assert.equal(calls.filter((c) => c.name === 'am_i_sellio_admin').length, 1, 'the admin check once');
  assert.equal(calls.filter((c) => c.name === 'app_feedback_admin_note_device').length, 1);
  // Preview the question: as people see it, sending nothing.
  await click(buttonNamed('Preview the question (sends nothing)'));
  assert.equal(text(document.querySelector('[role="dialog"] #app-rating-title')), 'How’s Sellio working for you?');
  await click(starButton(2));
  await click(buttonNamed('Speed'));
  await click(buttonNamed('Send feedback'));
  await settle();
  assert.equal(document.querySelector('[data-testid="app-rating"]').dataset.step, 'sent');
  await click(buttonNamed('Done'));
  assert.equal(document.querySelector('[data-testid="app-rating"]'), null, 'closed');
  assert.equal(submits().length, 0, 'nothing sent');
  assert.equal(localStorage.getItem('sellio_app_feedback_done'), null, 'and still asked for real later');
  await close();
  passed('Admin → Feedback: the summary, filters, tags, Contact (only when they said yes) and Mark done; the phone is tagged for tests; Preview the question sends nothing');

  useAdminServer(); admin = false;
  globalThis.appUserState = { appUser: { email: 'mei@bakes.sg' } };
  close = await show(React.createElement(AppFeedbackInbox));
  await settle(20);
  assert.equal(text(document.querySelector('[data-testid="feedback-denied"]')), 'This page is for Sellio’s admins.');
  assert.deepEqual(calls.map((c) => c.name), ['am_i_sellio_admin'], 'nothing else is asked for');
  await close();
  passed('everyone else sees that Admin → Feedback is for Sellio’s admins');

  // Only in the Android app; the admin page is a route of its own.
  const appCode = await readFile(path.join(process.cwd(), 'src/App.jsx'), 'utf8');
  assert.match(appCode, /\{appPlatform\(\) === 'android' && <Suspense fallback=\{null\}><AppRatingPrompt \/><\/Suspense>\}/);
  assert.match(appCode, /<Route path="\/admin\/feedback" element=\{<LayoutWrapper currentPageName="Explore"><AppFeedbackInbox \/><\/LayoutWrapper>\} \/>/);
  assert.match(appCode, /const AppRatingPrompt = lazy\(\(\) => import\('@\/components\/feedback\/AppRatingPrompt'\)\);/, 'loaded only where it shows');
  passed('asked only in the Android app (not on the website or the iPhone app), loaded only there');

  console.log(passes + ' app-feedback checks passed');
} finally {
  await rm(local, { force: true });
  await rm(tmp, { recursive: true, force: true });
  dom.window.close();
}
