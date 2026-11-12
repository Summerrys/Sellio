// ChatGPT ads (Alvin, 12 Nov 2026): OpenAI's Pixel in index.html's head (#sellio-openai-pixel)
// and trial_started (src/lib/adsPixel.js).
// 1. The head script, run as the page runs it: it sets the Pixel up (the SDK script, consent, then
//    init with Sellio's Pixel ID) only on sellio.sg in a browser, after the cookie bar's Allow, on
//    the public and sign-up pages; never in the apps, at other addresses, on storefronts or in a
//    shop's workspace; and a later Allow starts it once.
// 2. adsPixel.js: a trial link opened from the website is noted; its checkout coming back from
//    Stripe (/Auth or /Account ?token=cs_…) is measured as trial_started with the checkout id as
//    event_id; no-trial links, other checkouts, old notes and pages without the Pixel aren't; the
//    cookie bar's Allow starts the Pixel and Decline stops it.
// 3. With a build (npm run build): every website page carries the script once, unchanged, and
//    nothing in dist-app (the apps) carries or names the Pixel.
// Run from the app root after installing jsdom into a temporary directory:
// npm install --prefix /tmp/sellio-verification --no-save --ignore-scripts jsdom@26.1.0
// node verification/openai-pixel.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM, CookieJar, VirtualConsole } = require('jsdom');

const SDK = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
const PIXEL_ID = '2bHx6GyaD53HN9UapJRGVS';
const DAY = 24 * 60 * 60 * 1000;
let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };
const plain = (value) => JSON.parse(JSON.stringify(value));

const SCRIPT = /<script id="sellio-openai-pixel">([\s\S]*?)<\/script>/;
const source = await readFile(path.join(app, 'index.html'), 'utf8');
const pixelCode = source.match(SCRIPT)?.[1];
assert.ok(pixelCode, 'index.html has the #sellio-openai-pixel script');

const consent = (analytics, { age = 1000, life = 180 * DAY } = {}) => {
  const updatedAt = Date.now() - age;
  return { version: 1, analytics, updatedAt, expiresAt: updatedAt + life };
};

// A page whose head runs the Pixel script (after another script, as in index.html).
function page(url, { cookie = null, app: platform = null, base44 = false } = {}) {
  const cookieJar = new CookieJar();
  if (cookie) cookieJar.setCookieSync(`sellio_cookie_consent=${encodeURIComponent(JSON.stringify(cookie))}; Path=/`, url);
  const html = `<!doctype html><html><head><script id="sellio-fresh-start">window.__first = true</script>` +
    `<script id="sellio-openai-pixel">${pixelCode}</script></head><body></body></html>`;
  return new JSDOM(html, {
    url, runScripts: 'dangerously', cookieJar,
    beforeParse(window) {
      if (platform) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
      if (base44) window.ReactNativeWebView = { postMessage() {} };
    },
  }).window;
}
const sdkScripts = (window) => [...window.document.querySelectorAll('script')].filter((s) => s.src === SDK);
const queued = (window) => plain(Array.from(window.oaiq?.q || [], (args) => Array.from(args))); // in Node's realm
const SET_UP = [['consent', true], ['init', { pixelId: PIXEL_ID, debug: true }]];

function expectPixel(window, label) {
  assert.equal(sdkScripts(window).length, 1, `${label}: the SDK script is added once`);
  const sdk = sdkScripts(window)[0];
  assert.ok(sdk.async, `${label}: the SDK loads async`); // OpenAI's snippet sets async=1 (jsdom keeps the 1)
  assert.equal(window.document.head.firstElementChild, sdk, `${label}: before the page's first script, at the top of the head`);
  assert.deepEqual(queued(window), SET_UP, `${label}: consent, then init with Sellio's Pixel ID`);
}
function expectNoPixel(window, label) {
  assert.equal(sdkScripts(window).length, 0, `${label}: no SDK script`);
  assert.equal(window.oaiq, undefined, `${label}: no oaiq`);
}

// 1. The head script.
const allowed = consent(true);
for (const where of ['/', '/privacy', '/terms/', '/explore', '/listing/35a9f64c-eef8-445d-a43a-44f27ecd65b2', '/Auth', '/Auth?token=cs_live_a1B2', '/auth', '/Join', '/join', '/Account?token=cs_live_a1B2', '/?oppref=abc123']) {
  expectPixel(page('https://sellio.sg' + where, { cookie: allowed }), where);
}
passed('the Pixel is set up on the public and sign-up pages once cookies are allowed (SDK first in the head; consent, then init)');

