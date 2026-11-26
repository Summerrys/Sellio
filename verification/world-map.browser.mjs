// Sellio World, the map version (src/world/WorldGame.jsx: the game at /World since 26 Nov 2026), in
// real Chrome with a stand-in server (verification/world-map/). What it checks:
//   - desktop: all four districts can be entered; choosing a hero the first time in, changing it
//     later, and the choice kept on this device; heroes have no hair or hat; every stall wears the
//     same purple and white awning and every shop unit the orange and white one; stall styling is
//     signboard, lights and decor; coins, shop visits and storefronts; "Open for lease!" units on
//     the F&B boulevard, Retail Avenue and Services Garden; dragging pans and the right mouse
//     button turns the view all the way round;
//   - a phone, by touch: one finger pans, two fingers twist the view all the way round, pinch
//     zooms, two fingers up or down tilt; tap to walk; the hero picker and the lease sheet;
//   - the day's limit on street coins and shop visits (as the server answers since 24 Nov 2026):
//     at the limit the rest of the day's coins leave the street with one message, a shop says
//     visits earn again tomorrow, and Today's rewards show it.
// Run: node verification/world-map.browser.mjs /tmp/sellio-verification [picture folder]
// (/tmp/sellio-verification has playwright or playwright-core, and esbuild; Chrome at CHROME_PATH
// or /usr/bin/google-chrome. Software rendering is slow: allow about ten minutes.)
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
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

/* the page: the real game and the stand-in server, bundled */
const out = await mkdtemp(path.join(os.tmpdir(), 'sellio-world-map-'));
await build({
  entryPoints: [path.join(app, 'verification/world-map/main.jsx')], bundle: true, outdir: out, format: 'iife', target: ['es2020'],
  jsx: 'automatic', loader: { '.js': 'jsx' }, nodePaths: [path.join(app, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning',
});
await writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="main.css"><style>html,body{margin:0;height:100%;background:#cfe7f7}</style></head><body><div id="root"></div><script src="main.js"></script></body></html>');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  const file = path.join(out, path.basename(new URL(req.url, 'http://x').pathname) || 'index.html');
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
async function open(url, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('error: ' + m.text()); });
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(base + url);
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 });
  return { page, errors, ctx };
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.pw-dcard') && !document.querySelector('.pw-dcard:disabled'), null, { timeout: 180000 });
  await page.evaluate(() => window.__world.debug.setFast(true)); // real time, not slow motion, on software rendering
}
// (A screenshot resizes an emulated phone's page, and a resize cuts a gesture short: none are taken around the gesture steps.)
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name.endsWith('.png') ? name : `${name}.png`) }); };
const clean = (errors) => errors.filter((e) => !/fonts\.googleapis|ERR_TUNNEL|favicon/.test(e));

