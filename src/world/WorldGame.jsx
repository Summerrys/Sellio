import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './world.css';
import { DISTRICTS, PLAZA } from './map/layout';
import { autoTheme } from './engine/constants';
import { useWorldGame } from './useWorldGame';
import { Hud, Dock, useToasts, Toasts, popAt } from './ui/Chrome';
import { StallSheet } from './ui/StallSheet';
import { StylePanel } from './ui/StylePanel';
import { DailyPanel } from './ui/DailyPanel';
import { HelpSheet } from './ui/HelpSheet';
import { PlotSheet, SignInSheet } from './ui/PlotSheet';
import { StorefrontSheet, FnbPlotSheet, ComingSoonSheet, HopSheet } from './ui/DistrictSheets';
import { Hub, AreaTitle } from './ui/Hub';

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Figtree:wght@400;500;600;700&family=Fredoka:wght@500;600;700&display=swap';
const RETURN_KEY = 'sellio-world-return';
const SIDE_PANEL = (390 + 20) / 2;
const CAPACITY = 48;
const PLACE_NAMES = { plaza: PLAZA.name, ...Object.fromEntries(DISTRICTS.map((d) => [d.key, d.name])) };

// Signboards are drawn into textures, so the fonts must be ready first
// (waits at most 2.5 s, then falls back to system fonts).
async function loadFonts() {
  if (!document.querySelector('link[data-pw-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONTS_HREF; l.dataset.pwFonts = '1';
    document.head.appendChild(l);
  }
  if (!document.fonts?.load) return;
  const loads = Promise.all(['700 64px Fredoka', '600 40px Fredoka', '700 64px Caveat', '600 16px Figtree'].map((f) => document.fonts.load(f))).catch(() => {});
  await Promise.race([loads, new Promise((r) => setTimeout(r, 2500))]);
}

function readReturn() {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RETURN_KEY);
    const r = JSON.parse(raw);
    return Date.now() - r.t < 30 * 60 * 1000 && Number.isFinite(r.x) && Number.isFinite(r.y) ? r : null;
  } catch { return null; }
}

const LINK_WORDS = { signIn: 'the sign-in page', join: 'account sign-up', openShop: 'free shop sign-up', shopSetup: 'your shop setup', merchants: 'Sellio plans for cafés and restaurants' };

/**
 * Sellio World: the whole island as a map you can explore, with the F&B
 * District's storefronts, Pop-up Street's stalls and coins, and the districts
 * still to come. `backend` is the Supabase backend in the app (or the demo
 * backend) and `navigate(url)` leaves the game for another Sellio page.
 */
