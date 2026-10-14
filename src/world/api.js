// Talks to the Sellio World functions in Supabase. Every coin, unlock and
// reward is decided on the server; this file only calls the functions and
// turns their errors into messages a player can act on.

const MESSAGES = {
  not_signed_in: 'Sign in to collect Sellio Coins.',
  street_closed: 'Pop-up Street opens soon. Coins start when it does.',
  drop_gone: 'That coin has gone.',
  too_fast: 'Slow down a little.',
  too_far: 'Walk to the coin to pick it up.',
  not_a_street_shop: 'This shop is not in Sellio World right now.',
  unknown_district: 'That district is not open yet.',
  item_unavailable: 'This item is not available any more.',
  not_owned: 'Unlock this item first.',
  not_finished: 'Finish the mission first.',
  unknown_mission: "Today's missions have changed. Reopen the street to see them.",
  no_missions: "Today's missions have changed. Reopen the street to see them.",
  not_owner: 'Only the shop owner can style this stall.',
  not_a_shop: 'Only free shops have a stall on Pop-up Street.',
  unknown_street: 'That street does not exist yet.',
  network: "Can't reach Sellio right now. Check your connection and try again.",
};
// Hints whose server message is written for players (it includes numbers).
const SERVER_WORDED = new Set(['insufficient_coins', 'level_locked']);

export class WorldError extends Error {
  constructor(hint, message) { super(message); this.name = 'WorldError'; this.hint = hint; }
}

export function toWorldError(err) {
  if (err instanceof WorldError) return err;
  const hint = err?.hint || '';
  if (SERVER_WORDED.has(hint) && err.message) return new WorldError(hint, err.message);
  if (MESSAGES[hint]) return new WorldError(hint, MESSAGES[hint]);
  const msg = String(err?.message || err || '');
  if (err?.code === 'PGRST301' || /jwt|not authenticated/i.test(msg) || (err?.code === '42501' && /permission denied/i.test(msg))) {
    return new WorldError('not_signed_in', MESSAGES.not_signed_in);
  }
  if (/failed to fetch|network|load failed|timeout/i.test(msg)) return new WorldError('network', MESSAGES.network);
  return new WorldError('unknown', 'Something went wrong. Try again in a moment.');
}

export function createSupabaseBackend(getSupabase) {
  async function rpc(fn, args) {
    let sb;
    try { sb = await getSupabase(); } catch (e) { throw toWorldError(e); }
    let res;
    try { res = await sb.rpc(fn, args); } catch (e) { throw toWorldError(e); }
    if (res.error) throw toWorldError(res.error);
    return res.data;
  }
  return {
    kind: 'live',
    async getUser() {
      const sb = await getSupabase();
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user;
      return u ? { id: u.id, email: u.email } : null;
    },
    async onAuthChange(cb) {
      const sb = await getSupabase();
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        const u = session?.user;
        cb(u ? { id: u.id, email: u.email } : null);
      });
      return () => data?.subscription?.unsubscribe();
    },
    getStreet: () => rpc('world_get_street', { p_street: 'popup' }),
    getDistrict: (key) => rpc('world_get_district', { p_district: key }),
    session: () => rpc('world_session'),
    claimDrop: (id) => rpc('world_claim_drop', { p_drop_id: id }),
    claimVisit: (tenantId) => rpc('world_claim_visit', { p_tenant_id: tenantId }),
    claimDaily: () => rpc('world_claim_daily'),
    claimMission: (code) => rpc('world_claim_mission', { p_code: code }),
    myStall: (tenantId) => rpc('world_my_stall', { p_tenant_id: tenantId }),
    buy: (tenantId, itemId) => rpc('world_buy_cosmetic', { p_tenant_id: tenantId, p_item_id: itemId }),
    equip: (tenantId, itemId) => rpc('world_equip_cosmetic', { p_tenant_id: tenantId, p_item_id: itemId }),
    links: {
      signIn: '/Auth',
      join: '/Join',
      openShop: '/Account',
      shopSetup: '/ShopSetup',
      merchants: '/#pricing',
      storefront: (slug) => `/store/${encodeURIComponent(slug)}`,
    },
  };
}
