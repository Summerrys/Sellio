// A stand-in for Sellio World's functions in Supabase, for verification/world-map.browser.mjs
// (and for standalone previews of the game). It keeps its state in the browser only and returns
// the same shapes as the server did when the map version was built (Oct 2026); the test adds the
// day's coin limit of 24 Nov 2026 on top (main.jsx, ?cap=N). Never used by the live app.
import { WorldError } from '../../src/world/api';
import { DEMO_SHOPS, DEMO_MY_SHOP } from './data';
import { DEMO_FNB } from './fnb';
import { rng, hashSeed } from '../../src/world/engine/kit';

const CFG = {
  street_min_shops: 30, street_capacity: 48,
  street_layout: { x: 3.2, zmax: 15, first_row_z: 2, row_gap: 7, min_rows: 6, end_margin: 8 },
  drops_per_day: 15, drop_weights: [36, 28, 18, 11, 7], night_window: { start: '19:00', end: '21:00' }, night_bonus_drops: 5,
  visit_reward: 2, visit_max_per_day: 5, missions_per_day: 3, missions_all_bonus: 10, streak_rewards: [3, 4, 5, 6, 8, 10, 15],
  claim_min_interval_ms: 300, claim_max_speed: 7, claim_slack: 2,
  stall_level_buyers: [0, 3, 10, 25, 50], explorer_level_coins: [0, 25, 60, 120, 200, 320, 480, 700, 1000, 1400],
};
const COSMETICS = [
  ['awning', 'sunset', 'Sunset Stripes', 'starter', 0, 1], ['awning', 'mint', 'Mint Stripes', 'common', 12, 1],
  ['awning', 'scallop', 'Rose Scallop', 'common', 20, 1], ['awning', 'pagoda', 'Lantern Roof', 'rare', 35, 1],
  ['awning', 'glow', 'Sellio Glow', 'epic', 50, 2],
  ['sign', 'wood', 'Timber Board', 'starter', 0, 1], ['sign', 'chalk', 'Chalkboard', 'common', 10, 1],
  ['sign', 'neon', 'Neon Tube', 'rare', 30, 1], ['sign', 'gold', 'Gold Leaf', 'epic', 45, 2],
  ['lights', 'none', 'No lights', 'starter', 0, 1], ['lights', 'bulbs', 'Festoon Bulbs', 'common', 15, 1],
  ['lights', 'fairy', 'Fairy Lights', 'common', 20, 1], ['lights', 'lanterns', 'Paper Lanterns', 'rare', 25, 1],
  ['decor', 'none', 'No decor', 'starter', 0, 1], ['decor', 'plants', 'Potted Plants', 'common', 8, 1],
  ['decor', 'bunting', 'Bunting Flags', 'common', 12, 1], ['decor', 'balloons', 'Balloons', 'rare', 18, 1],
].map(([slot, code, name, rarity, price, lvl]) => ({ id: `${slot}:${code}`, slot, code, name, rarity, price, min_stall_level: lvl }));
const MISSIONS = [
  ['pick_6', 'Pick up 6 coins', 'drops', 6, 5, 3, false], ['collect_20', 'Collect 20 coins from the street', 'drop_value', 20, 6, 3, false],
  ['visit_2', 'Visit 2 storefronts', 'visits', 2, 6, 3, false], ['new_shop', "Visit a shop you haven't visited before", 'new_shop', 1, 8, 2, false],
  ['big_coin', 'Find a 5-coin', 'big_coin', 1, 6, 2, false], ['restyle', 'Change something on your stall', 'style', 1, 5, 2, true],
].map(([code, title, metric, target, reward, weight, sellersOnly]) => ({ code, title, metric, target, reward, weight, sellersOnly }));
const ACHIEVEMENTS = [
  ['first_steps', 'First steps', 'Pick up your first coin', 5], ['window_shopper', 'Window shopper', 'Visit your first storefront', 5],
  ['regular', 'Regular', 'Visit 10 different shops', 15], ['collector', 'Collector', 'Collect 100 coins from the street', 10],
  ['night_owl', 'Night owl', 'Pick up a coin during night market hours', 5], ['streak_7', 'Week streak', 'Come back 7 days in a row', 25],
  ['stylist', 'Stylist', 'Unlock your first stall item', 10], ['full_house', 'Full house', 'Own a paid item in every stall slot', 20],
].map(([code, name, description, reward]) => ({ code, name, description, reward }));

