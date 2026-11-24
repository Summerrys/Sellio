// Sellio World's island (public/assets/world/island.html) in real Chrome, framed by a page that
// answers it through the real host (src/world/islandHost.js) and a stand-in server replying as
// Supabase's World functions do after 20261124185818_coins_and_referral_coins.sql (24 Nov 2026):
//   - the awnings: purple and white on Pop-up Street's stalls, orange and white on the businesses;
//   - street coins are worth 1 or 2 (signed out as well);
//   - the day's limit: a coin pays what's left of it; then the day's other coins leave the street
//     with one message, and a shop visit says so and just opens the shop; a visit pays what's left;
//     a session that starts at the limit says so; the server's "daily_limit" is taken as final;
//   - Style your stall shows the server's prices and hides what Sellio has taken off sale (unless
//     it's on the stall);
//   - the help sheet gives the coins' values and the day's limit.
// Run: node verification/island.browser.mjs /tmp/sellio-verification [picture folder]
// (/tmp/sellio-verification has playwright-core, esbuild and three@0.160.0, the version the island
// loads from jsDelivr; Chrome at CHROME_PATH or /usr/bin/google-chrome.)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const app = process.cwd();
const deps = process.argv[2] || '/tmp/sellio-verification';
const require = createRequire(path.join(deps, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const { build } = require('esbuild');
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const shots = process.argv[3] || null;
if (shots) await mkdir(shots, { recursive: true });

const island = await readFile(path.join(app, 'public/assets/world/island.html'));
const three = await readFile(path.join(deps, 'node_modules/three/build/three.module.js'));
const hostJs = (await build({
  entryPoints: [path.join(app, 'src/world/islandHost.js')], bundle: true, format: 'iife', globalName: 'IslandHost', write: false,
})).outputFiles[0].text;

const ORIGIN = 'http://sellio.test';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
// The page that frames the island: the real host, and a server that keeps its own count.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>
<script>${hostJs}</script>
<script>
window.__calls = []; window.__navigated = [];
window.__setup = (cfg) => {
  const S = window.__server = Object.assign({ user: { id: 'u1' }, balance: 10, capLeft: 30, dailyCap: 30, dropMax: 2, visitsLeft: 5,
    visitReward: 2, visited: [], drops: [], street: [], fnb: [], catalog: [], style: { sign: 'wood', lights: 'none', decor: 'none' } }, cfg);
  const profile = () => ({ balance: S.balance, visit_reward: S.visitReward, visits_left: S.visitsLeft, visited_today: S.visited,
    daily_cap: S.dailyCap, today_earned: S.dailyCap - S.capLeft, cap_left: S.capLeft, drop_max: S.dropMax,
    drops: S.capLeft === 0 ? [] : S.drops.filter((d) => !d.claimed) });
  const backend = {
    getUser: async () => S.user,
    getStreet: async () => ({ open: true, preview: false, shops: S.street }),
    getDistrict: async () => ({ shops: S.fnb }),
    session: async () => profile(),
    claimDrop: async (id) => {
      __calls.push(['claimDrop', id]);
      const d = S.drops.find((x) => x.id === id);
      if (!d || d.claimed) return { ok: false, reason: 'already', balance: S.balance };
      if (S.capLeft <= 0) return { ok: false, reason: 'daily_limit', cap_left: 0, balance: S.balance };
      const give = Math.min(d.value, S.capLeft); S.capLeft -= give; S.balance += give; d.claimed = true;
      return { ok: true, value: d.value, credited: give, cap_left: S.capLeft, balance: S.balance, missions: [], unlocked: [] };
    },
    claimVisit: async (tid) => {
      __calls.push(['claimVisit', tid]);
      if (S.visited.includes(tid)) return { ok: false, reason: 'already' };
      if (S.visitsLeft <= 0) return { ok: false, reason: 'daily_cap' };
      if (S.capLeft <= 0) return { ok: false, reason: 'daily_limit' };
      const give = Math.min(S.visitReward, S.capLeft); S.capLeft -= give; S.balance += give; S.visited.push(tid); S.visitsLeft -= 1;
      return { ok: true, value: give, cap_left: S.capLeft, balance: S.balance, missions: [], unlocked: [] };
    },
    myStall: async (tid) => { __calls.push(['myStall', tid]); return { tenant_id: tid, balance: S.balance, stall_level: { level: 1 }, style: { awning: 'sunset', ...S.style }, catalog: S.catalog }; },
    wallet: async () => {
      __calls.push(['wallet']);
      if (S.walletFails) throw Object.assign(new Error('offline'), { hint: 'network' });
      return S.wallet;
    },
    buy: async () => { throw Object.assign(new Error('Not in this test.'), { hint: 'unknown' }); },
    equip: async () => { throw Object.assign(new Error('Not in this test.'), { hint: 'unknown' }); },
  };
  const frame = document.createElement('iframe');
  IslandHost.createIslandHost({ backend, navigate: (url) => __navigated.push(url), leave: () => {}, frame: () => frame.contentWindow,
    toError: (e) => ({ hint: e.hint || 'unknown', message: e.message }) });
  frame.src = '/assets/world/island.html?live=1';
  document.body.appendChild(frame);
};
</script></body></html>`;

const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message || e).split('\n').join('\n     ')}`); }
}