/* ---------------------------------------------------------------- desktop */
console.log('desktop');
{
const { page, errors, ctx } = await open('/index.html?mode=open&fresh=1&time=day', { viewport: { width: 1280, height: 800 } });
const W = (fn, arg) => page.evaluate(fn, arg);
const toasts = () => W(() => [...document.querySelectorAll('.pw-toast')].map((t) => t.textContent));
const server_ = () => W(() => JSON.parse(localStorage.getItem('sellio-world-demo-v2') || '{}'));
const balance = () => W(() => Number(document.querySelector('.pw-coins .pw-num span:last-child')?.textContent || NaN));
const settled = () => page.waitForFunction(() => window.__world.started && !window.__world.debug.avatar.busy, null, { timeout: 90000 });
const hop = async (name, key) => {
  await page.click('.pw-hud .pw-chip >> nth=0');
  await page.waitForSelector('.pw-sheet.open #pw-hop-title');
  await page.locator('.pw-sheet.open .pw-hops li', { hasText: name }).locator('button').click();
  await page.waitForFunction((k) => window.__world.district === k && !window.__world.debug.avatar.busy, key, { timeout: 90000 });
  await sleep(1800);
};
const pixels = (mat) => W((which) => {
  const w = window.__world; let m;
  if (which === 'stall') m = [...w.debug.popup.stalls.values()][0].slots.awning.children[0].children[0].material;
  else if (which === 'shop') m = [...w.debug.storefronts.values()][0].near.children.find((c) => c.geometry?.type === 'BoxGeometry').material;
  else m = w.debug.leaseUnits[0].near.children.find((c) => c.geometry?.type === 'BoxGeometry').material;
  const c = m.map.image.getContext('2d'); const hex = (x) => '#' + [...c.getImageData(x, 20, 1, 1).data].slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  return [hex(16), hex(48)];
}, mat);
await ready(page);
check(await W(() => document.querySelectorAll('.pw-dcard').length) === 4, 'the welcome screen shows four districts');
check(await W(() => [...document.querySelectorAll('.pw-dcard')].every((c) => /Enter/.test(c.textContent) && !c.classList.contains('soon'))), 'all four districts can be entered (none is "coming soon")', await W(() => [...document.querySelectorAll('.pw-dcard')].map((c) => c.textContent)));
check(await W(() => document.querySelectorAll('.pw-dl').length) === 5, 'the map shows five place labels');
const hubCalls = await W(() => window.__world.debug.renderer.info.render.calls);

/* Pop-up Street: enter, choose a hero */
await page.click('.pw-dcard >> nth=1');
await page.waitForSelector('.pw-sheet.open #pw-hero-title', { timeout: 90000 });
check(true, 'the first time in, the player is asked to choose a hero');
check(await W(() => document.querySelectorAll('.pw-hero').length) === 7, 'seven heroes to choose from');
check(await W(() => window.__world.character) === 'mochi', 'Mochi is the hero until one is chosen');
await page.locator('.pw-hero', { hasText: 'Kai' }).click(); await sleep(600);
check(await W(() => window.__world.character) === 'kai', 'tapping a hero puts them in the world');
check((await page.textContent('.pw-sheet.open .pw-actions .pw-primary')).trim() === 'Start exploring as Kai', 'the button names the hero');
await page.click('.pw-sheet.open .pw-actions .pw-primary'); await sleep(1500);
check(await W(() => !document.querySelector('.pw-sheet.open') && localStorage.getItem('sellio-world-hero')) === 'kai', 'choosing a hero closes the picker and is remembered');
await settled();
check(await W(() => window.__world.district) === 'popup', 'entering Pop-up Street puts the hero there', await W(() => window.__world.getPlayer()));

/* awnings: one look for every stall */
const stallAwnings = await W(() => [...window.__world.debug.popup.stalls.values()].map((s) => { const g = s.slots.awning.children[0]; return g.children.map((c) => c.material.uuid).join('+') + '|' + g.children.length; }));
check(stallAwnings.length === 12 && new Set(stallAwnings).size === 1, `all ${stallAwnings.length} stalls wear the same awning`, [...new Set(stallAwnings)]);
check(JSON.stringify(await pixels('stall')) === JSON.stringify(['#8b2fc9', '#fff8f0']), 'stall awnings are purple and white stripes', await pixels('stall'));

/* coins */
await page.waitForFunction(() => window.__world.coinCount() > 0, null, { timeout: 30000 });
const start = await balance();
const before = await W(() => Object.fromEntries([...window.__world.debug.popup.coins.coins.values()].filter((c) => c.state === 'idle').map((c) => [c.id, c.value])));
for (let k = 0; k < 3; k++) {
  const target = await W(() => {
    const w = window.__world, p = w.getPlayer(), pop = w.debug.popup, local = pop.toLocal(p.x, p.y);
    const c = [...pop.coins.coins.values()].filter((x) => x.state === 'idle').sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z))[0];
    if (!c) return null;
    const m = pop.toMap(c.x, c.z); w.debug.walkTo(m.x, m.y); return { id: c.id };
  });
  if (!target) break;
  await page.waitForFunction((id) => !window.__world.debug.popup.coins.coins.has(id) || window.__world.debug.popup.coins.coins.get(id).state !== 'idle', target.id, { timeout: 60000 });
  await sleep(400);
}
await sleep(3000);
const left = await W(() => [...window.__world.debug.popup.coins.coins.values()].filter((c) => c.state === 'idle').map((c) => c.id));
const picked = Object.keys(before).filter((id) => !left.includes(id));
let st = await server_();
check(picked.length >= 3 && picked.every((id) => st.refs[`drop:${id}`]), `every coin the hero walked over reached the server (${picked.length} coins)`, { picked });
check(await balance() === st.wallet.balance && st.wallet.balance > start, `the coin counter matches the server (${start} -> ${st.wallet.balance})`);
check(!(await toasts()).some((t) => /Slow down|Walk to the coin/.test(t)), 'no pickups refused by the anti-cheat rules', await toasts());