const KEY = 'sellio-world-demo-v2';
const fresh = () => ({
  wallet: { balance: 0, lifetime: 0 }, refs: {}, days: {}, streak: { current: 0, best: 0, last_day: null },
  achievements: [], owned: [], style: { awning: 'sunset', sign: 'wood', lights: 'none', decor: 'none' },
  visitedShops: [], dropTotal: 0, welcomed: false,
});

function sgDay(d = new Date()) {
  const s = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}
function sgMinutes(d = new Date()) {
  const s = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
  return s.getHours() * 60 + s.getMinutes();
}
const hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const prevDay = (day) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

export function createDemoBackend({ mode = 'preview', signedIn = true, ownsShop = true, latency = 120, buyers = 2, persist = true, startCoins = 15, shopCount = 0, fnbCount = DEMO_FNB.length } = {}) {
  const FNB = DEMO_FNB.slice(0, fnbCount);
  // shopCount > 12 repeats the example stalls to fill a long street (load testing).
  const SHOPS = shopCount > DEMO_SHOPS.length
    ? Array.from({ length: shopCount }, (_, i) => {
      const b = DEMO_SHOPS[i % DEMO_SHOPS.length];
      return i < DEMO_SHOPS.length ? b : { ...b, tenant_id: `${b.tenant_id}-${i}`, slug: `${b.slug}-${i}`, name: `${b.name} ${Math.floor(i / DEMO_SHOPS.length) + 1}`, mine: false };
    })
    : DEMO_SHOPS;
  let st = fresh();
  if (persist) { try { const raw = localStorage.getItem(KEY); if (raw) st = { ...fresh(), ...JSON.parse(raw) }; } catch { /* storage unavailable */ } }
  const save = () => { if (persist) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage unavailable */ } };
  const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), latency * (0.6 + Math.random() * 0.8)));
  const fail = (hint, msg) => new Promise((_, rej) => setTimeout(() => rej(new WorldError(hint, msg)), latency));
  let user = signedIn ? { id: 'demo-user', email: 'demo@sellio.example' } : null;
  const listeners = new Set();
  const myShop = () => (user && ownsShop ? DEMO_MY_SHOP : null);
  const isOpenFor = () => mode === 'open' || !!myShop();

  if (startCoins && !st.welcomed) { st.wallet.balance += startCoins; st.welcomed = true; st.refs['admin:welcome'] = true; save(); }

  function credit(delta, reason, ref) {
    const k = `${reason}:${ref}`;
    if (st.refs[k]) return null;
    if (st.wallet.balance + delta < 0) throw new WorldError('insufficient_coins', `You need ${-(st.wallet.balance + delta)} more coins for this.`);
    st.refs[k] = true; st.wallet.balance += delta;
    if (delta > 0 && !['purchase', 'admin', 'cosmetic'].includes(reason)) st.wallet.lifetime += delta;
    return st.wallet.balance;
  }
  function award(code) {
    if (st.achievements.includes(code)) return null;
    const a = ACHIEVEMENTS.find((x) => x.code === code); if (!a) return null;
    st.achievements.push(code); credit(a.reward, 'achievement', code);
    return { code, name: a.name, reward: a.reward };
  }
  function layout() {
    const live = SHOPS.length;
    const l = CFG.street_layout;
    const rows = Math.max(l.min_rows, Math.ceil(Math.min(live, CFG.street_capacity) / 2));
    return { ...l, rows, zmin: l.first_row_z - (rows - 1) * l.row_gap - l.end_margin, live };
  }
  function pickValue(r) {
    const total = CFG.drop_weights.reduce((a, b) => a + b, 0); let acc = 0;
    for (let i = 0; i < 5; i++) { acc += CFG.drop_weights[i]; if (r * total < acc) return i + 1; }
    return 1;
  }
  function seed(day, count, night, salt) {
    const L = layout(), r = rng(hashSeed(`${day}:${salt}`));
    return Array.from({ length: count }, (_, i) => ({
      id: `${day}-${salt}-${i}`,
      x: Math.round(((r() * 2 - 1) * L.x) * 100) / 100,
      z: Math.round((L.zmin + (i + 0.15 + r() * 0.7) * (L.zmax - L.zmin) / count) * 100) / 100,
      value: night ? Math.min(5, pickValue(r()) + 1) : pickValue(r()), night, claimed: false,
    }));
  }
  function dayState(day) {
    if (!st.days[day]) {
      const h = (code) => { const r = rng(hashSeed(`${day}:${code}`))(); return Math.pow(r || 1e-9, 1 / MISSIONS.find((m) => m.code === code).weight); };
      const picks = MISSIONS.filter((m) => !m.sellersOnly || myShop()).sort((a, b) => h(b.code) - h(a.code)).slice(0, CFG.missions_per_day);
      st.days[day] = { drops: [], seeded: false, night: false, visits: 0, all_claimed: false, last: null,
        missions: picks.map((m) => ({ code: m.code, title: m.title, metric: m.metric, target: m.target, reward: m.reward, progress: 0, claimed: false })) };
    }
    return st.days[day];
  }
  function bump(day, metric, n) {
    for (const m of dayState(day).missions) if (m.metric === metric && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
  }
  const nightActive = () => { const m = sgMinutes(); return m >= hm(CFG.night_window.start) && m < hm(CFG.night_window.end); };
  function profile(day) {
    const s = dayState(day);
    let level = 1, next = null;
    CFG.explorer_level_coins.forEach((c, i) => { if (st.wallet.lifetime >= c) level = i + 1; else if (next === null) next = c; });
    const claimedToday = st.streak.last_day === day;
    const current = st.streak.last_day && (st.streak.last_day === day || st.streak.last_day === prevDay(day)) ? st.streak.current : 0;
    const nextStreak = claimedToday ? current : current + 1;
    return {
      day, balance: st.wallet.balance, lifetime: st.wallet.lifetime, level, next_level_at: next, my_shop: myShop(),
      streak: { current, best: st.streak.best, claimed_today: claimedToday, reward: CFG.streak_rewards[(Math.max(nextStreak, 1) - 1) % 7], rewards: CFG.streak_rewards },
      drops: s.drops.filter((d) => !d.claimed).sort((a, b) => b.z - a.z).map(({ id, x, z, value, night }) => ({ id, x, z, value, night })),
      missions: s.missions, missions_bonus: CFG.missions_all_bonus, missions_all_claimed: s.all_claimed,
      visits_left: Math.max(0, CFG.visit_max_per_day - s.visits), visit_reward: CFG.visit_reward,
      visited_today: Object.keys(st.refs).filter((k) => k.startsWith('visit:') && k.endsWith(`:${day}`)).map((k) => k.slice(6, -(day.length + 1))),
      night: { ...CFG.night_window, active: nightActive() },
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: st.achievements.includes(a.code) })),
      server_time: new Date().toISOString(),
    };
  }
  function stallLevel() {
    let level = 1, next = null;
    CFG.stall_level_buyers.forEach((b, i) => { if (buyers >= b) level = i + 1; else if (next === null) next = b; });
    return { level, buyers, next_at: next };
  }
  function myStall() {
    const lvl = stallLevel();
    return {
      tenant_id: DEMO_MY_SHOP, balance: st.wallet.balance, stall_level: lvl, style: { ...st.style },
      catalog: COSMETICS.map((c) => ({ ...c, owned: c.price === 0 || st.owned.includes(c.id), level_locked: c.min_stall_level > lvl.level })),
    };
  }
  const needUser = () => { if (!user) throw new WorldError('not_signed_in', 'Sign in to collect Sellio Coins.'); };
  const needOpen = () => { if (!isOpenFor()) throw new WorldError('street_closed', 'Pop-up Street opens soon. Coins start when it does.'); };
  const needOwner = (id) => { needUser(); if (id !== myShop()) throw new WorldError('not_owner', 'Only the shop owner can style this stall.'); };
  const run = (fn) => { try { const v = fn(); save(); return wait(v); } catch (e) { return e instanceof WorldError ? fail(e.hint, e.message) : Promise.reject(e); } };

  return {
    kind: 'demo',
    async getUser() { return user; },
    async onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    signIn() { user = { id: 'demo-user', email: 'demo@sellio.example' }; listeners.forEach((f) => f(user)); },
    reset() { st = fresh(); if (startCoins) { st.wallet.balance = startCoins; st.welcomed = true; } save(); },
    getStreet: () => run(() => {
      const L = layout();
      if (mode !== 'open' && !myShop()) return { open: false, preview: false, shops_live: SHOPS.length, min_shops: CFG.street_min_shops, shops: [] };
      const shops = SHOPS.slice(0, CFG.street_capacity).map((s) => ({ ...s, mine: s.tenant_id === myShop(), style: s.tenant_id === DEMO_MY_SHOP ? { ...st.style } : s.style }));
      return { open: mode === 'open', preview: mode !== 'open', shops_live: L.live, min_shops: CFG.street_min_shops, day: sgDay(), layout: L, shops };
    }),
    getDistrict: (key) => run(() => {
      if (key !== 'fnb') throw new WorldError('unknown_district', 'That district is not open yet.');
      return { district: 'fnb', day: sgDay(), shops: FNB };
    }),
    session: () => run(() => {
      needUser(); needOpen();
      const day = sgDay(), s = dayState(day);
      if (!s.seeded) { s.drops.push(...seed(day, CFG.drops_per_day, false, 'd')); s.seeded = true; }
      if (!s.night && nightActive()) { s.drops.push(...seed(day, CFG.night_bonus_drops, true, 'n')); s.night = true; }
      return profile(day);
    }),
    claimDrop: (id) => run(() => {
      needUser(); needOpen();
      const day = sgDay(), s = dayState(day), d = s.drops.find((x) => x.id === id);
      if (!d) throw new WorldError('drop_gone', 'That coin has gone.');
      if (d.claimed) return { ok: false, reason: 'already', balance: st.wallet.balance };
      const now = Date.now();
      if (s.last) {
        const dt = (now - s.last.at) / 1000;
        if (dt * 1000 < CFG.claim_min_interval_ms) throw new WorldError('too_fast', 'Slow down a little.');
        if (Math.hypot(d.x - s.last.x, d.z - s.last.z) > CFG.claim_max_speed * dt + CFG.claim_slack) throw new WorldError('too_far', 'Walk to the coin to pick it up.');
      }
      d.claimed = true; s.last = { at: now, x: d.x, z: d.z };
      credit(d.value, 'drop', d.id); st.dropTotal += d.value;
      bump(day, 'drops', 1); bump(day, 'drop_value', d.value); if (d.value === 5) bump(day, 'big_coin', 1);
      const unlocked = [award('first_steps'), d.night ? award('night_owl') : null, st.dropTotal >= 100 ? award('collector') : null].filter(Boolean);
      return { ok: true, value: d.value, balance: st.wallet.balance, missions: s.missions, unlocked };
    }),
    claimVisit: (tenantId) => run(() => {
      needUser(); needOpen();
      if (!SHOPS.some((x) => x.tenant_id === tenantId) && !FNB.some((x) => x.tenant_id === tenantId)) throw new WorldError('not_a_street_shop', 'This shop is not in Sellio World right now.');
      if (tenantId === myShop()) return { ok: false, reason: 'own_shop' };
      const day = sgDay(), s = dayState(day), ref = `${tenantId}:${day}`;
      if (st.refs[`visit:${ref}`]) return { ok: false, reason: 'already' };
      if (s.visits >= CFG.visit_max_per_day) return { ok: false, reason: 'daily_cap' };
      const isNew = !st.visitedShops.includes(tenantId);
      credit(CFG.visit_reward, 'visit', ref); s.visits++;
      bump(day, 'visits', 1); if (isNew) { bump(day, 'new_shop', 1); st.visitedShops.push(tenantId); }
      const unlocked = [award('window_shopper'), st.visitedShops.length >= 10 ? award('regular') : null].filter(Boolean);
      return { ok: true, value: CFG.visit_reward, balance: st.wallet.balance, missions: s.missions, unlocked };
    }),
    claimDaily: () => run(() => {
      needUser(); needOpen();
      const day = sgDay();
      if (st.streak.last_day === day) return { ok: false, reason: 'already', streak: st.streak.current };
      const current = st.streak.last_day === prevDay(day) ? st.streak.current + 1 : 1;
      const value = CFG.streak_rewards[(current - 1) % 7];
      st.streak = { current, best: Math.max(st.streak.best, current), last_day: day };
      credit(value, 'daily', day);
      const unlocked = current >= 7 ? [award('streak_7')].filter(Boolean) : [];
      return { ok: true, value, streak: current, balance: st.wallet.balance, unlocked };
    }),
    claimMission: (code) => run(() => {
      needUser(); needOpen();
      const day = sgDay(), s = st.days[day];
      if (!s) throw new WorldError('no_missions', "Today's missions have changed. Reopen the street to see them.");
      const m = s.missions.find((x) => x.code === code);
      if (!m) throw new WorldError('unknown_mission', "Today's missions have changed. Reopen the street to see them.");
      if (m.claimed) return { ok: false, reason: 'already' };
      if (m.progress < m.target) throw new WorldError('not_finished', 'Finish the mission first.');
      m.claimed = true; credit(m.reward, 'mission', `${day}:${code}`);
      let bonus = 0;
      if (!s.all_claimed && s.missions.every((x) => x.claimed)) { bonus = CFG.missions_all_bonus; s.all_claimed = true; credit(bonus, 'missions_all', day); }
      return { ok: true, value: m.reward, bonus, balance: st.wallet.balance, missions: s.missions };
    }),
    myStall: (tenantId) => run(() => { needOwner(tenantId); return myStall(); }),
    buy: (tenantId, itemId) => run(() => {
      needOwner(tenantId);
      const item = COSMETICS.find((c) => c.id === itemId);
      if (!item) throw new WorldError('item_unavailable', 'This item is not available any more.');
      if (item.price === 0 || st.owned.includes(itemId)) { st.style[item.slot] = item.code; return { ...myStall(), unlocked: [] }; }
      if (item.min_stall_level > stallLevel().level) {
        throw new WorldError('level_locked', `Reach stall level ${item.min_stall_level} to unlock this. Stall levels go up as more buyers pay for orders.`);
      }
      credit(-item.price, 'cosmetic', `${tenantId}:${itemId}`);
      st.owned.push(itemId); st.style[item.slot] = item.code; bump(sgDay(), 'style', 1);
      const paidSlots = new Set(st.owned.map((id) => COSMETICS.find((c) => c.id === id)).filter((c) => c && c.price > 0).map((c) => c.slot));
      const unlocked = [award('stylist'), paidSlots.size === 4 ? award('full_house') : null].filter(Boolean);
      return { ...myStall(), unlocked };
    }),
    equip: (tenantId, itemId) => run(() => {
      needOwner(tenantId);
      const item = COSMETICS.find((c) => c.id === itemId);
      if (!item) throw new WorldError('item_unavailable', 'This item is not available any more.');
      if (item.price > 0 && !st.owned.includes(itemId)) throw new WorldError('not_owned', 'Unlock this item first.');
      st.style[item.slot] = item.code; bump(sgDay(), 'style', 1);
      return myStall();
    }),
    links: { signIn: null, join: null, openShop: null, shopSetup: null, merchants: null, storefront: () => null },
  };
}
