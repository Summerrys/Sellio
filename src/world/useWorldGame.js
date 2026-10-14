import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streetGeometry } from './engine/constants';
import { rng, hashSeed } from './engine/kit';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLAIM_GAP_MS = 340; // the server allows one pickup every 300 ms

function sgNow() {
  const d = new Date();
  return new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
}
const sgDay = () => { const s = sgNow(); return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`; };
const hm = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };

// Coins a signed-out visitor can see but not pick up (they hop and ask the
// visitor to sign in). Placed like the server does, one per band.
function guestDrops(layout, shopCount) {
  const g = streetGeometry(layout, shopCount);
  const r = rng(hashSeed(`guest:${sgDay()}`));
  const n = 15;
  return Array.from({ length: n }, (_, i) => ({
    id: `guest-${i}`, x: (r() * 2 - 1) * g.x, z: g.zmin + (i + 0.15 + r() * 0.7) * (g.zmax - g.zmin) / n,
    value: [1, 1, 1, 2, 2, 3, 3, 4, 5][Math.floor(r() * 9)], night: false,
  }));
}

/**
 * Game state and server calls for Pop-up Street. The server decides every
 * reward; this hook keeps the latest answers, queues coin pickups so they
 * reach the server in walking order, and shows coins in flight right away.
 */
export function useWorldGame(backend) {
  const [phase, setPhase] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [user, setUser] = useState(undefined);
  const [street, setStreet] = useState(null);
  const [fnb, setFnb] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [pending, setPending] = useState(0);
  const [stall, setStall] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const queue = useRef(Promise.resolve());
  const lastClaim = useRef(0);
  const profileRef = useRef(null);
  profileRef.current = profile;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const mode = !street ? 'closed' : street.open ? 'open' : street.preview ? 'preview' : 'closed';
  const myShopId = profile?.my_shop || street?.shops?.find((s) => s.mine)?.tenant_id || null;
  const myStallOnStreet = !!street?.shops?.some((s) => s.tenant_id === myShopId);

  const loadSession = useCallback(async () => {
    try {
      const p = await backend.session();
      if (!alive.current) return null;
      setProfile(p); setSessionError(null);
      return p;
    } catch (e) {
      if (!alive.current) return null;
      setSessionError(e.hint || 'unknown');
      return null;
    }
  }, [backend]);

  const load = useCallback(async () => {
    setPhase('loading'); setLoadError(null);
    try {
      const u = await backend.getUser();
      // The F&B District is optional: if it cannot load, its plots stay empty.
      const [s, d] = await Promise.all([backend.getStreet(), backend.getDistrict ? backend.getDistrict('fnb').catch(() => null) : null]);
      if (!alive.current) return;
      setUser(u); setStreet(s); setFnb(Array.isArray(d?.shops) ? d.shops : []);
      if (u && (s.open || s.preview)) await loadSession();
      else setProfile(null);
      if (alive.current) setPhase('ready');
    } catch (e) {
      if (!alive.current) return;
      setLoadError(e.message || 'Something went wrong.');
      setPhase('error');
    }
  }, [backend, loadSession]);

  useEffect(() => { load(); }, [load]);

  // Signing in or out (here or in another tab) reloads the street.
  const userRef = useRef(undefined);
  userRef.current = user;
  useEffect(() => {
    let unsub = null, cancelled = false;
    Promise.resolve(backend.onAuthChange?.((u) => {
      const cur = userRef.current;
      if (cur === undefined) return; // the first load reads the session itself
      if ((u?.id || null) !== (cur?.id || null)) load();
    })).then((fn) => { if (cancelled) fn?.(); else unsub = fn; });
    return () => { cancelled = true; unsub?.(); };
  }, [backend, load]);

  // A new Singapore day brings new coins and missions; night market hours
  // add bonus coins. Check once a minute and when the tab comes back.
  useEffect(() => {
    const check = () => {
      const p = profileRef.current; if (!p || document.hidden) return;
      const now = sgNow(), mins = now.getHours() * 60 + now.getMinutes();
      const night = p.night && mins >= hm(p.night.start) && mins < hm(p.night.end);
      if (p.day !== sgDay() || (night && !p.night.active)) loadSession();
    };
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [loadSession]);

  // Applies a reward answer: new balance, mission progress, new achievements.
  const applyEarn = useCallback((r) => {
    setProfile((p) => {
      if (!p || !r) return p;
      const gained = typeof r.balance === 'number' ? Math.max(0, r.balance - p.balance) : 0;
      const lifetime = p.lifetime + gained;
      const unlocked = new Set((r.unlocked || []).map((a) => a.code));
      return {
        ...p,
        balance: typeof r.balance === 'number' ? r.balance : p.balance,
        lifetime,
        missions: r.missions || p.missions,
        achievements: unlocked.size ? p.achievements.map((a) => (unlocked.has(a.code) ? { ...a, unlocked: true } : a)) : p.achievements,
      };
    });
  }, []);
  // Explorer level-up: celebrate now, then take the next threshold from the server.
  useEffect(() => {
    if (profile && profile.next_level_at != null && profile.lifetime >= profile.next_level_at) {
      const lvl = profile.level + 1;
      setProfile((p) => (p ? { ...p, level: lvl, next_level_at: null } : p));
      setLevelUp(lvl);
      loadSession();
    }
  }, [profile, loadSession]);

  const claimDrop = useCallback((drop) => {
    setPending((n) => n + drop.value);
    const job = queue.current.then(async () => {
      const gap = CLAIM_GAP_MS - (Date.now() - lastClaim.current);
      if (gap > 0) await sleep(gap);
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await backend.claimDrop(drop.id);
          lastClaim.current = Date.now();
          return r;
        } catch (e) {
          // Network timing can make an honest walk look too quick; the
          // allowance grows with time, so waiting and retrying is safe.
          if (e.hint === 'too_fast' && attempt <= 4) { await sleep(350 * attempt); continue; }
          if (e.hint === 'too_far' && attempt <= 3) { await sleep(700 * 2 ** (attempt - 1)); continue; }
          if (e.hint === 'network' && attempt <= 2) { await sleep(1200 * attempt); continue; }
          throw e;
        }
      }
    });
    queue.current = job.catch(() => {});
    return job.then((r) => {
      if (!alive.current) return r;
      setPending((n) => n - drop.value);
      applyEarn(r);
      setProfile((p) => (p ? { ...p, drops: p.drops.filter((d) => d.id !== drop.id) } : p));
      return r;
    }, (e) => {
      if (alive.current) {
        setPending((n) => n - drop.value);
        if (e.hint === 'drop_gone') setProfile((p) => (p ? { ...p, drops: p.drops.filter((d) => d.id !== drop.id) } : p));
      }
      throw e;
    });
  }, [backend, applyEarn]);

  const claimVisit = useCallback(async (shop) => {
    const r = await backend.claimVisit(shop.tenant_id);
    if (r.ok) {
      applyEarn(r);
      setProfile((p) => (p ? { ...p, visits_left: Math.max(0, p.visits_left - 1), visited_today: [...(p.visited_today || []), shop.tenant_id] } : p));
    } else if (r.reason === 'already') {
      setProfile((p) => (p && !p.visited_today?.includes(shop.tenant_id) ? { ...p, visited_today: [...(p.visited_today || []), shop.tenant_id] } : p));
    } else if (r.reason === 'daily_cap') setProfile((p) => (p ? { ...p, visits_left: 0 } : p));
    return r;
  }, [backend, applyEarn]);

  const claimDaily = useCallback(async () => {
    const r = await backend.claimDaily();
    if (r.ok) {
      applyEarn(r);
      setProfile((p) => (p ? { ...p, streak: { ...p.streak, current: r.streak, best: Math.max(p.streak.best, r.streak), claimed_today: true } } : p));
    } else if (r.reason === 'already') setProfile((p) => (p ? { ...p, streak: { ...p.streak, claimed_today: true } } : p));
    return r;
  }, [backend, applyEarn]);

  const claimMission = useCallback(async (code) => {
    const r = await backend.claimMission(code);
    if (r.ok) { applyEarn(r); setProfile((p) => (p ? { ...p, missions_all_claimed: p.missions_all_claimed || r.bonus > 0 } : p)); }
    return r;
  }, [backend, applyEarn]);

  // Owner's stall: catalogue, unlocked items, level.
  const applyStall = useCallback((s) => {
    setStall(s);
    setProfile((p) => (p ? { ...p, balance: s.balance } : p));
    setStreet((st) => (st ? { ...st, shops: st.shops.map((x) => (x.tenant_id === s.tenant_id ? { ...x, style: s.style } : x)) } : st));
    if (s.unlocked?.length) applyEarn({ balance: s.balance, unlocked: s.unlocked });
  }, [applyEarn]);
  const loadStall = useCallback(async () => {
    if (!myShopId) return null;
    const s = await backend.myStall(myShopId);
    if (alive.current) { setStall(s); setProfile((p) => (p ? { ...p, balance: s.balance } : p)); }
    return s;
  }, [backend, myShopId]);
  const buy = useCallback(async (itemId) => {
    const s = await backend.buy(myShopId, itemId);
    if (alive.current) applyStall(s);
    return s;
  }, [backend, myShopId, applyStall]);
  const equip = useCallback(async (itemId) => {
    const s = await backend.equip(myShopId, itemId);
    if (alive.current) applyStall(s);
    return s;
  }, [backend, myShopId, applyStall]);

  const drops = useMemo(() => {
    if (profile) return profile.drops || [];
    if (user === null && street && street.open) return guestDrops(street.layout, street.shops.length);
    return [];
  }, [profile, user, street]);

  const claimable = !!profile && (
    (!profile.streak.claimed_today) ||
    profile.missions.some((m) => !m.claimed && m.progress >= m.target)
  );

  return {
    phase, loadError, reload: load, refreshSession: loadSession,
    user, street, fnb, mode, profile, sessionError,
    balance: profile ? profile.balance + pending : null,
    pending, drops, canCollect: !!profile,
    myShopId, myStallOnStreet, stall,
    levelUp, clearLevelUp: () => setLevelUp(null),
    claimable,
    claimDrop, claimVisit, claimDaily, claimMission, loadStall, buy, equip,
  };
}