// The island, framed, with the server set up as given. Every message it shows is kept in
// window.__toasts and every "+N" in window.__pops (both are short-lived on screen).
async function open(cfg, viewport = { width: 900, height: 640 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__toasts = []; window.__pops = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('toast')) window.__toasts.push(n.textContent);
        if (n.classList.contains('pop')) window.__pops.push(n.textContent);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === THREE_URL) return route.fulfill({ body: three, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (url.startsWith(`${ORIGIN}/assets/world/island.html`)) return route.fulfill({ body: island, contentType: 'text/html' });
    if (url === `${ORIGIN}/`) return route.fulfill({ body: PAGE, contentType: 'text/html' });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate((c) => window.__setup(c), cfg);
  let frame = null;
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('island.html')); if (!frame) await page.waitForTimeout(100); }
  assert.ok(frame, 'the island frame');
  await frame.waitForFunction(() => window.__popup && window.__popup.stalls && window.__popup.stalls.length > 0, null, { timeout: 60000 });
  // A first visit asks for a hero: start as the first one.
  await frame.evaluate(() => { if (window.__popup.ui.hero.open) document.querySelector('#btnHeroGo').click(); });
  await frame.waitForFunction(() => !window.__popup.ui.hero.open);
  return { page, frame, errors };
}

// Shops on the street (Pop-up) and in the F&B District, as the server lists them.
const shop = (id, slug, name, extra = {}) => ({ tenant_id: id, slug, name, tint: '#2f8f6a', style: { sign: 'wood', lights: 'none', decor: 'none' }, menu: [{ name: 'Kaya jar', price: 6 }], currency: 'SGD', ...extra });
const STREET = [shop('t-me', 'zz-my-home', 'My Home Kitchen', { mine: true }), shop('t-kaya', 'zz-kaya', 'Kaya by Mei')];
const FNB = [shop('t-cafe', 'zz-cafe', 'Zz Cafe')];
// Coins far enough apart that walking onto one doesn't draw in another.
const drop = (id, z, value) => ({ id, x: 0, z, value, night: false });
const CATALOG = [
  ['sign', 'wood', 0], ['sign', 'chalk', 99], ['sign', 'gold', 45],
  ['lights', 'none', 0], ['lights', 'bulbs', 15], ['lights', 'fairy', 20], ['lights', 'lanterns', 25],
  ['decor', 'none', 0], ['decor', 'plants', 8], ['decor', 'bunting', 12], ['decor', 'balloons', 18],
].map(([slot, code, price]) => ({ id: `${slot}:${code}`, slot, code, name: code, rarity: 'common', price, min_stall_level: 1, owned: price === 0, level_locked: false }));

