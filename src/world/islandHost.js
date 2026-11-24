// The island version of Sellio World is one self-contained file, public/assets/world/island.html,
// shown in a frame by the World page (src/pages/World.jsx). The game draws and plays; this file
// answers what it asks for. Every seller, coin, visit reward and stall unlock still comes from
// the Sellio World functions in Supabase (src/world/api.js): the game never talks to Supabase
// itself, and it is only ever sent what a player may see.
//
// The game posts { t: 'sellio-world', id, method, args } to this page and gets back
// { t: 'sellio-world-reply', id, ok, data } or { ..., ok: false, error: { hint, message } }.
// Only the frame the World page made, on this site's own address, is answered.

export const ISLAND_URL = '/assets/world/island.html?live=1';
// Where the game's buttons lead. Pages of this site only.
export const ISLAND_LINKS = { signIn: '/Auth', join: '/Join', merchants: '/#pricing' };

const isPageLink = (url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') && url.length <= 300;

export function createIslandHost({ backend, navigate, leave, frame, toError }) {
  const calls = {
    // Everything the game needs to start: who is playing, the shops on each street, and (for a
    // signed-in player while the street is open) their coins and today's drops.
    async boot() {
      const user = await backend.getUser();
      const [street, district] = await Promise.all([
        backend.getStreet(),
        backend.getDistrict ? backend.getDistrict('fnb').catch(() => null) : null,
      ]);
      let profile = null;
      let sessionError = null;
      if (user && (street.open || street.preview)) {
        try { profile = await backend.session(); } catch (e) { sessionError = e.hint || 'unknown'; }
      }
      return {
        user: user ? { id: user.id } : null,
        street,
        fnb: Array.isArray(district?.shops) ? district.shops : [],
        profile,
        sessionError,
        links: ISLAND_LINKS,
      };
    },
    session: () => backend.session(),
    claimDrop: (id) => backend.claimDrop(String(id)),
    claimVisit: (tenantId) => backend.claimVisit(String(tenantId)),
    myStall: (tenantId) => backend.myStall(String(tenantId)),
    wallet: () => backend.wallet(),
    buy: (tenantId, itemId) => backend.buy(String(tenantId), String(itemId)),
    equip: (tenantId, itemId) => backend.equip(String(tenantId), String(itemId)),
    navigate(url) {
      if (!isPageLink(url)) throw new Error('Not a Sellio page.');
      navigate(url);
      return true;
    },
    leave() { leave(); return true; },
  };

  async function onMessage(event) {
    const win = frame();
    if (!win || event.source !== win || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.t !== 'sellio-world' || typeof msg.method !== 'string') return;
    const call = Object.prototype.hasOwnProperty.call(calls, msg.method) ? calls[msg.method] : null;
    let reply;
    try {
      if (!call) throw new Error('Unknown request.');
      reply = { ok: true, data: await call(...(Array.isArray(msg.args) ? msg.args : [])) };
    } catch (err) {
      const shown = toError(err);
      reply = { ok: false, error: { hint: shown.hint || 'unknown', message: shown.message } };
    }
    try { win.postMessage({ t: 'sellio-world-reply', id: msg.id, ...reply }, window.location.origin); } catch { /* the frame has gone */ }
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