export default function WorldGame({ backend, navigate, debug = false, onReset }) {
  const game = useWorldGame(backend);
  const rootRef = useRef(null), stageRef = useRef(null), fxRef = useRef(null), worldRef = useRef(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [worldOn, setWorldOn] = useState(0); // changes each time a world is created
  const [engine, setEngine] = useState('loading'); // loading | ready | failed
  const [entered, setEntered] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [storeId, setStoreId] = useState(null);
  const [plot, setPlot] = useState(null);
  const [soonKey, setSoonKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('Tap the ground to walk · drag to look around');
  const [hintGone, setHintGone] = useState(false);
  const [bump, setBump] = useState(0);
  const [themeChoice, setThemeChoice] = useState('auto');
  const [clockTick, setClockTick] = useState(0);
  const [sound, setSound] = useState(true);
  const [saver, setSaver] = useState(false);
  const [gfxLost, setGfxLost] = useState(false);
  const [following, setFollowing] = useState(true);
  const [here, setHere] = useState(null);
  const [area, setArea] = useState({ title: '', sub: '', show: false });
  const signInShown = useRef(false);
  const lastPlayer = useRef(null); // where Mochi was when the world had to be rebuilt
  const returning = useRef(null);
  const enteredRef = useRef(false);
  enteredRef.current = entered;
  const { toasts, push, dismiss } = useToasts();

  const street = game.street;
  const shops = useMemo(() => street?.shops || [], [street]);
  const fnbShops = useMemo(() => game.fnb || [], [game.fnb]);
  const shop = shops.find((s) => s.tenant_id === shopId) || null;
  const store = fnbShops.find((s) => s.tenant_id === storeId) || null;
  const myShop = shops.find((s) => s.tenant_id === game.myShopId) || null;
  const viewer = game.user === null ? 'guest' : !game.myShopId ? 'shopper' : game.myStallOnStreet ? 'owner' : 'owner-not-live';
  const closed = game.mode === 'closed';
  const soonCount = closed ? Math.min(street?.shops_live ?? 0, CAPACITY) : 0;

  /* what each district card and label says */
  const districts = useMemo(() => {
    const n = fnbShops.length;
    const live = street?.shops_live ?? 0, min = street?.min_shops ?? 30;
    return [
      { ...DISTRICTS[0], note: n === 0 ? 'Storefronts opening soon' : n === 1 ? '1 storefront open' : `${n} storefronts open` },
      { ...DISTRICTS[1], status: closed ? 'opening' : 'live', note: closed ? `Opens at ${min} shops · ${live} live` : `${shops.length} home sellers' stalls · coins` },
      { ...DISTRICTS[2], note: 'Coming soon' },
      { ...DISTRICTS[3], note: 'Coming soon' },
    ];
  }, [fnbShops, street, shops, closed]);
  const hopList = useMemo(() => [{ key: 'plaza', name: PLAZA.name, status: 'live', note: 'The fountain and the giant coin' }, ...districts], [districts]);

  /* page setup: no page scrolling while the game is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    returning.current = readReturn();
    let alive = true;
    loadFonts().then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; document.body.style.overflow = prev; };
  }, []);

  /* the world, created once the island's size is known */
  const handlers = useRef({});
  const layoutInput = useMemo(() => {
    if (!street) return null;
    return { popupLayout: street.layout || null, popupShops: closed ? soonCount : Math.min(shops.length, CAPACITY), fnbCount: fnbShops.length };
  }, [street, closed, soonCount, shops.length, fnbShops.length]);
  const layoutKey = layoutInput ? JSON.stringify(layoutInput) : '';
  useEffect(() => {
    if (!fontsReady || game.phase !== 'ready' || !layoutKey || !stageRef.current) return undefined;
    let world = null, cancelled = false;
    const events = new Proxy({}, { get: (_, k) => (...a) => handlers.current[k]?.(...a) });
    setEngine('loading');
    // The map engine (MapLibre and three.js) loads only here, in the browser.
    import('./map/MapWorld').then(({ createMapWorld }) => {
      if (cancelled || !stageRef.current) return;
      world = createMapWorld(stageRef.current, {
        layoutInput: JSON.parse(layoutKey), events, debug,
        theme: themeChoice === 'auto' ? autoTheme() : themeChoice,
        reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        coarse: window.matchMedia?.('(pointer: coarse)').matches,
        quality: saver ? 'saver' : 'auto',
      });
      worldRef.current = world;
      if (lastPlayer.current) { returning.current = { ...lastPlayer.current, t: Date.now() }; lastPlayer.current = null; setEntered(false); }
      setSound(world.sfx.enabled);
      setWorldOn((n) => n + 1);
    }).catch((e) => {
      console.error('Sellio World could not start 3D graphics', e);
      if (!cancelled) setEngine('failed');
    });
    return () => {
      cancelled = true;
      if (!world) return;
      if (enteredRef.current) lastPlayer.current = world.getPlayer();
      world.dispose();
      if (worldRef.current === world) worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsReady, game.phase, layoutKey, debug]);

  /* keep the world in step with the game state */
  const streetKey = street ? `${game.mode}|${street.shops_live}|${shops.map((s) => s.tenant_id).join(',')}|${worldOn}` : '';
  useEffect(() => {
    if (!worldOn || !street) return;
    worldRef.current?.setStreet({ shops: shops.slice(0, CAPACITY), layout: street.layout, mode: game.mode, liveCount: street.shops_live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetKey]);
  useEffect(() => { if (worldOn) worldRef.current?.setFnbShops(fnbShops); }, [worldOn, fnbShops]);
  useEffect(() => {
    if (!worldOn) return;
    for (const d of districts) worldRef.current?.setDistrictInfo(d.key, { sub: d.status === 'soon' ? 'Coming soon' : `${d.note} · ${d.status === 'opening' ? 'Peek' : 'Enter'}`, status: d.status === 'soon' ? 'soon' : 'live' });
    worldRef.current?.setDistrictInfo('plaza', { sub: '' });
  }, [worldOn, districts]);
  useEffect(() => {
    if (!worldOn) return;
    for (const s of shops) if (sheet !== 'style' || s.tenant_id !== game.myShopId) worldRef.current?.setStallStyle(s.tenant_id, s.style);
  }, [worldOn, shops, sheet, game.myShopId]);
  useEffect(() => { if (worldOn && entered) worldRef.current?.setDrops(game.drops, { animate: true }); }, [worldOn, entered, game.drops]);
  useEffect(() => { if (worldOn) worldRef.current?.setCollectEnabled(game.canCollect); }, [worldOn, game.canCollect]);

  // Day or evening look; "auto" follows the clock and is re-checked each minute.
  useEffect(() => { const id = setInterval(() => setClockTick((n) => n + 1), 60000); return () => clearInterval(id); }, []);
  const theme = themeChoice === 'auto' ? autoTheme() : themeChoice;
  useEffect(() => { if (worldOn) worldRef.current?.setTheme(theme); }, [worldOn, theme, clockTick]);

  /* the welcome screen's cards leave the island room to be seen */
  useEffect(() => {
    if (!worldOn || entered) return undefined;
    const measure = () => {
      const root = rootRef.current; if (!root) return;
      const top = root.querySelector('.pw-hub-top'), cards = root.querySelector('.pw-hub-cards');
      const h = root.clientHeight || window.innerHeight;
      worldRef.current?.setOverviewPadding({ top: top ? Math.round(top.getBoundingClientRect().bottom * 0.75) : 0, bottom: cards ? Math.round((h - cards.getBoundingClientRect().top) * 0.9) : 0 });
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [worldOn, entered, engine]);

  /* panels: block walking keys, keep the picture clear of the panel */
  useEffect(() => {
    const w = worldRef.current; if (!w || engine !== 'ready') return undefined;
    w.setInputBlocked(!!sheet);
    rootRef.current?.classList.toggle('sheet-open', !!sheet);
    if (!sheet) { w.setViewInset(0, 0); w.clearFocus(); return undefined; }
    const update = () => {
      if (window.innerWidth >= 900) { w.setViewInset(SIDE_PANEL, 0); return; }
      const el = rootRef.current?.querySelector('.pw-sheet.open');
      w.setViewInset(0, (el?.offsetHeight || 0) * (sheet === 'help' || sheet === 'hop' ? 0.35 : 0.5));
    };
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', update); };
  }, [sheet, worldOn, engine]);

  const closeSheet = useCallback(() => { setSheet(null); setPlot(null); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, closeSheet]);

  /* leaving for another Sellio page; coming back puts you where you were */
  const go = useCallback((url) => {
    const p = worldRef.current?.getPlayer();
    if (p && enteredRef.current) try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ ...p, t: Date.now() })); } catch { /* storage unavailable */ }
    navigate(url);
  }, [navigate]);
  const linkAction = useCallback((key) => {
    const url = backend.links?.[key];
    if (url) { go(url); return; }
    if (key === 'signIn' && backend.signIn) { closeSheet(); backend.signIn(); return; }
    push(`In Sellio, this opens ${LINK_WORDS[key] || 'the next step'}.`);
  }, [backend, go, closeSheet, push]);

  /* rewards feedback */
  const celebrateUnlocks = useCallback((list) => {
    (list || []).forEach((a, i) => setTimeout(() => {
      push(`Badge unlocked: ${a.name}${a.reward ? ` · +${a.reward} coins` : ''}`, { kind: 'reward', icon: 'trophy', duration: 3600 });
      worldRef.current?.celebrate();
    }, 500 + i * 900));
  }, [push]);
  useEffect(() => {
    if (!game.levelUp) return;
    push(`Explorer level ${game.levelUp}!`, { kind: 'reward', icon: 'trophy' });
    worldRef.current?.celebrate();
    game.clearLevelUp();
  }, [game.levelUp, game, push]);
  const chipPop = useCallback((text) => {
    const chip = rootRef.current?.querySelector('.pw-coins');
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    popAt(fxRef.current, r.left + r.width / 2, r.bottom + 18, text);
    setBump((n) => n + 1);
  }, []);
  useEffect(() => {
    if (game.sessionError && game.sessionError !== 'street_closed' && game.sessionError !== 'not_signed_in') {
      push("Couldn't load your coins.", { action: { label: 'Try again', onClick: () => game.refreshSession() }, duration: 8000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.sessionError]);

  /* entering, hopping and looking around */
  const showArea = useCallback((key) => {
    if (!key || !PLACE_NAMES[key]) return;
    const d = districts.find((x) => x.key === key);
    setArea({ title: PLACE_NAMES[key], sub: d ? (d.status === 'soon' ? 'Coming soon' : d.note) : '', show: true });
  }, [districts]);
  useEffect(() => { if (!area.show) return undefined; const id = setTimeout(() => setArea((a) => ({ ...a, show: false })), 2600); return () => clearTimeout(id); }, [area]);
  const enter = useCallback((key, opts) => {
    const w = worldRef.current; if (!w || engine !== 'ready') return;
    closeSheet();
    setEntered(true);
    w.enter(key, opts);
    try { w.sfx.warm(); } catch { /* audio unavailable */ }
  }, [engine, closeSheet]);
  const peek = useCallback((key) => {
    const d = DISTRICTS.find((x) => x.key === key);
    worldRef.current?.flyToDistrict(key);
    if (d?.status === 'soon') push(`${d.name} is coming soon. Take a look around.`);
  }, [push]);
  const hop = useCallback((key) => { closeSheet(); worldRef.current?.hopTo(key); }, [closeSheet]);
  const overview = useCallback(() => { closeSheet(); setEntered(false); setHere(null); worldRef.current?.showOverview(); }, [closeSheet]);
  useEffect(() => {
    const r = returning.current;
    if (!r || entered || engine !== 'ready' || game.phase !== 'ready') return;
    returning.current = null;
    enter(r.district || 'plaza', { instant: true, at: { x: r.x, y: r.y, heading: r.heading } });
    setHintGone(true);
  }, [engine, game.phase, entered, enter]);

  /* what the world reports */
  handlers.current = {
    onReady: () => setEngine('ready'),
    onFailed: () => setEngine('failed'),
    onDistrictTap: (key) => {
      const d = DISTRICTS.find((x) => x.key === key);
      if (!entered) { if (!d || d.status === 'soon') peek(key); else enter(key); return; }
      if (key === here) return;
      if (d?.status === 'soon') { setSoonKey(key); setSheet('soon'); return; }
      hop(key);
    },
    onComingSoonTap: (key) => { setSoonKey(key); setSheet('soon'); },
    onStorefrontTap: (s) => { setStoreId(s.tenant_id); setSheet('store'); worldRef.current?.focusStorefront(s.tenant_id, true); },
    onFnbPlotTap: (p) => { setSheet('fnbplot'); worldRef.current?.focusFnbPlot(p.index); },
    onStallTap: (s) => { setShopId(s.tenant_id); setSheet('stall'); worldRef.current?.focusStall(s.tenant_id, true); },
    onPlotTap: (p) => { setPlot(p); setSheet('plot'); worldRef.current?.focusPlot(p.slot); },
    onPadTap: () => setSheet('hop'),
    onCoinCollect: (c) => {
      popAt(fxRef.current, c.screen.x, c.screen.y, `+${c.value}`, c.value === 5 || c.night);
      setBump((n) => n + 1);
      game.claimDrop({ id: c.id, value: c.value }).then((r) => {
        worldRef.current?.confirmDrop(c.id);
        celebrateUnlocks(r?.unlocked);
      }, (e) => {
        if (e.hint === 'drop_gone') { worldRef.current?.confirmDrop(c.id); return; }
        worldRef.current?.rejectDrop(c.id);
        push(e.message);
        if (e.hint === 'not_signed_in') game.reload();
      });
    },
    onCoinBlocked: () => {
      if (!signInShown.current) { signInShown.current = true; setSheet('signin'); return; }
      push('Sign in to collect Sellio Coins.', { action: { label: 'Sign in', onClick: () => linkAction('signIn') } });
    },
    onCanvasTap: () => {
      if (!sheet) return false;
      closeSheet();
      return sheet !== 'stall' && sheet !== 'store'; // after a shop's sheet, the tap still walks
    },
    onFirstMove: () => {
      if (game.canCollect && here === 'popup') {
        setHint('Walk over coins to collect them');
        setTimeout(() => setHintGone(true), 4200);
      } else setTimeout(() => setHintGone(true), 1500);
    },
    onFollowChange: (on) => setFollowing(on),
    onDistrictChange: (key) => { setHere(key); if (key) showArea(key); },
    onContextLost: () => setGfxLost(true),
  };

  /* actions */
  const visitedToday = (s) => !!s && !!game.profile?.visited_today?.includes(s.tenant_id);
  async function visit(s) {
    if (!s) return;
    const url = backend.links?.storefront?.(s.slug);
    const claim = game.canCollect && !s.mine && !visitedToday(s) && (game.profile?.visits_left ?? 0) > 0;
    if (claim) {
      setBusy(true);
      try {
        const r = await game.claimVisit(s);
        if (r.ok) {
          worldRef.current?.sfx.visit();
          chipPop(`+${r.value}`);
          push(`+${r.value} coins for today's visit to ${(s.name || '').trim()}`, { kind: 'reward' });
          celebrateUnlocks(r.unlocked);
        }
      } catch (e) { push(e.message); }
      finally { setBusy(false); }
    }
    if (url) setTimeout(() => go(url), claim ? 900 : 0);
    else push(`In Sellio, this opens ${(s.name || '').trim()}'s storefront.`);
  }

  const openStyle = useCallback(() => {
    if (!game.myShopId) return;
    setSheet('style');
    worldRef.current?.focusStall(game.myShopId, false);
    game.loadStall().catch((e) => push(e.message));
  }, [game, push]);
  const onPreview = useCallback((style) => {
    if (!game.myShopId) return;
    worldRef.current?.setStallStyle(game.myShopId, style || myShop?.style);
  }, [game.myShopId, myShop]);
  async function buy(item) {
    setBusy(true);
    try {
      const s = await game.buy(item.id);
      worldRef.current?.burstAtStall(game.myShopId);
      push(`Unlocked ${item.name}. It's on your stall now.`, { kind: 'reward' });
      celebrateUnlocks(s.unlocked);
      return true;
    } catch (e) { worldRef.current?.sfx.nope(); push(e.message); return false; }
    finally { setBusy(false); }
  }
  async function equip(item) {
    setBusy(true);
    try { await game.equip(item.id); worldRef.current?.sfx.tap(); }
    catch (e) { push(e.message); }
    finally { setBusy(false); }
  }
  async function claimDaily() {
    setBusy(true);
    try {
      const r = await game.claimDaily();
      if (r.ok) { chipPop(`+${r.value}`); worldRef.current?.celebrate(); push(`Day ${r.streak} reward: +${r.value} coins`, { kind: 'reward' }); celebrateUnlocks(r.unlocked); }
    } catch (e) { push(e.message); }
    finally { setBusy(false); }
  }
  async function claimMission(m) {
    setBusy(true);
    try {
      const r = await game.claimMission(m.code);
      if (r.ok) {
        chipPop(`+${r.value + (r.bonus || 0)}`); worldRef.current?.celebrate();
        push(r.bonus ? `All missions done: +${r.value} and a +${r.bonus} bonus` : `Mission done: +${r.value} coins`, { kind: 'reward' });
      }
    } catch (e) { push(e.message); }
    finally { setBusy(false); }
  }
  function walkTo(s) {
    closeSheet();
    const fnbShop = fnbShops.some((x) => x.tenant_id === s.tenant_id);
    setTimeout(() => { if (fnbShop) worldRef.current?.walkToStorefront(s.tenant_id); else worldRef.current?.walkToStall(s.tenant_id); }, 50);
  }

  /* the main button changes with who is playing */
  const primary = useMemo(() => {
    // (before Pop-up Street opens, only people without a shop see it closed)
    if (closed) return { label: 'Open a free shop', icon: 'shop', onClick: () => linkAction(viewer === 'guest' ? 'join' : 'openShop') };
    if (viewer === 'guest') return { label: 'Sign in to collect', icon: 'signin', onClick: () => setSheet('signin') };
    if (viewer === 'owner') return { label: 'Style my stall', icon: 'style', onClick: openStyle };
    if (viewer === 'owner-not-live') return { label: 'Finish my shop', icon: 'shop', onClick: () => linkAction('shopSetup') };
    return { label: "Today's rewards", icon: 'daily', onClick: () => setSheet('daily') };
  }, [closed, viewer, linkAction, openStyle]);

  const hubState = engine === 'failed' || game.phase === 'error' ? 'error' : engine === 'ready' && game.phase === 'ready' ? 'ready' : 'loading';
  const hubError = engine === 'failed' ? "This browser couldn't start 3D graphics. Try another browser or device." : game.loadError;
  const p = game.profile;
  const levelProgress = p?.next_level_at ? Math.min(1, p.lifetime / p.next_level_at) : 1;
  const soonDistrict = DISTRICTS.find((d) => d.key === soonKey) || null;
  const list = here === 'fnb' ? { title: 'Storefronts on the boulevard', items: fnbShops }
    : here === 'popup' ? { title: 'Stalls on the street today', items: shops }
      : { title: 'Cafés and restaurants', items: fnbShops };

  const ui = (
    <div className="pw" ref={rootRef}>
      <div className="pw-stage" ref={stageRef} />
      <div className="pw-fx" ref={fxRef} aria-hidden="true" />
      {entered && (
        <>
          <Hud onMap={() => setSheet('hop')} place={PLACE_NAMES[here] || 'Exploring'} balance={game.balance ?? 0} level={p?.level ?? 1} levelProgress={levelProgress}
            showSignIn={!game.user && !closed} canEarn={!!p} claimable={game.claimable} onCoins={() => setSheet('daily')}
            onSignIn={() => setSheet('signin')} bumpKey={bump} />
          {game.mode === 'preview' && !sheet && here === 'popup' && <div className="pw-preview-tag">Preview · only shop owners see the street until it opens</div>}
          <AreaTitle {...area} />
          <p className={`pw-hint${hintGone ? ' gone' : ''}`}>{hint}</p>
          <Dock primary={primary} following={following} onRecentre={() => worldRef.current?.recentre()} onHelp={() => setSheet('help')} />
        </>
      )}
      <Toasts toasts={toasts} dismiss={dismiss} />

      <StallSheet open={sheet === 'stall'} shop={shop} onClose={closeSheet} onVisit={() => visit(shop)} onStyle={openStyle} busy={busy}
        signedIn={!!game.user} canEarn={game.canCollect} visited={visitedToday(shop)} visitsLeft={p?.visits_left ?? 0} reward={p?.visit_reward ?? 2} />
      <StorefrontSheet open={sheet === 'store'} shop={store} onClose={closeSheet} onVisit={() => visit(store)} busy={busy}
        signedIn={!!game.user} canEarn={game.canCollect} visited={visitedToday(store)} visitsLeft={p?.visits_left ?? 0} reward={p?.visit_reward ?? 2} />
      <FnbPlotSheet open={sheet === 'fnbplot'} onClose={closeSheet} onAction={linkAction} />
      <ComingSoonSheet open={sheet === 'soon'} district={soonDistrict} onClose={closeSheet} onLook={() => { closeSheet(); if (soonKey) peek(soonKey); }} />
      <HopSheet open={sheet === 'hop'} onClose={closeSheet} districts={hopList} here={here} onHop={hop}
        onPeek={(k) => { closeSheet(); setSoonKey(k); peek(k); }} onOverview={overview} list={list} onWalk={walkTo} />
      <StylePanel open={sheet === 'style'} stall={game.stall} shopName={myShop?.name || ''} balance={game.balance ?? 0} busy={busy}
        onClose={closeSheet} onPreview={onPreview} onBuy={buy} onEquip={equip} />
      <DailyPanel open={sheet === 'daily'} profile={p} busy={busy} onClose={closeSheet} onClaimDaily={claimDaily} onClaimMission={claimMission} />
      <HelpSheet open={sheet === 'help'} onClose={closeSheet} themeChoice={themeChoice} onTheme={setThemeChoice}
        sound={sound} onSound={(on) => { worldRef.current?.sfx.setEnabled(on); setSound(on); }}
        saver={saver} onSaver={(on) => { worldRef.current?.setQuality(on ? 'saver' : 'auto'); setSaver(on); }}
        signedIn={!!game.user} onReset={onReset ? () => { onReset(); game.reload(); closeSheet(); } : null} />
      <PlotSheet open={sheet === 'plot'} plot={plot} viewer={viewer} minShops={street?.min_shops ?? 30} liveCount={street?.shops_live ?? 0}
        onClose={closeSheet} onAction={linkAction} />
      <SignInSheet open={sheet === 'signin'} onClose={closeSheet} onAction={(k) => linkAction(k === 'signin' ? 'signIn' : 'join')} />

      <Hub gone={entered} state={hubState} error={hubError} districts={districts}
        onEnter={(k) => enter(k)} onPeek={peek} onRetry={() => (engine === 'failed' ? window.location.reload() : game.reload())} />
      {gfxLost && (
        <div className="pw-overlay" role="alert">
          <div>Graphics paused while the device recovers.<button type="button" className="pw-primary sm" onClick={() => window.location.reload()}>Reload Sellio World</button></div>
        </div>
      )}
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(ui, document.body);
}