/* a stall: tap, visit */
const stallPt = await W(() => { const w = window.__world, pop = w.debug.popup, s = [...pop.stalls.values()].find((x) => !x.shop.mine); const m = pop.toMap(s.center.x, s.center.z); return w.screenPoint(m.x, m.y, 1.5); });
await page.mouse.click(stallPt.x, stallPt.y);
await page.waitForSelector('.pw-sheet.open #pw-stall-name', { timeout: 90000 });
check(true, 'tapping a stall walks over and opens it');
await sleep(1500);
const b1 = await balance();
await page.click('.pw-sheet.open .pw-actions .pw-primary');
await page.waitForFunction(() => [...document.querySelectorAll('.pw-toast')].some((t) => /visit to/.test(t.textContent)), null, { timeout: 20000 }).catch(() => {});
check((await toasts()).some((t) => /\+2 coins for today's visit/.test(t)), 'visiting a stall pays +2', await toasts());
await sleep(1500);
st = await server_();
check(await balance() === st.wallet.balance && st.wallet.balance >= b1 + 2, `balance shows the visit reward (${b1} -> ${st.wallet.balance})`);
await page.click('.pw-sheet.open [data-close]').catch(() => {});
await sleep(800);

/* styling: signboard, lights and decor only */
await page.click('.pw-dock .pw-primary');
await page.waitForSelector('.pw-sheet.open #pw-style-title');
await page.waitForSelector('.pw-sheet.open .pw-item', { timeout: 20000 });
const tabs = await W(() => [...document.querySelectorAll('.pw-sheet.open .pw-tab')].map((t) => t.textContent));
check(JSON.stringify(tabs) === JSON.stringify(['Signboard', 'Lights', 'Decor']), 'stall styling offers signboard, lights and decor (no awnings)', tabs);
await page.locator('.pw-sheet.open .pw-item', { hasText: 'Chalkboard' }).click(); await sleep(500);
await page.click('.pw-sheet.open .pw-buybar .pw-primary');
await page.waitForFunction(() => [...document.querySelectorAll('.pw-toast')].some((t) => /Unlocked Chalkboard/.test(t.textContent)), null, { timeout: 20000 }).catch(() => {});
check((await toasts()).some((t) => /Unlocked Chalkboard/.test(t)), 'a signboard can still be unlocked with coins', await toasts());
const mineAwning = await W(() => { const w = window.__world, s = [...w.debug.popup.stalls.values()].find((x) => x.shop.mine); return [s.style.sign, s.slots.awning.children[0].children[0].material.uuid]; });
check(mineAwning[0] === 'chalk' && stallAwnings[0].startsWith(mineAwning[1]), 'the new signboard is on the stall, under the same awning', mineAwning);
await page.click('.pw-sheet.open [data-close]'); await sleep(1200);

/* F&B District */
await hop('F&B District', 'fnb');
check(await W(() => window.__world.debug.storefronts.size) === 8, 'eight example storefronts stand on the boulevard');
check(JSON.stringify(await pixels('shop')) === JSON.stringify(['#f97316', '#fff8f0']), 'shop awnings are orange and white stripes', await pixels('shop'));
check(JSON.stringify(await pixels('lease')) === JSON.stringify(['#f97316', '#fff8f0']), 'vacant units wear the same orange and white awning', await pixels('lease'));
const sp = await W(() => { const w = window.__world, s = [...w.debug.storefronts.values()][1]; return w.screenPoint(s.plot.x, s.plot.front + s.plot.side * 0.3, 3); });
await page.mouse.click(sp.x, sp.y);
await page.waitForSelector('.pw-sheet.open #pw-store-name', { timeout: 90000 });
check(true, 'tapping a storefront walks to its door and opens it');
const storeName = await page.textContent('#pw-store-name');
await page.waitForFunction(() => !window.__world.map.isEasing(), null, { timeout: 30000 }); await sleep(1500);
const hidden = await W(() => [...window.__world.debug.storefronts.values(), ...window.__world.debug.leaseUnits].filter((s) => !s.root.visible).length);
check(hidden >= 1, `the row between the camera and the shop is cut away (${hidden} hidden)`);
await page.click('.pw-sheet.open .pw-actions .pw-primary');
await page.waitForFunction(() => [...document.querySelectorAll('.pw-toast')].some((t) => /visit to/.test(t.textContent)), null, { timeout: 20000 }).catch(() => {});
check((await toasts()).some((t) => t.includes(`visit to ${storeName.trim()}`)), `stepping inside ${storeName.trim()} pays the visit reward`, await toasts());
await page.click('.pw-sheet.open [data-close]'); await sleep(1200);
const fnbLease = await W(() => window.__world.debug.leaseUnits.filter((u) => u.lease.district === 'fnb').length);
check(fnbLease === 5, `five "Open for lease!" units follow the last café (${fnbLease})`);
await W(() => { const u = window.__world.debug.leaseUnits.find((x) => x.lease.district === 'fnb'); window.__world.walkToLease('fnb', u.lease.index); });
await page.waitForSelector('.pw-sheet.open #pw-lease-title', { timeout: 120000 });
check(/^F&B District · Unit \d+$/.test((await page.textContent('.pw-sheet.open .pw-sub')).trim()), 'a vacant F&B unit opens the lease sheet', await page.textContent('.pw-sheet.open .pw-sub'));
await page.click('.pw-sheet.open [data-close]'); await sleep(1000);

/* Retail Avenue and Services Garden */
for (const [name, key, cta] of [['Retail Avenue', 'retail', 'Bring my shop to Sellio'], ['Services Garden', 'services', 'Bring my business to Sellio']]) {
  await hop(name, key);
  check(true, `Sellio Hop goes to ${name}`);
  const n = await W((k) => window.__world.debug.leaseUnits.filter((u) => u.lease.district === k).length, key);
  check(n === 12, `${name} has twelve units (${n})`);
  const pt = await W((k) => { const w = window.__world, u = w.debug.leaseUnits.find((o) => o.lease.district === k && o.lease.index === 2); return w.screenPoint(u.plot.x, u.plot.front + u.plot.side * 0.3, 3); }, key);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('.pw-sheet.open #pw-lease-title', { timeout: 120000 });
  check((await page.textContent('#pw-lease-title')).trim() === 'Open for lease!' && (await page.textContent('.pw-sheet.open .pw-sub')).trim() === `${name} · Unit 3`, `tapping a unit on ${name} walks to its door and says "Open for lease!"`, await page.textContent('.pw-sheet.open .pw-sub'));
  check((await page.textContent('.pw-sheet.open .pw-actions .pw-primary')).trim() === cta, `its button reads "${cta}"`);
  if (key === 'retail') {
    await page.click('.pw-sheet.open .pw-actions .pw-primary'); await sleep(300);
    // (the stand-in backend has no plans page: the game says where the button leads; the live backend's link is checked in the build)
    check((await W(() => window.__navigations)).includes('/#pricing') || (await toasts()).some((t) => /this opens Sellio plans for shops/.test(t)), 'the button leads to Sellio plans', [await W(() => window.__navigations), await toasts()]);
  }
  await page.click('.pw-sheet.open [data-close]'); await sleep(1200);
  check(await W(() => window.__world.debug.nav.walkable(window.__world.getPlayer().x, window.__world.getPlayer().y)), `the hero stands on walkable ground on ${name}`);
}

/* keys */
const p0 = await W(() => window.__world.getPlayer());
await page.keyboard.down('ArrowDown'); await sleep(2500); await page.keyboard.up('ArrowDown');
const p1 = await W(() => window.__world.getPlayer());
check(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1, 'arrow keys walk the hero', { p0, p1 });

/* looking around with a mouse: drag pans, right-drag turns all the way round */
await sleep(600);
const c0 = await W(() => window.__world.map.getCenter().toArray());
await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(520, 330, { steps: 4 }); await page.mouse.move(400, 360, { steps: 4 }); await page.mouse.up();
await sleep(800);
const c1 = await W(() => window.__world.map.getCenter().toArray());
check(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 1e-6, 'dragging pans the map');
check(await W(() => !window.__world.following), 'dragging the map stops following the hero');
let turned = 0, last = await W(() => window.__world.map.getBearing());
const seen = new Set();
for (let k = 0; k < 8 && turned < 400; k++) {
  await page.mouse.move(300, 420); await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(300 + i * 55, 420);
    const b = await W(() => window.__world.map.getBearing());
    let d = b - last; if (d > 180) d -= 360; if (d < -180) d += 360;
    turned += d; last = b; seen.add(Math.floor(((b % 360) + 360) % 360 / 45));
  }
  await page.mouse.up({ button: 'right' }); await sleep(250);
}
check(Math.abs(turned) >= 360 && seen.size === 8, `dragging with the right mouse button turns the view all the way round (${Math.round(Math.abs(turned))}°, every direction seen)`, { turned, seen: [...seen] });
await page.click('.pw-dock .pw-round >> nth=0'); await sleep(900);
check(await W(() => window.__world.following), 'the follow button finds the hero again');
check((await page.getAttribute('.pw-dock .pw-round >> nth=0', 'aria-label')) === 'The camera is following Kai', 'the follow button names the hero', await page.getAttribute('.pw-dock .pw-round >> nth=0', 'aria-label'));

/* changing hero */
await page.click('.pw-hero-btn');
await page.waitForSelector('.pw-sheet.open #pw-hero-title');
await page.locator('.pw-hero', { hasText: 'Mochi' }).click(); await sleep(500);
check(await W(() => window.__world.character) === 'mochi', 'trying another hero swaps them in the world');
await page.click('.pw-sheet.open [data-close]'); await sleep(900);
check(await W(() => window.__world.character) === 'kai' && await W(() => localStorage.getItem('sellio-world-hero')) === 'kai', 'closing the picker without choosing keeps the hero you had');
await page.click('.pw-hero-btn');
await page.waitForSelector('.pw-sheet.open #pw-hero-title');
await page.locator('.pw-hero', { hasText: 'Mei' }).click(); await sleep(400);
check((await page.textContent('.pw-sheet.open .pw-actions .pw-primary')).trim() === 'Switch to Mei', 'the button offers the switch');
await page.click('.pw-sheet.open .pw-actions .pw-primary'); await sleep(1200);
check(await W(() => window.__world.character) === 'mei' && await W(() => localStorage.getItem('sellio-world-hero')) === 'mei', 'switching hero is remembered');
const noHair = await W(() => { let n = 0; window.__world.debug.avatar.root.traverse((o) => { if (/hair|hat/i.test(o.name || '')) n++; }); return n; });
check(noHair === 0, 'heroes have no hair or hat');

/* back to the whole island, then the evening look */
await page.click('.pw-hud .pw-chip >> nth=0');
await page.click('.pw-sheet.open .pw-actions .pw-ghost'); await sleep(800);
check(await W(() => !document.querySelector('.pw-hub').classList.contains('gone') && !window.__world.started), '"See the whole island" goes back to the welcome screen');
await page.click('.pw-dcard >> nth=2'); await settled(); await sleep(2500);
check(await W(() => window.__world.district) === 'retail' && await W(() => !document.querySelector('.pw-sheet.open')), 'Retail Avenue can be entered from the welcome screen, and the hero is not asked for again');
const streetCalls = await W(() => window.__world.debug.renderer.info.render.calls);
await page.click('.pw-dock .pw-round >> nth=1');
await page.waitForSelector('.pw-sheet.open #pw-help-title');
check(/Playing as Mei/.test(await page.textContent('.pw-sheet.open .pw-settings')), 'settings show the hero, with a Change button');
await page.click('.pw-seg button:has-text("Evening")'); await sleep(500);
check(await W(() => window.__world.theme) === 'dusk', 'the evening look can be chosen');
await page.click('.pw-sheet.open [data-close]'); await sleep(1500);
await shot(page, 'desktop-e2e-retail-dusk.png');
check(hubCalls < 700 && streetCalls < 500, `draw calls stay modest (whole island ${hubCalls}, on a street ${streetCalls})`);

/* coming back: the hero is remembered */
await page.goto(`${base}/index.html?mode=open&time=day`); await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 }); await ready(page);
await page.click('.pw-dcard >> nth=3'); await settled(); await sleep(1500);
check(await W(() => window.__world.character) === 'mei' && await W(() => !document.querySelector('.pw-sheet.open')) && await W(() => window.__world.district) === 'services', 'coming back later: the same hero, straight into Services Garden');

