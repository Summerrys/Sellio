// The page verification/world-map.browser.mjs drives: the real game (src/world/WorldGame.jsx) with
// the stand-in server. URL options: ?mode=open|preview|closed &guest=1 &shopper=1 &fresh=1 &cap=N
import React from 'react';
import { createRoot } from 'react-dom/client';
import WorldGame from '../../src/world/WorldGame.jsx';
import { createDemoBackend } from './backend.js';

const q = new URLSearchParams(location.search);
if (q.get('fresh') === '1') { try { localStorage.removeItem('sellio-world-demo-v2'); localStorage.removeItem('sellio-world-hero'); } catch { /* ignore */ } }
const backend = createDemoBackend({
  mode: q.get('mode') || 'open',
  signedIn: q.get('guest') !== '1',
  ownsShop: q.get('shopper') !== '1',
  latency: Number(q.get('latency') || 120),
  shopCount: Number(q.get('shops') || 0),
  fnbCount: q.get('fnb') === null ? undefined : Number(q.get('fnb')),
});
// ?cap=N: answer like the live server's daily limit on street coins and shop visits
// (cap_left in the profile and in each answer; nothing more once it is used up).
const cap = Number(q.get('cap') || 0);
if (cap > 0) {
  let earned = 0;
  const left = () => Math.max(0, cap - earned);
  const { session, claimDrop, claimVisit } = backend;
  backend.session = async () => { const p = await session.call(backend); return { ...p, daily_cap: cap, cap_left: left(), drops: left() <= 0 ? [] : p.drops }; };
  backend.claimDrop = async (id) => {
    if (left() <= 0) { const p = await session.call(backend); return { ok: false, reason: 'daily_limit', cap_left: 0, balance: p.balance }; }
    const r = await claimDrop.call(backend, id); if (r.ok) earned += r.value;
    return { ...r, cap_left: left() };
  };
  backend.claimVisit = async (id) => {
    if (left() <= 0) return { ok: false, reason: 'daily_limit' };
    const r = await claimVisit.call(backend, id); if (r.ok) earned += r.value;
    return { ...r, cap_left: left() };
  };
}
window.__backend = backend;
const log = [];
window.__navigations = log;
function App() {
  return <WorldGame backend={backend} debug={q.get('debug') !== '0'} navigate={(url) => { log.push(url); console.log('navigate', url); }} onReset={() => backend.reset()} />;
}
createRoot(document.getElementById('root')).render(<App />);