// Walk onto a coin (put the hero on it) and wait for the server's answer.
async function pickUp(frame, dropId) {
  await frame.evaluate((id) => {
    const c = window.__popup.coins.find((x) => x.dropId === id);
    if (!c) throw new Error(`coin ${id} isn't on the street`);
    window.__popup.player.position.set(c.grp.position.x, 0, c.grp.position.z);
  }, dropId);
  // Picked up (the next frames), then answered by the server.
  await frame.waitForFunction((id) => !window.__popup.coins.some((c) => c.dropId === id && c.collecting < 0), dropId, { timeout: 10000 });
  await frame.waitForFunction(() => window.__popup.wallet.pending === 0 && !window.__popup.coins.some((c) => c.collecting >= 0), null, { timeout: 10000 });
  await frame.waitForTimeout(150);
}
const awningOf = (frame, which) => frame.evaluate((key) => {
  const s = window.__popup.stalls.find((x) => x.D.key === key);
  const hex = (p) => `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const found = new Set();
  s.root.traverse((o) => {
    const img = o.material && o.material.map && o.material.map.image;
    if (!img || img.height !== 64 || !img.getContext) return;
    const c = img.getContext('2d');
    found.add(`${hex(c.getImageData(16, 32, 1, 1).data)}/${hex(c.getImageData(48, 32, 1, 1).data)}`);
  });
  return [...found];
}, which);

await check('awnings: purple and white on Pop-up Street, orange and white on every business street', async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, drops: [drop('a1', -4, 1)] }, { width: 1280, height: 800 });
  assert.deepEqual(await awningOf(frame, 'popup'), ['#8b2fc9/#fff8f0']);
  assert.deepEqual(await awningOf(frame, 'fnb'), ['#f97316/#fff8f0']);
  assert.deepEqual(await awningOf(frame, 'retail'), ['#f97316/#fff8f0']);
  assert.deepEqual(await awningOf(frame, 'services'), ['#f97316/#fff8f0']);
  const help = await frame.evaluate(() => document.querySelector('#helpCoins').textContent);
  assert.match(help, /each is worth 1 or 2\./);
  assert.match(help, /up to 30 coins a day in all\./);
  if (shots) {
    for (const key of ['popup', 'fnb']) {
      await frame.evaluate((k) => {
        const p = window.__popup;
        p.hopTo(k);
        const s = p.stalls.find((x) => x.D.key === k && x.def.live);
        p.player.position.set(s.front.x, 0, s.front.z);
      }, key);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(shots, `island-${key}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});

await check('a coin pays what is left of the day, then the rest of the day\'s coins leave the street', async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, balance: 10, capLeft: 3,
    drops: [drop('d1', -4, 2), drop('d2', -12, 2), drop('d3', -20, 1)] });
  await frame.waitForFunction(() => window.__popup.coins.filter((c) => c.dropId).length === 3);
  await pickUp(frame, 'd1');
  let w = await frame.evaluate(() => ({ balance: window.__popup.wallet.balance, capLeft: window.__popup.wallet.capLeft }));
  assert.deepEqual(w, { balance: 12, capLeft: 1 });
  await pickUp(frame, 'd2');
  w = await frame.evaluate(() => ({ balance: window.__popup.wallet.balance, capLeft: window.__popup.wallet.capLeft,
    onStreet: window.__popup.coins.filter((c) => c.dropId).map((c) => c.dropId), toasts: window.__toasts, pops: window.__pops,
    shown: document.querySelector('#coinCount').textContent }));
  assert.equal(w.balance, 13);
  assert.equal(w.capLeft, 0);
  assert.equal(w.shown, '13');
  assert.deepEqual(w.onStreet, [], 'the last coin leaves the street');
  assert.deepEqual(w.pops, ['+2', '+1'], 'the second coin shows what it paid');
  assert.deepEqual(w.toasts.filter((t) => /today's/.test(t)), ["You've collected today's 30 coins. More tomorrow."]);
  const calls = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'claimDrop').map((c) => c[1]));
  assert.deepEqual(calls, ['d1', 'd2'], 'the server is never asked for the third');

  // A shop visit now: the sheet says so, and the shop just opens.
  await frame.evaluate(() => window.__popup.openStall(window.__popup.stalls.find((s) => s.def.tenant_id === 't-cafe')));
  assert.equal(await frame.evaluate(() => document.querySelector('#stallRewardText').textContent),
    "You've collected today's coins. Visits earn coins again tomorrow");
  await frame.click('#btnVisit');
  await page.waitForFunction(() => window.__navigated.length > 0);
  assert.deepEqual(await page.evaluate(() => ({ nav: window.__navigated, visits: window.__calls.filter((c) => c[0] === 'claimVisit') })),
    { nav: ['/store/zz-cafe'], visits: [] });
  assert.deepEqual(errors, []);
  await page.close();
});