for (const where of ['/store/beijing-dumplings', '/store', '/Dashboard', '/Orders', '/Counter', '/KitchenDisplay', '/Settings', '/explore/me', '/chats', '/google-signin', '/delete-account', '/listing']) {
  expectNoPixel(page('https://sellio.sg' + where, { cookie: allowed }), where);
}
passed('no Pixel on storefronts, in the shop workspace, chats or other pages');

expectNoPixel(page('https://sellio.sg/'), 'no choice yet');
expectNoPixel(page('https://sellio.sg/', { cookie: consent(false) }), 'declined');
expectNoPixel(page('https://sellio.sg/', { cookie: consent(true, { age: 2000, life: 1000 }) }), 'expired choice');
expectNoPixel(page('https://sellio.sg/', { cookie: consent(true, { life: 400 * DAY }) }), 'choice kept too long');
expectNoPixel(page('https://sellio.sg/', { cookie: { ...allowed, version: 2 } }), 'other consent version');
expectNoPixel(page('https://sellio.sg/', { cookie: { ...allowed, analytics: 'true' } }), 'analytics not a boolean');
expectNoPixel(page('https://sellio.sg/', { cookie: { ...allowed, updatedAt: Date.now() + 60000, expiresAt: Date.now() + 120000 } }), 'choice from the future');
{
  const cookieJar = new CookieJar();
  cookieJar.setCookieSync('sellio_cookie_consent=%7Bnot-json; Path=/', 'https://sellio.sg/');
  const window = new JSDOM(`<!doctype html><html><head><script>1</script><script>${pixelCode}</script></head></html>`, { url: 'https://sellio.sg/', runScripts: 'dangerously', cookieJar }).window;
  expectNoPixel(window, 'malformed consent cookie');
}
passed('no Pixel without a valid Allow (none yet, declined, expired, malformed)');

expectNoPixel(page('https://sellio.sg/', { cookie: allowed, app: 'android' }), 'Android app');
expectNoPixel(page('https://sellio.sg/Auth?token=cs_live_a1B2', { cookie: allowed, app: 'ios' }), 'iPhone app');
expectNoPixel(page('https://sellio.sg/', { cookie: allowed, base44: true }), "Base44's old app");
for (const host of ['sellio-f1t.pages.dev', 'abc123.sellio-f1t.pages.dev', 'www.sellio.sg', 'sellio.apptelier.sg', 'selliosg.base44.app', 'localhost:5173', 'sellio.sg.example.com']) {
  expectNoPixel(page(`https://${host}/`, { cookie: allowed }), host);
}
passed('no Pixel in the apps or at any address but sellio.sg');

{
  const window = page('https://sellio.sg/');
  expectNoPixel(window, 'before Allow');
  assert.equal(window.__sellioOpenAIPixel(), false, 'no Allow yet: nothing starts');
  assert.equal(window.__sellioOpenAIPixel(true), true, 'Allow pressed: it starts');
  expectPixel(window, 'after Allow');
  assert.equal(window.__sellioOpenAIPixel(true), true, 'Allow again');
  assert.equal(sdkScripts(window).length, 1, 'the SDK is still added once');
  assert.deepEqual(queued(window), [...SET_UP, ['consent', true]], 'a second Allow only switches consent on');
  const store = page('https://sellio.sg/store/beijing-dumplings');
  assert.equal(store.__sellioOpenAIPixel(true), false, 'Allow on a storefront starts nothing');
  expectNoPixel(store, 'storefront after Allow');
}
passed('Allow on the cookie bar starts the Pixel once (window.__sellioOpenAIPixel(true))');