check(clean(errors).length === 0, 'no errors in the console', clean(errors));
await ctx.close();
}

/* ---------------------------------------------------------------- a phone, by touch */
console.log('a phone, by touch');
{
const { page, errors, ctx } = await open('/index.html?mode=open&fresh=1&time=day', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const W = (fn, arg) => page.evaluate(fn, arg);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
await ready(page);
check(await W(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling on a phone');
await shot(page, 'phone-hub.png');

await page.tap('.pw-dcard >> nth=1');
await page.waitForSelector('.pw-sheet.open #pw-hero-title', { timeout: 90000 });
await sleep(2500);
await shot(page, 'phone-hero.png');
const heroBox = await W(() => { const s = document.querySelector('.pw-sheet.open').getBoundingClientRect(), w = window.__world, p = w.getPlayer(), sp = w.screenPoint(p.x, p.y, 1.2); return { top: s.top, heroY: sp.y, h: innerHeight }; });
check(heroBox.heroY < heroBox.top - 20, `the hero stands in view above the picker (hero at ${Math.round(heroBox.heroY)}px, sheet from ${Math.round(heroBox.top)}px)`, heroBox);
await page.locator('.pw-hero', { hasText: 'Arjun' }).tap(); await sleep(1500);
check(await W(() => window.__world.character) === 'arjun', 'tapping a hero on a phone swaps them in');
await shot(page, 'phone-hero-arjun.png');
await page.tap('.pw-sheet.open .pw-actions .pw-primary'); await sleep(1500);
await page.waitForFunction(() => window.__world.started && !window.__world.debug.avatar.busy && !window.__world.map.isMoving(), null, { timeout: 60000 });
await sleep(800);

const btn = await W(() => { const b = document.querySelector('.pw-hero-btn').getBoundingClientRect(), d = [...document.querySelectorAll('.pw-dock > *')].map((e) => e.getBoundingClientRect()), h = document.querySelector('.pw-hint')?.getBoundingClientRect(); return { b: [b.left, b.top, b.right, b.bottom], overlap: d.some((r) => !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom)), inView: b.left >= 0 && b.bottom <= innerHeight }; });
check(btn.inView && !btn.overlap, 'the hero button sits above the dock without covering it', btn);

/* one finger: pan */
const c0 = await W(() => window.__world.map.getCenter().toArray()), b0 = await W(() => window.__world.map.getBearing());
await touch('touchStart', [[195, 380]]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [[195 + i * 14, 380 + i * 6]]);
await touch('touchEnd', []); await sleep(900);
const c1 = await W(() => window.__world.map.getCenter().toArray());
const b1 = await W(() => window.__world.map.getBearing());
check(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 1e-6 && Math.abs(b1 - b0) < 0.5, 'one finger drags the map (pans, without turning)', { c0, c1, b0, b1 });

/* two fingers: twist all the way round */
let turned = 0, last = await W(() => window.__world.map.getBearing()); const seen = new Set();
const cx = 195, cy = 400, r = 120;
const at = (a) => [[cx + Math.cos(a) * r, cy + Math.sin(a) * r], [cx - Math.cos(a) * r, cy - Math.sin(a) * r]];
await touch('touchStart', at(0));
for (let i = 1; i <= 80; i++) {
  await touch('touchMove', at(i * Math.PI / 20)); // 9° a step, four full half-turns: 720° of finger twist
  if (i % 2 === 0) {
    const b = await W(() => window.__world.map.getBearing());
    let d = b - last; if (d > 180) d -= 360; if (d < -180) d += 360;
    turned += d; last = b; seen.add(Math.floor(((b % 360) + 360) % 360 / 45));
  }
}
await touch('touchEnd', []); await sleep(900);
check(Math.abs(turned) >= 360 && seen.size === 8, `twisting two fingers turns the view all the way round (${Math.round(Math.abs(turned))}°, every direction seen)`, { turned, seen: [...seen] });


/* pinch: zoom */
const z0 = await W(() => window.__world.map.getZoom());
await touch('touchStart', [[150, 400], [240, 400]]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 8, 400], [240 + i * 8, 400]]);
await touch('touchEnd', []); await sleep(900);
const z1 = await W(() => window.__world.map.getZoom());
check(z1 > z0 + 0.3, `pinching zooms in (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);

/* two fingers up and down: tilt */
const pt0 = await W(() => window.__world.map.getPitch());
await touch('touchStart', [[160, 500], [230, 500]]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [[160, 500 - i * 12], [230, 500 - i * 12]]);
await touch('touchEnd', []); await sleep(900);
const pt1 = await W(() => window.__world.map.getPitch());
check(Math.abs(pt1 - pt0) > 2, `two fingers up or down tilt the view (${pt0.toFixed(0)}° -> ${pt1.toFixed(0)}°)`);

/* tap to walk still works after looking around */
await page.tap('.pw-dock .pw-round >> nth=0'); await sleep(1200);
check(await W(() => window.__world.following), 'the follow button finds the hero again');
const p0 = await W(() => window.__world.getPlayer());
await page.touchscreen.tap(195, 300); // open ground a little ahead of the hero
await sleep(3500);
const p1 = await W(() => window.__world.getPlayer());
check(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 2, 'tapping the ground walks the hero there', { p0, p1 });

/* Retail Avenue on a phone */
await page.tap('.pw-hud .pw-chip >> nth=0');
await page.waitForSelector('.pw-sheet.open #pw-hop-title'); await sleep(500);
await shot(page, 'phone-hop.png');
await page.locator('.pw-sheet.open .pw-hops li', { hasText: 'Retail Avenue' }).locator('button').tap();
await page.waitForFunction(() => window.__world.district === 'retail' && !window.__world.debug.avatar.busy, null, { timeout: 90000 });
await sleep(2500); await shot(page, 'phone-retail.png');
await W(() => window.__world.walkToLease('retail', 1));
await page.waitForSelector('.pw-sheet.open #pw-lease-title', { timeout: 120000 });
await sleep(2500); await shot(page, 'phone-lease.png');
check((await page.textContent('.pw-sheet.open .pw-sub')).trim() === 'Retail Avenue · Unit 2', 'a Retail Avenue unit opens its lease sheet on a phone');

check(clean(errors).length === 0, 'no errors in the console', clean(errors));
await ctx.close();
}

/* ---------------------------------------------------------------- the day's coin limit */
console.log("the day's coin limit");
{
const { page, errors, ctx } = await open('/index.html?mode=open&fresh=1&time=day&cap=5&shopper=1', { viewport: { width: 1280, height: 800 } });
const W = (fn, arg) => page.evaluate(fn, arg);
const toasts = () => W(() => [...document.querySelectorAll('.pw-toast')].map((t) => t.textContent));
await ready(page);
await page.click('.pw-dcard >> nth=1');
await page.waitForSelector('.pw-sheet.open #pw-hero-title', { timeout: 90000 });
await page.click('.pw-sheet.open [data-close]'); await sleep(1200);
check(await W(() => localStorage.getItem('sellio-world-hero')) === 'mochi' && await W(() => window.__world.character) === 'mochi', 'closing the first hero picker keeps Mochi and does not ask again');
await page.waitForFunction(() => window.__world.started && !window.__world.debug.avatar.busy && window.__world.coinCount() > 0, null, { timeout: 60000 });
const n0 = await W(() => window.__world.coinCount());
let seenAll = [];
for (let k = 0; k < 8; k++) {
  const target = await W(() => {
    const w = window.__world, p = w.getPlayer(), pop = w.debug.popup, local = pop.toLocal(p.x, p.y);
    const c = [...pop.coins.coins.values()].filter((x) => x.state === 'idle').sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z))[0];
    if (!c) return null;
    const m = pop.toMap(c.x, c.z); w.debug.walkTo(m.x, m.y); return { id: c.id };
  });
  if (!target) break;
  await page.waitForFunction((id) => !window.__world.debug.popup.coins.coins.has(id) || window.__world.debug.popup.coins.coins.get(id).state !== 'idle', target.id, { timeout: 60000 }).catch(() => {});
  await sleep(700); seenAll.push(...await toasts());
}
await sleep(3500); seenAll.push(...await toasts());
const left = await W(() => window.__world.coinCount());
check(n0 >= 10 && left === 0, `at the limit, the rest of today's coins leave the street (${n0} -> ${left})`);
check(seenAll.some((t) => /You've collected today's 5 coins from the streets\. New coins arrive tomorrow\./.test(t)), 'the game says today\'s coins are collected', [...new Set(seenAll)]);
check(!seenAll.some((t) => /Something went wrong/.test(t)), 'no error message at the limit', [...new Set(seenAll)]);
const pops = await W(() => window.__backend.session().then((p) => [p.cap_left, p.drops.length]));
check(pops[0] === 0 && pops[1] === 0, 'the server has no coins left for today');
// a shop visit at the limit opens the shop without coins
const stallPt = await W(() => { const w = window.__world, pop = w.debug.popup, s = [...pop.stalls.values()][3]; const m = pop.toMap(s.center.x, s.center.z); w.walkToStall(s.shop.tenant_id); return 1; });
await page.waitForSelector('.pw-sheet.open #pw-stall-name', { timeout: 120000 });
await sleep(800);
check(/You've collected today's coins\. Visits earn coins again tomorrow/.test(await page.textContent('.pw-sheet.open .pw-reward')), 'a stall says visits earn coins again tomorrow', await page.textContent('.pw-sheet.open .pw-reward'));
await page.click('.pw-sheet.open [data-close]'); await sleep(800);
await page.click('.pw-coins'); await page.waitForSelector('.pw-sheet.open #pw-daily-title');
check(/All 5 of today's coins collected\. More tomorrow\./.test(await page.textContent('.pw-sheet.open .pw-today')), "today's rewards show the limit reached", await page.textContent('.pw-sheet.open .pw-today'));
await shot(page, 'cap-daily.png');
check(clean(errors).length === 0, 'no errors in the console', clean(errors));
await ctx.close();
}

await browser.close();
server.close();
await rm(out, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('all passed');