await check('a shop visit pays what is left of the day, and says so', async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, balance: 5, capLeft: 1, drops: [drop('v1', -6, 2)] });
  await frame.evaluate(() => window.__popup.openStall(window.__popup.stalls.find((s) => s.def.tenant_id === 't-cafe')));
  assert.equal(await frame.evaluate(() => document.querySelector('#stallRewardText').textContent), 'Visit today to earn +1 coin');
  await frame.click('#btnVisit');
  await page.waitForFunction(() => window.__navigated.length > 0);
  const r = await frame.evaluate(() => ({ balance: window.__popup.wallet.balance, capLeft: window.__popup.wallet.capLeft, toasts: window.__toasts,
    onStreet: window.__popup.coins.filter((c) => c.dropId).length }));
  assert.equal(r.balance, 6);
  assert.equal(r.capLeft, 0);
  assert.deepEqual(r.toasts, ["+1 coin for today's visit.", "You've collected today's 30 coins. More tomorrow."]);
  assert.equal(r.onStreet, 0, "the day's coins leave the street");
  assert.deepEqual(errors, []);
  await page.close();
});

await check('a session that starts at the limit: no coins on the street, and it says why', async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, capLeft: 0, drops: [drop('z1', -6, 2)] });
  await frame.waitForFunction(() => window.__toasts.length > 0, null, { timeout: 5000 });
  const r = await frame.evaluate(() => ({ toasts: window.__toasts, onStreet: window.__popup.coins.filter((c) => c.dropId).length }));
  assert.deepEqual(r, { toasts: ["You've collected today's 30 coins. More tomorrow."], onStreet: 0 });
  assert.deepEqual(errors, []);
  await page.close();
});

await check("the server's daily_limit (the day used up elsewhere) is final", async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, balance: 40, capLeft: 30,
    drops: [drop('e1', -4, 2), drop('e2', -12, 1), drop('e3', -20, 2)] });
  await frame.waitForFunction(() => window.__popup.coins.filter((c) => c.dropId).length === 3);
  await page.evaluate(() => { window.__server.capLeft = 0; });
  await pickUp(frame, 'e1');
  const r = await frame.evaluate(() => ({ balance: window.__popup.wallet.balance, capLeft: window.__popup.wallet.capLeft,
    onStreet: window.__popup.coins.filter((c) => c.dropId).length, toasts: window.__toasts.filter((t) => /today's/.test(t)) }));
  assert.deepEqual(r, { balance: 40, capLeft: 0, onStreet: 0, toasts: ["You've collected today's 30 coins. More tomorrow."] });
  assert.deepEqual(errors, []);
  await page.close();
});

await check('signed out: the street shows coins worth 1 or 2', async () => {
  const { page, frame, errors } = await open({ user: null, street: STREET, fnb: FNB });
  const values = await frame.evaluate(() => window.__popup.coins.filter((c) => c.guest).map((c) => c.value));
  assert.equal(values.length, 15);
  assert.ok(values.every((v) => v === 1 || v === 2), values.join(','));
  assert.ok(values.includes(1) && values.includes(2), values.join(','));
  assert.deepEqual(errors, []);
  await page.close();
});

await check("Style your stall: the server's prices, and nothing Sellio has taken off sale", async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, catalog: CATALOG });
  const items = async () => {
    await frame.evaluate(() => window.__popup.openStyle());
    await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'myStall'));
    await frame.waitForTimeout(300);
    return frame.evaluate(() => [...document.querySelectorAll('#itemGrid .item')].map((b) => `${b.dataset.id} ${b.querySelector('.meta').textContent}`));
  };
  assert.deepEqual(await items(), ['wood Equipped', 'chalk 99 coins', 'gold 45 coins']);
  await page.close();
  // Off sale but on this stall: it stays, as equipped.
  const again = await open({ street: STREET, fnb: FNB, catalog: CATALOG, style: { sign: 'neon', lights: 'none', decor: 'none' } });
  await again.frame.evaluate(() => window.__popup.openStyle());
  await again.page.waitForFunction(() => window.__calls.some((c) => c[0] === 'myStall'));
  await again.frame.waitForTimeout(300);
  const ids = await again.frame.evaluate(() => [...document.querySelectorAll('#itemGrid .item')].map((b) => `${b.dataset.id} ${b.querySelector('.meta').textContent}`));
  assert.deepEqual(ids, ['wood Owned · tap to use', 'chalk 99 coins', 'neon Equipped', 'gold 45 coins']);
  assert.deepEqual([...errors, ...again.errors], []);
  await again.page.close();
});