// 2. src/lib/adsPixel.js
const temporary = await mkdtemp(path.join(app, '.openai-pixel-verification-'));
let adsPixel;
let plans;
try {
  const outfile = path.join(temporary, 'adsPixel.mjs');
  await build({ entryPoints: [path.join(app, 'src/lib/adsPixel.js')], outfile, bundle: true, format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, logLevel: 'silent' });
  adsPixel = await import(pathToFileURL(outfile).href);
  const plansFile = path.join(temporary, 'plans.mjs');
  await build({ entryPoints: [path.join(app, 'src/lib/plans.js')], outfile: plansFile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
  plans = await import(pathToFileURL(plansFile).href);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const { isTrialCheckoutLink, noteTrialCheckout, measureTrialStarted, startAdsMeasurement, TRIAL_NOTE } = adsPixel;
const linksOf = (key) => plans.BUSINESS_PLANS.flatMap((plan) => [plan[key].monthly, plan[key].yearly]);
const trialLinks = linksOf('links');
assert.equal(trialLinks.length, 6);
for (const link of trialLinks) {
  assert.ok(isTrialCheckoutLink(link), link);
  assert.ok(isTrialCheckoutLink(`${link}?locked_prefilled_email=a%40b.sg`), `${link} with the locked email`);
}
for (const link of [...linksOf('noTrialLinks'), ...linksOf('shopLinks'), ...linksOf('shopTrialLinks'), 'https://buy.stripe.com/28E28t1Qd5AD9uj2t27bW0q', 'https://sellio.sg/', 'not a link', '']) {
  assert.equal(isTrialCheckoutLink(link), false, link);
}
passed('the six trial links count, with or without the locked email; no-trial, shop and setup links do not');

// A website page: the head script defined __sellioOpenAIPixel and (Allow given) oaiq; calls recorded.
function site(url, { pixel = true, starter = true } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => { if (!/Not implemented: navigation/.test(error?.message)) console.error(error); });
  const window = new JSDOM('<!doctype html><html><body></body></html>', { url, virtualConsole }).window;
  window.calls = [];
  window.starts = [];
  if (starter) window.__sellioOpenAIPixel = (justAllowed) => { window.starts.push(justAllowed); return true; };
  if (pixel) window.oaiq = (...args) => { window.calls.push(plain(args)); };
  window.document.addEventListener('click', (event) => event.preventDefault()); // no navigation in jsdom
  return window;
}
const click = (window, href, type = 'click') => {
  const link = window.document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.innerHTML = '<span>Start Free Trial</span>';
  window.document.body.appendChild(link);
  link.firstChild.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'auxclick' ? 1 : 0 }));
  link.remove();
};
const note = (window) => JSON.parse(window.localStorage.getItem(TRIAL_NOTE) || 'null');
const TRIAL = (id) => ['measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: id }];

{
  const landing = site('https://sellio.sg/');
  assert.equal(startAdsMeasurement(landing), true);
  click(landing, plans.BUSINESS_PLANS[0].noTrialLinks.monthly);
  click(landing, plans.BUSINESS_PLANS[1].shopTrialLinks.yearly);
  assert.equal(note(landing), null, 'no-trial and shop links leave no note');
  const before = Date.now();
  click(landing, plans.BUSINESS_PLANS[1].links.yearly);
  assert.ok(note(landing).at >= before && note(landing).checkout === null, 'a trial link leaves a note');
  landing.localStorage.removeItem(TRIAL_NOTE);
  click(landing, `${plans.BUSINESS_PLANS[2].links.monthly}?locked_prefilled_email=a%40b.sg`, 'auxclick');
  assert.ok(note(landing), 'a middle click on a trial link (the sign-up page adds the email) leaves a note');
  assert.deepEqual(landing.calls, [], 'clicks measure nothing themselves');
  const noPixel = site('https://sellio.sg/', { pixel: false });
  startAdsMeasurement(noPixel);
  click(noPixel, plans.BUSINESS_PLANS[0].links.monthly);
  assert.equal(note(noPixel), null, 'without the Pixel (no Allow) nothing is noted');
}
passed('a trial checkout opened from the website is noted; other links are not, nor without the Pixel');

{
  const at = Date.now() - 60000;
  const back = (url, stored, options) => {
    const window = site(url, options);
    if (stored !== undefined) window.localStorage.setItem(TRIAL_NOTE, typeof stored === 'string' ? stored : JSON.stringify(stored));
    return window;
  };
  let window = back('https://sellio.sg/Auth?token=cs_live_a1B2c3', { at, checkout: null });
  assert.equal(startAdsMeasurement(window), true);
  assert.deepEqual(window.calls, [TRIAL('cs_live_a1B2c3')], 'back from the trial checkout: trial_started, event_id = checkout id');
  assert.deepEqual(note(window), { at, checkout: 'cs_live_a1B2c3' }, 'the note now belongs to that checkout');
  const kept = window.localStorage.getItem(TRIAL_NOTE);
  window = back('https://sellio.sg/Account?token=cs_live_a1B2c3', kept);
  startAdsMeasurement(window);
  assert.deepEqual(window.calls, [TRIAL('cs_live_a1B2c3')], 'signed in, /Account: the same checkout again, same event_id (OpenAI keeps one)');
  window = back('https://sellio.sg/Auth?token=cs_live_OTHER9', kept);
  startAdsMeasurement(window);
  assert.deepEqual(window.calls, [], 'another checkout on the same note is not a trial from the website');
  window = back('https://sellio.sg/auth/?token=cs_test_x9', { at, checkout: null });
  assert.equal(measureTrialStarted(window), true, 'lower case and a trailing slash');

  const none = [
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3', undefined, 'no note: a no-trial link or another browser'],
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3', { at: Date.now() - 25 * 60 * 60 * 1000, checkout: null }, 'a note over a day old'],
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3', { at: Date.now() + 60000, checkout: null }, 'a note from the future'],
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3', '{broken', 'a broken note'],
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3', { checkout: null }, 'a note without a time'],
    ['https://sellio.sg/Auth', { at, checkout: null }, 'no token'],
    ['https://sellio.sg/Auth?token=4f6a2c1e-invite', { at, checkout: null }, 'a token that is not a checkout'],
    ['https://sellio.sg/Auth?token=cs_live_a1B2c3%22x', { at, checkout: null }, 'a malformed checkout id'],
    ['https://sellio.sg/Dashboard?token=cs_live_a1B2c3', { at, checkout: null }, 'another page'],
    ['https://sellio.sg/Join?token=cs_live_a1B2c3', { at, checkout: null }, 'Join is not where checkouts come back'],
  ];
  for (const [url, stored, label] of none) {
    window = back(url, stored);
    startAdsMeasurement(window);
    assert.deepEqual(window.calls, [], label);
  }
  window = back('https://sellio.sg/Auth?token=cs_live_a1B2c3', { at, checkout: null }, { pixel: false });
  assert.equal(startAdsMeasurement(window), true);
  assert.equal(measureTrialStarted(window), false, 'without the Pixel (no Allow) nothing is measured');
  window = back('https://sellio.sg/Auth?token=cs_live_a1B2c3', { at, checkout: null }, { starter: false });
  assert.equal(startAdsMeasurement(window), false, 'the apps (no Pixel script): nothing starts');
  assert.deepEqual(window.calls, [], 'the apps: nothing measured');
}
passed('trial_started only for a noted trial checkout back from Stripe (/Auth or /Account), once per checkout id');

{
  const window = site('https://sellio.sg/', { pixel: false });
  startAdsMeasurement(window);
  const choose = (analytics) => window.dispatchEvent(new window.CustomEvent('sellio:cookie-consent-change', { detail: { version: 1, analytics } }));
  choose(true);
  assert.deepEqual(window.starts, [true], 'Allow starts the Pixel');
  choose(false);
  assert.deepEqual(window.calls, [], 'Decline with no Pixel running: nothing to stop');
  window.oaiq = (...args) => { window.calls.push(plain(args)); };
  choose(false);
  assert.deepEqual(window.calls, [['consent', false]], 'Decline stops a running Pixel (and it removes its cookies)');
  const app = site('https://sellio.sg/', { starter: false });
  startAdsMeasurement(app);
  app.dispatchEvent(new app.CustomEvent('sellio:cookie-consent-change', { detail: { version: 1, analytics: true } }));
  assert.deepEqual(app.starts, [], 'the apps: no listener');
}
passed('the cookie bar: Allow starts the Pixel, Decline stops it');

// 3. The build, when there is one.
const built = await stat(path.join(app, 'dist/index.html')).then(() => true, () => false);
if (built) {
  for (const file of ['dist/index.html', 'dist/privacy/index.html', 'dist/terms/index.html', 'dist/app.html', 'dist/store.html', 'dist/explore.html']) {
    const html = await readFile(path.join(app, file), 'utf8');
    assert.equal((html.match(/<script id="sellio-openai-pixel">/g) || []).length, 1, `${file}: the script once`);
    assert.equal(html.match(SCRIPT)[1], pixelCode, `${file}: the script as written in index.html`);
    assert.ok(html.indexOf('id="sellio-openai-pixel"') < html.indexOf('</head>'), `${file}: in the head`);
  }
  const appIndex = await readFile(path.join(app, 'dist-app/index.html'), 'utf8');
  const appShell = await readFile(path.join(app, 'dist/app.html'), 'utf8');
  assert.equal(appIndex, appShell.replace(/\n[ \t]*<script id="sellio-openai-pixel">[\s\S]*?<\/script>/, ''), "the apps' page is the website's app page minus the Pixel script, nothing else");
  const traces = [];
  const scan = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(full);
      else if (/\.(?:html|js|css|json)$/.test(entry.name)) {
        const text = await readFile(full, 'utf8');
        if (text.includes('bzrcdn.openai.com') || text.includes(PIXEL_ID) || text.includes('sellio-openai-pixel')) traces.push(full);
      }
    }
  };
  await scan(path.join(app, 'dist-app'));
  assert.deepEqual(traces, [], 'dist-app names neither the SDK nor the Pixel ID');
  passed('build: every website page has the script once in the head; the apps carry no Pixel');
} else {
  console.log('SKIP build checks (no dist/: run npm run build first)');
}

console.log(`\n${passes} checks passed`);