// The wallet sheet (25 Nov 2026): the coin chip opens it for a signed-in person, with the last three coins in and out.
const now = new Date().toISOString();
const WALLET = {
  balance: 10, earned: 40, spent: 30,
  today: { earned: 4, cap: 30, left: 26, drops: 2, visits: 2 },
  history: [
    { at: now, delta: 2, reason: 'visit', shop: '<img src=x onerror="window.__xss=1">Kaya & Co' },
    { at: now, delta: -30, reason: 'cosmetic', item: 'Neon Sign' },
    { at: now, delta: 50, reason: 'referral', kind: 'free' },
    { at: now, delta: 1, reason: 'drop' },
  ],
};
const walletSheet = (frame) => frame.evaluate(() => ({
  open: window.__popup.ui.wallet.open,
  balance: document.querySelector('#walletBalance').textContent,
  today: document.querySelector('#walletToday').hidden ? null : `${document.querySelector('#walletTodayText').textContent} | ${document.querySelector('#walletTodaySplit').textContent}`,
  lines: [...document.querySelectorAll('#walletList li')].map((li) => li.classList.contains('empty') ? li.textContent
    : `${li.querySelector('.what span').textContent} ${li.querySelector('b').textContent}`),
  injected: !!document.querySelector('#walletList img') || !!window.__xss,
  style: !document.querySelector('#btnWalletStyle').hidden,
}));

await check('signed in: the coin chip opens the wallet, with the last three coins in and out', async () => {
  const { page, frame, errors } = await open({ street: STREET, fnb: FNB, capLeft: 26, wallet: WALLET }, shots ? { width: 390, height: 780 } : undefined);
  assert.equal(await frame.evaluate(() => document.querySelector('#coinChip').getAttribute('role')), 'button');
  await frame.click('#coinChip');
  await page.waitForFunction(() => window.__calls.some((c) => c[0] === 'wallet'));
  await frame.waitForFunction(() => document.querySelectorAll('#walletList li:not(.empty)').length > 0);
  const w = await walletSheet(frame);
  assert.equal(w.open, true);
  assert.equal(w.balance, '10');
  assert.equal(w.today, '4 of 30 | Street coins 2 · Shop visits 2 · starts again at midnight');
  assert.deepEqual(w.lines, ['Visit: <img src=x onerror="window.__xss=1">Kaya & Co +2', 'Stall item: Neon Sign −30', 'A seller you invited listed their first item +50']);
  assert.equal(w.injected, false, 'a shop name goes in as text');
  assert.equal(w.style, true, 'Style my stall, for someone with a stall');
  if (shots) { await frame.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'island-wallet.png') }); }
  await frame.click('#btnWalletOpen');
  await page.waitForFunction(() => window.__navigated.includes('/wallet'));
  await frame.press('#btnWalletOpen', 'Escape');
  await frame.waitForFunction(() => !window.__popup.ui.wallet.open);
  // From the keyboard too.
  await frame.focus('#coinChip'); await frame.press('#coinChip', 'Enter');
  await frame.waitForFunction(() => window.__popup.ui.wallet.open);
  assert.deepEqual(errors, []);
  await page.close();
});

await check("the wallet sheet says so when its coins can't load, and a guest's chip still asks them to sign in", async () => {
  const { page, frame, errors } = await open({ street: STREET.filter((x) => !x.mine), fnb: FNB, walletFails: true });
  await frame.click('#coinChip');
  await frame.waitForFunction(() => /couldn’t load/.test(document.querySelector('#walletList').textContent));
  const w = await walletSheet(frame);
  assert.equal(w.today, '0 of 30 | Starts again at midnight');
  assert.equal(w.style, false, 'no Style my stall without a stall');
  await page.close();
  const guest = await open({ user: null, street: STREET, fnb: FNB });
  await guest.frame.click('#coinChip');
  await guest.page.waitForFunction(() => window.__navigated.length > 0);
  assert.equal(await guest.frame.evaluate(() => window.__popup.ui.wallet.open), false);
  assert.equal(await guest.page.evaluate(() => window.__calls.some((c) => c[0] === 'wallet')), false);
  assert.deepEqual([...errors, ...guest.errors], []);
  await guest.page.close();
});

await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');
