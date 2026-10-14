import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createKit } from '../engine/kit';
import { createFx } from '../engine/fx';
import { createSfx } from '../engine/sfx';
import { REACH, streetGeometry } from '../engine/constants';
import { toLngLat, fromLngLat, pxPerMetre } from './geo';
import { buildLayout, districtAt, DISTRICTS, PLAZA, PAD_RADIUS } from './layout';
import { buildStyle, applyPalette } from './style';
import { createNavGrid } from './navgrid';
import { createThreeLayer } from './threeLayer';
import { glowPointsForMap, setViewportHeight } from './glow';
import { buildProps } from './props';
import { createPopupStreet } from './popup';
import { createStorefrontFactory } from './storefront';
import { createAvatar } from './avatar';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FOLLOW_ZOOM = 21.3;
const STOREFRONT_REACH = 9;
const QUALITY = [{ name: 'high', dpr: 2 }, { name: 'medium', dpr: 1.5 }, { name: 'low', dpr: 1 }];

const LIGHTS = {
  day: { hemi: ['#eef6ff', '#c9d6b4', 1.65], sun: ['#fff2e0', 2.1], dir: [70, 140, 50] },
  dusk: { hemi: ['#ffd6ec', '#5a3a6a', 1.35], sun: ['#ffbe8f', 1.25], dir: [-90, 60, 30] },
};

/**
 * Sellio World: the whole island as a vector map you can pan, zoom, tilt and
 * turn like a Mapbox map, with a 3D layer on top for Mochi, the shops, stalls,
 * coins and everything else. The world draws and animates; the rules live on
 * the server. UI code talks to it through the returned object and hears back
 * through `events`.
 *
 * `layoutInput` ({ popupLayout, popupShops, fnbCount }) fixes the size of
 * Pop-up Street and the number of storefronts; create a new world when those
 * change.
 */
export function createMapWorld(container, {
  layoutInput = {}, events = {}, theme = 'day', reduceMotion = false, coarse = false, debug = false, quality = 'auto',
} = {}) {
  const motion = reduceMotion ? 0 : 1;
  const layout = buildLayout(layoutInput);
  const streetGeo = streetGeometry(layoutInput.popupLayout, layoutInput.popupShops || 0);
  const nav = createNavGrid(layout.bounds, 1);
  nav.fill(layout.inner, 1);
  for (const b of layout.blockers) nav.fill(b, 0);
  for (const w of layout.walkways) nav.fill(w, 1);

  let themeName = theme === 'dusk' ? 'dusk' : 'day';
  let level = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (coarse && window.devicePixelRatio > 2.5) ? 1 : 0;
  let qualityMode = quality;
  const dprFor = () => Math.min(window.devicePixelRatio || 1, QUALITY[qualityMode === 'saver' ? 2 : level].dpr);

  /* ------------------------------------------------------------- the map */
  // Generous bounds: MapLibre keeps the whole view inside them, and a tilted
  // view sees far, so tight bounds would stop you zooming out on a phone.
  const b = layout.bounds, margin = 900;
  const sw = fromLngLat(toLngLat(b.minX - margin, b.minY - margin)), ne = fromLngLat(toLngLat(b.maxX + margin, b.maxY + margin));
  let ovPad = { top: 0, bottom: 0, left: 0, right: 0 }; // room for the welcome screen's cards
  const overview = () => {
    const w = container.clientWidth || window.innerWidth, h = (container.clientHeight || window.innerHeight) - ovPad.top - ovPad.bottom;
    const fit = Math.min(w / 760, (Math.max(200, h) * 1.25) / 640); // px per metre that shows the whole island
    return { center: toLngLat(0, -8), zoom: clamp(Math.log2(fit * 40075016.68557849 / 512), 14.6, 17.4), pitch: 50, bearing: -18, padding: ovPad };
  };
  const map = new maplibregl.Map({
    container, style: buildStyle(layout.features, themeName), ...overview(),
    minZoom: 14.4, maxZoom: 22.6, maxPitch: 72,
    maxBounds: [toLngLat(sw.x, sw.y), toLngLat(ne.x, ne.y)],
    antialias: true, attributionControl: false, keyboard: false, doubleClickZoom: false,
    renderWorldCopies: false, fadeDuration: 0, pixelRatio: dprFor(), dragRotate: true, touchPitch: true,
  });
  map.getCanvas().setAttribute('aria-label', 'Sellio World map. Drag to look around, pinch or scroll to zoom, tap to walk.');
  map.getCanvas().style.outline = 'none';

  /* ------------------------------------------------------- the 3D layer */
  const scene = new THREE.Scene();
  let kit = null, props = null, popup = null, avatar = null, fx = null, factory = null, sfx = createSfx();
  const storefronts = new Map(); // tenant_id -> storefront
  const fnbPlotObjects = [];
  let ready = false, started = false, destroyed = false, frames = 0;
  const hemi = new THREE.HemisphereLight(); scene.add(hemi);
  const sun = new THREE.DirectionalLight(); scene.add(sun, sun.target);

  const three = createThreeLayer({
    scene,
    onContext(renderer) {
      kit = createKit(renderer);
      kit.glowPoints = glowPointsForMap(kit);
      props = buildProps(kit, scene, layout, { motion });
      popup = createPopupStreet(kit, scene, { motion, coarse });
      popup.setStreet(pendingStreet || { shops: [], mode: 'closed', liveCount: 0 }, streetGeo);
      pendingStreet = null;
      factory = createStorefrontFactory(kit);
      fx = createFx(kit, scene, { motion });
      avatar = createAvatar(kit, scene, { motion, nav, isStreet: (x, y) => districtAt(x, y, layout) === 'popup' });
      avatar.place(PLAZA.pad[0], PLAZA.pad[1] - 4, Math.PI);
      avatar.setHidden(true);
      setFnbShops(pendingFnb || []);
      applyTheme();
      ready = true;
    },
    beforeRender(camera, gl) { setViewportHeight(gl.drawingBufferHeight); },
  });
  map.on('load', () => {
    if (destroyed) return;
    try { map.addLayer(three.layer); }
    catch (e) { console.error('Sellio World could not start 3D graphics', e); events.onFailed?.(e); }
    for (const m of labelMarkers) m.addTo(map);
    start();
  });
  map.on('error', (e) => { if (debug) console.warn('map error', e?.error?.message || e); });

  /* -------------------------------------------------- district labels */
  const labelMarkers = [];
  const labelEls = new Map();
  const districtInfo = new Map();
  function makeLabel(d) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `pw-dl ${d.status === 'live' ? 'live' : 'soon'}${d.key === 'plaza' ? ' plaza' : ''}`;
    el.dataset.key = d.key;
    el.innerHTML = '<span class="pw-dl-name"></span><span class="pw-dl-sub"></span>';
    el.querySelector('.pw-dl-name').textContent = d.name;
    el.addEventListener('click', (e) => { e.stopPropagation(); sfx.tap(); events.onDistrictTap?.(d.key); });
    labelEls.set(d.key, el);
    return new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat(toLngLat(d.center[0], d.center[1]));
  }
  for (const d of [...DISTRICTS, { ...PLAZA, status: 'live' }]) labelMarkers.push(makeLabel(d));
  function setDistrictInfo(key, { sub, status } = {}) {
    districtInfo.set(key, { sub, status });
    const el = labelEls.get(key); if (!el) return;
    el.querySelector('.pw-dl-sub').textContent = sub || '';
    if (status) { el.classList.toggle('live', status === 'live'); el.classList.toggle('soon', status !== 'live'); }
  }
  const labelState = new Map();
  function updateLabels() {
    const z = map.getZoom();
    const show = !started ? 1 : clamp((18.9 - z) / 0.8, 0, 1);
    labelMarkers.forEach((m) => {
      const el = m.getElement(), key = el.dataset.key;
      const op = key === 'plaza' && !started ? 0 : Math.round(show * 20) / 20;
      const hub = !started && key !== 'plaza';
      const prev = labelState.get(key);
      if (prev && prev.op === op && prev.hub === hub) return;
      labelState.set(key, { op, hub });
      el.classList.toggle('hub', hub);
      m.setOpacity(String(op));
      el.style.pointerEvents = op > 0.3 ? 'auto' : 'none';
      el.tabIndex = op > 0.3 ? 0 : -1;
    });
  }

  /* ------------------------------------------------------------- shops */
  let pendingFnb = null, pendingStreet = null;
  function setFnbShops(shops) {
    if (!factory) { pendingFnb = shops; return; }
    for (const s of storefronts.values()) s.dispose();
    storefronts.clear();
    for (const o of fnbPlotObjects) o.dispose();
    fnbPlotObjects.length = 0;
    let si = 0;
    for (const p of layout.fnbPlots) {
      if (p.kind === 'garden') continue;
      const shop = p.kind === 'shop' ? shops[si++] : null;
      const obj = shop ? factory.buildStorefront(shop) : factory.buildEmptyPlot(p.index);
      obj.root.position.set(p.x, 0, -p.y); obj.root.rotation.y = p.facing;
      obj.plot = p; obj.hit.userData.plotRef = p;
      scene.add(obj.root);
      if (shop) storefronts.set(shop.tenant_id, obj); else fnbPlotObjects.push(obj);
    }
  }

  /* ----------------------------------------------------------- picking */
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickables() {
    if (!ready) return [];
    return [
      ...[...storefronts.values()].map((s) => s.hit), ...fnbPlotObjects.map((o) => o.hit),
      ...popup.pickables, ...popup.coins.pickables, ...props.pickables,
    ];
  }
  function pick(point) {
    const r = map.getCanvas().getBoundingClientRect();
    ndc.set(point.x / r.width * 2 - 1, -(point.y / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, three.camera);
    return raycaster.intersectObjects(pickables(), false);
  }

  /* --------------------------------------------------- follow camera */
  let following = false, focus = null, inset = { x: 0, y: 0 }, autoSpin = !reduceMotion;
  const setFollow = (on) => {
    on = !!on;
    if (on === following) return;
    following = on;
    for (const h of [map.scrollZoom, map.touchZoomRotate]) { h.disable(); h.enable(on ? { around: 'center' } : undefined); }
    events.onFollowChange?.(on);
  };
  map.on('dragstart', (e) => { if (e.originalEvent) { setFollow(false); focus = null; } });
  // A finger or mouse button is down: the follow camera holds still, because
  // any camera jump would cancel the gesture before it starts.
  let pressing = false;
  map.on('mousedown', () => { pressing = true; });
  map.on('touchstart', () => { pressing = true; });
  const release = (e) => { if (!e.touches || e.touches.length === 0) pressing = false; };
  window.addEventListener('mouseup', release);
  window.addEventListener('touchend', release);
  window.addEventListener('touchcancel', release);
  for (const ev of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart', 'wheel', 'touchstart', 'mousedown']) {
    map.on(ev, (e) => { if (e.originalEvent) autoSpin = false; });
  }
  const mochiLngLat = () => toLngLat(avatar.position.x, avatar.position.y);

  /* -------------------------------------------------------- tapping */
  let pending = null;          // what Mochi is walking to
  let movedOnce = false;
  let blocked = false;
  const firstMove = () => { if (!movedOnce) { movedOnce = true; events.onFirstMove?.(); } };
  const distTo = (x, y) => Math.hypot(avatar.position.x - x, avatar.position.y - y);
  const playerLocal = { x: 0, z: 0 };

  function walk(x, y, target = null) {
    const end = avatar.walkTo(x, y);
    pending = end ? target : null;
    if (end) { fx.mark(end[0], -end[1]); firstMove(); if (!focus) setFollow(true); }
    return end;
  }
  function openStorefront(s) { sfx.tap(); avatar.stop(); events.onStorefrontTap?.(s.shop); }
  function tapStorefront(s) {
    const [dx, dy] = s.plot.door;
    if (distTo(dx, dy) <= STOREFRONT_REACH) openStorefront(s);
    else walk(dx, dy, { kind: 'storefront', id: s.shop.tenant_id });
  }
  function stallInReach(st) { return Math.hypot(playerLocal.x - st.center.x, playerLocal.z - st.center.z) <= REACH; }
  function openStall(st) {
    sfx.tap(); avatar.stop();
    if (st.kind === 'stall') events.onStallTap?.(st.shop); else events.onPlotTap?.({ slot: st.slot, kind: st.plotKind });
  }
  function tapStall(st) {
    if (stallInReach(st)) { openStall(st); return; }
    const m = popup.toMap(st.front.x, st.front.z);
    walk(m.x, m.y, { kind: st.kind, ref: st });
  }
  function tapPad(p) {
    if (distTo(p.x, p.y) <= PAD_RADIUS + 2.5) { sfx.tap(); avatar.stop(); events.onPadTap?.(p.key); }
    else walk(p.x, p.y, { kind: 'pad', key: p.key });
  }

  map.on('click', (e) => {
    if (!ready || !started || blocked || avatar.busy) return;
    if (events.onCanvasTap?.() === true) return;
    sfx.warm();
    for (const h of pick(e.point)) {
      const d = h.object.userData;
      if (d.storefront) { tapStorefront(storefronts.get(d.storefront.tenant_id)); return; }
      if (d.fnbPlot !== undefined) {
        const o = fnbPlotObjects.find((x) => x.hit === h.object);
        if (o && distTo(o.plot.door[0], o.plot.door[1]) <= STOREFRONT_REACH) { sfx.tap(); events.onFnbPlotTap?.({ index: d.fnbPlot }); }
        else if (o) walk(o.plot.door[0], o.plot.door[1], { kind: 'fnbPlot', index: d.fnbPlot, plot: o.plot });
        return;
      }
      if (d.stall) { tapStall(d.stall); return; }
      if (d.plot) { tapStall(d.plot); return; }
      if (d.coin) { const m = popup.toMap(d.coin.x, d.coin.z); walk(m.x, m.y); return; }
      if (d.pad) { tapPad(d.pad); return; }
      if (d.comingSoon) { sfx.tap(); events.onComingSoonTap?.(d.comingSoon); return; }
    }
    const soon = map.queryRenderedFeatures(e.point, { layers: ['buildings'] })[0];
    if (soon) { sfx.tap(); events.onComingSoonTap?.(soon.properties.area); return; }
    const p = fromLngLat([e.lngLat.lng, e.lngLat.lat]);
    if (!walk(p.x, p.y)) sfx.nope();
  });

  // pointer cursor over things you can tap (mouse only)
  let hoverAt = 0;
  map.on('mousemove', (e) => {
    const now = performance.now();
    if (!ready || !started || now - hoverAt < 90) return;
    hoverAt = now;
    const hit = pick(e.point).some((h) => { const d = h.object.userData; return d.storefront || d.fnbPlot !== undefined || d.stall || d.plot || d.pad || d.comingSoon || d.coin; });
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
  });

  /* ---------------------------------------------------------- keys */
  const keys = new Set();
  const KEYMAP = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  const typing = (e) => /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
  function applyKeys() {
    let x = 0, y = 0;
    for (const k of keys) { x += KEYMAP[k][0]; y += KEYMAP[k][1]; }
    avatar?.setKeys(Math.sign(x), Math.sign(y));
    if (x || y) { pending = null; setFollow(true); firstMove(); }
  }
  const onKeyDown = (e) => {
    if (!started || blocked || typing(e) || !KEYMAP[e.code] || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault(); keys.add(e.code); applyKeys();
  };
  const onKeyUp = (e) => { if (keys.delete(e.code)) applyKeys(); };
  const onBlur = () => { keys.clear(); applyKeys(); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /* ---------------------------------------------------------- coins */
  let collectEnabled = true;
  function screenPoint(x, y, alt = 0) {
    const v = new THREE.Vector3(x, alt, -y).project(three.camera);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, visible: v.z < 1 };
  }
  function handleReach(c) {
    if (!collectEnabled) { popup.coins.hop(c.id); sfx.nope(); events.onCoinBlocked?.({ id: c.id, value: c.value }); return; }
    popup.coins.collect(c.id, playerLocal);
    sfx.coin(c.value);
    if (coarse) try { navigator.vibrate?.(8); } catch { /* not allowed */ }
    const m = popup.toMap(c.x, c.z);
    events.onCoinCollect?.({ id: c.id, value: c.value, night: c.night, x: c.x, z: c.z, screen: screenPoint(m.x, m.y, 1.3) });
  }

  /* ------------------------------------------------------- theme */
  function applyTheme() {
    const L = LIGHTS[themeName];
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.dir);
    props?.setTheme(themeName); popup?.setTheme(themeName);
    for (const s of storefronts.values()) s.setTheme?.(themeName);
    if (map.isStyleLoaded()) applyPalette(map, themeName);
  }
  map.on('style.load', () => applyPalette(map, themeName));

  /* -------------------------------------------------------- the loop */
  const clock = new THREE.Clock();
  let raf = 0, acc = 0, ema = 16, slowFor = 0, lastChange = 0, district = null, spinAt = 0;
  let fastTest = false; // tests on software rendering run in real time instead of slow motion
  const camPos = new THREE.Vector3();
  function tick() {
    raf = requestAnimationFrame(tick);
    const raw = clock.getDelta();
    if (qualityMode === 'saver') { acc += raw; if (acc < 1 / 31) return; }
    const step = qualityMode === 'saver' ? acc : raw; acc = 0;
    const dt = Math.min(step, fastTest ? 0.3 : 0.05), t = clock.elapsedTime;
    if (ready) {
      // Mochi
      let nearest = null;
      Object.assign(playerLocal, popup.toLocal(avatar.position.x, avatar.position.y));
      const n = popup.coins.nearest(playerLocal);
      if (n) { const m = popup.toMap(n.x, n.z); nearest = { x: m.x, y: m.y, dist: n.dist }; }
      const ev = avatar.update(dt, t, { camera: three.camera, nearestCoin: started ? nearest : null, cameraBearing: map.getBearing() });
      Object.assign(playerLocal, popup.toLocal(avatar.position.x, avatar.position.y));
      if (ev === 'arrived' && pending) arrive(pending);
      // coins
      const reached = popup.coins.update(dt, t, started && !avatar.busy ? playerLocal : { x: 1e6, z: 1e6 });
      for (const c of reached) handleReach(c);
      // everything else
      props.update(dt, t, three.camera);
      popup.update(dt, t, three.camera, playerLocal);
      camPos.copy(three.camera.position);
      const target = focus?.target || [avatar.position.x, avatar.position.y];
      for (const s of [...storefronts.values(), ...fnbPlotObjects]) {
        s.setNear?.(camPos.distanceTo(s.root.position) < 80);
        // cut away a building that stands between the camera and what it looks at
        const cut = camPos.y < 34 && blocksView(s.plot, camPos.x, -camPos.z, target[0], target[1]);
        s.cutK = (s.cutK || 0) + ((cut ? 1 : 0) - (s.cutK || 0)) * Math.min(1, dt * 7);
        s.root.scale.y = Math.max(0.02, 1 - s.cutK);
        s.root.visible = s.cutK < 0.97;
      }
      fx.update(dt);
      const dNow = started ? districtAt(avatar.position.x, avatar.position.y, layout) : null;
      if (dNow !== district) { district = dNow; events.onDistrictChange?.(district); }
    }
    // camera
    // (jumpTo cancels gestures, so the camera only follows between them)
    if (started && following && !focus && avatar && !pressing && !map.isMoving() && !map.isEasing()) {
      const c = map.getCenter(), want = mochiLngLat();
      const k = 1 - Math.exp(-dt * (avatar.moving ? 7 : 4));
      const lng = c.lng + (want[0] - c.lng) * k, lat = c.lat + (want[1] - c.lat) * k;
      if (Math.abs(lng - c.lng) > 1e-10 || Math.abs(lat - c.lat) > 1e-10) map.jumpTo({ center: [lng, lat] });
    }
    if (!started && autoSpin && !map.isMoving() && t > spinAt) map.setBearing(map.getBearing() + dt * 2.2);
    updateLabels();
    map.triggerRepaint();

    if (++frames === 4) events.onReady?.();
    ema = ema * 0.92 + raw * 1000 * 0.08;
    const now = performance.now();
    if (qualityMode === 'auto' && level < 2 && frames > 120 && now - lastChange > 5000) {
      slowFor = ema > 28 ? slowFor + raw : 0;
      if (slowFor > 2) { level++; slowFor = 0; lastChange = now; map.setPixelRatio(dprFor()); events.onQualityChange?.(QUALITY[level].name); }
    }
  }
  function start() { if (!raf && !destroyed) { clock.getDelta(); raf = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);
  const canvas = map.getCanvas();
  const onLost = (e) => { e.preventDefault(); stop(); events.onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  // Does the straight line from (ax, ay) to (bx, by) cross this plot (and the
  // target is not inside it)? Liang-Barsky clipping against the plot's box.
  function blocksView(p, ax, ay, bx, by) {
    const x0 = p.x - p.w / 2 - 0.5, x1 = p.x + p.w / 2 + 0.5, y0 = p.y - p.d / 2 - 0.5, y1 = p.y + p.d / 2 + 0.5;
    if (bx > x0 && bx < x1 && by > y0 && by < y1) return false;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [pp, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (pp === 0) { if (q < 0) return false; continue; }
      const r = q / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 < t1 && t1 > 0.02;
  }

  function arrive(p) {
    pending = null;
    if (p.kind === 'storefront') { const s = storefronts.get(p.id); if (s) { openStorefront(s); focusOn(s.plot); } }
    else if (p.kind === 'fnbPlot') { sfx.tap(); events.onFnbPlotTap?.({ index: p.index }); focusOn(p.plot); }
    else if (p.kind === 'stall' || p.kind === 'plot') { if (stallInReach(p.ref)) openStall(p.ref); }
    else if (p.kind === 'pad') { sfx.tap(); events.onPadTap?.(p.key); }
  }

  /* ------------------------------------------------- camera moves */
  function viewFor(key) {
    const wide = !narrow();
    if (key === 'plaza') return { center: toLngLat(PLAZA.pad[0], PLAZA.pad[1] - 6), zoom: zoomForDistance(wide ? 120 : 150), pitch: 56, bearing: 0 };
    const d = DISTRICTS.find((x) => x.key === key);
    return { center: toLngLat(d.pad[0], d.pad[1]), zoom: zoomForDistance(wide ? 52 : 72), pitch: d.view.pitch + 2, bearing: d.view.bearing };
  }
  function padFor(key) { return layout.pads.find((p) => p.key === key); }
  // which way Mochi faces on arrival (three.js y rotation: 0 faces south)
  const headingFor = (key) => ({ popup: 0, fnb: -Math.PI / 2, plaza: Math.PI }[key] ?? Math.PI);
  // the zoom that puts MapLibre's camera `d` metres from the centre of the view
  const zoomForDistance = (d) => {
    const h = map.getCanvas().clientHeight || 800;
    return clamp(Math.log2((0.5 / Math.tan(0.6435 / 2)) * h / d * 40075016.68557849 / 512), 15, 22.6);
  };
  const narrow = () => (container.clientWidth || 1) / (container.clientHeight || 1) < 0.8;
  function focusOn(plot, close = true) {
    // Frame a storefront's facade from the boulevard (the row behind the camera
    // is cut away). The map centres on the ground, so aim at the ground point
    // behind the facade that lines up with its middle: then the whole front
    // sits in the middle of the view.
    const pitch = 66, behind = 4.6 / Math.tan((90 - pitch) * Math.PI / 180);
    const target = [plot.x, plot.front + plot.side * behind];
    const d = (narrow() ? 40 : 30) * (close ? 1 : 1.25);
    const go = (duration) => map.easeTo({ center: toLngLat(target[0], target[1]), zoom: zoomForDistance(d + behind), pitch, bearing: plot.side > 0 ? 0 : 180, duration: reduceMotion ? 0 : duration, padding: padding() });
    focus = { kind: 'storefront', target, redo: () => go(600) };
    go(900);
  }
  function focusStreet(st, close = true) {
    const m = popup.toMap(st.center.x * 1.15, st.center.z); // a little behind the stall, so it sits mid-view
    focus = { kind: 'stall', target: [m.x, m.y] };
    // Stalls face across the street: look at them from the other side.
    const bearing = st.side > 0 ? 270 : 90;
    const d = (narrow() ? 22 : 16) * (close ? 1 : 1.3);
    const go = (duration) => map.easeTo({ center: toLngLat(m.x, m.y), zoom: zoomForDistance(d), pitch: 62, bearing, duration: reduceMotion ? 0 : duration, padding: padding() });
    focus.redo = () => go(600);
    go(900);
  }
  // a side panel (desktop) or bottom sheet (phone) covers part of the map
  const padding = () => ({ left: 0, right: inset.x * 2, top: 0, bottom: inset.y * 2 });

  function enter(key = 'plaza', { instant = false, at = null } = {}) {
    const pad = padFor(key) || padFor('plaza');
    const first = !started;
    started = true; autoSpin = false;
    const v = viewFor(pad.key);
    const heading = headingFor(pad.key);
    if (first && at) {
      // coming back from a storefront: straight back to where Mochi stood
      avatar.place(at.x, at.y, at.heading ?? heading);
      avatar.setHidden(false);
      map.jumpTo({ center: mochiLngLat(), zoom: FOLLOW_ZOOM, pitch: 60, bearing: v.bearing, padding: padding() });
      setFollow(true); focus = null;
      return;
    }
    if (first) {
      avatar.setHidden(true);
      avatar.place(pad.x, pad.y, heading);
      if (instant) { map.jumpTo({ ...v, padding: padding() }); avatar.setHidden(false); }
      else {
        map.flyTo({ ...v, padding: padding(), duration: reduceMotion ? 0 : 2200, curve: 1.3, essential: true });
        avatar.hop({ x: pad.x, y: pad.y, heading }, () => avatar.setHidden(false), reduceMotion ? 0 : 1.9);
      }
      setFollow(true);
      sfx.warm();
    } else hopTo(pad.key);
    focus = null;
  }
  function hopTo(key) {
    const pad = padFor(key); if (!pad || !started) return;
    const v = viewFor(key);
    const heading = headingFor(key);
    pending = null; focus = null;
    sfx.hop?.();
    avatar.hop({ x: pad.x, y: pad.y, heading }, () => {
      map.flyTo({ ...v, padding: padding(), duration: reduceMotion ? 0 : 1500, curve: 1.4, essential: true });
    }, reduceMotion ? 0.1 : 1.35);
    setFollow(true);
  }
  function showOverview() {
    started = false; autoSpin = !reduceMotion; spinAt = clock.elapsedTime + 2.5; focus = null; pending = null;
    avatar?.stop(); setFollow(false);
    map.flyTo({ ...overview(), duration: reduceMotion ? 0 : 1800, essential: true });
  }

  const api = {
    map, sfx,
    get layout() { return layout; },
    setStreet(data) { if (popup) popup.setStreet(data, streetGeo); else pendingStreet = data; },
    setFnbShops,
    setDistrictInfo,
    setDrops(drops, opts) { popup?.coins.set(drops || [], opts); },
    confirmDrop(id) { popup?.coins.remove(id); },
    rejectDrop(id) { popup?.coins.restore(id); sfx.nope(); },
    setCollectEnabled(on) { collectEnabled = !!on; },
    coinCount: () => popup?.coins.count() ?? 0,
    setStallStyle(tenantId, style) { popup?.stalls.get(tenantId)?.setStyle(style); },
    focusStall(tenantId, close = true) { const s = popup?.stalls.get(tenantId); if (s) focusStreet(s, close); },
    focusPlot(slot) { const p = popup?.plots.find((x) => x.slot === slot); if (p) focusStreet(p, true); },
    focusStorefront(tenantId, close = true) { const s = storefronts.get(tenantId); if (s) focusOn(s.plot, close); },
    focusFnbPlot(index) { const p = layout.fnbPlots[index]; if (p) focusOn(p, true); },
    clearFocus() {
      if (!focus) return;
      focus = null;
      if (started) { setFollow(true); map.easeTo({ center: mochiLngLat(), zoom: Math.min(map.getZoom(), FOLLOW_ZOOM + 0.3), pitch: 60, duration: reduceMotion ? 0 : 700, padding: padding() }); }
    },
    walkToStall(tenantId) { const s = popup?.stalls.get(tenantId); if (s && started) { focus = null; tapStall(s); } },
    walkToStorefront(tenantId) { const s = storefronts.get(tenantId); if (s && started) { focus = null; tapStorefront(s); } },
    burstAtStall(tenantId) {
      const s = popup?.stalls.get(tenantId); if (!s) return;
      const m = popup.toMap(s.side * 4.8, s.z); fx.burst(new THREE.Vector3(m.x, 2.6, -m.y)); sfx.unlock();
    },
    celebrate() { if (!avatar) return; fx.burst(new THREE.Vector3(avatar.position.x, 2, -avatar.position.y), 16); sfx.reward(); },
    setViewInset(x, y) {
      if (x === inset.x && y === inset.y) return;
      inset = { x, y };
      // A new camera move would cancel one in progress: re-aim the current
      // close-up with the new padding instead.
      if (focus?.redo) focus.redo();
      else map.easeTo({ padding: padding(), duration: reduceMotion ? 0 : 350 });
    },
    setInputBlocked(on) { blocked = !!on; if (blocked) { keys.clear(); applyKeys(); } },
    follow(on = true) { focus = null; setFollow(on); },
    get following() { return following; },
    recentre() {
      focus = null; setFollow(true);
      map.easeTo({ center: mochiLngLat(), zoom: clamp(map.getZoom(), FOLLOW_ZOOM - 1.2, FOLLOW_ZOOM + 0.8), pitch: Math.max(50, map.getPitch()), duration: reduceMotion ? 0 : 700, padding: padding() });
    },
    enter, hopTo, showOverview,
    flyToDistrict(key) {
      const d = DISTRICTS.find((x) => x.key === key) || { center: PLAZA.center, view: { zoom: 18.5, pitch: 55, bearing: 0 } };
      autoSpin = false;
      map.flyTo({ center: toLngLat(d.center[0], d.center[1]), zoom: d.view.zoom, pitch: d.view.pitch, bearing: d.view.bearing, duration: reduceMotion ? 0 : 1600, essential: true, padding: padding() });
    },
    zoomBy(delta) { map.easeTo({ zoom: map.getZoom() + delta, duration: 250 }); },
    setOverviewPadding(p) {
      ovPad = { top: 0, bottom: 0, left: 0, right: 0, ...p };
      if (!started) { const o = overview(); map.jumpTo({ center: o.center, zoom: o.zoom, padding: o.padding }); }
    },
    get started() { return started; },
    get district() { return district; },
    placePlayer(x, y, heading = Math.PI) { avatar?.place(x, y, heading); },
    getPlayer() { return avatar ? { x: avatar.position.x, y: avatar.position.y, heading: avatar.state.heading, district } : null; },
    setTheme(name) { themeName = name === 'dusk' ? 'dusk' : 'day'; applyTheme(); },
    get theme() { return themeName; },
    setQuality(mode) { qualityMode = mode === 'saver' ? 'saver' : 'auto'; map.setPixelRatio(dprFor()); events.onQualityChange?.(qualityMode === 'saver' ? 'saver' : QUALITY[level].name); },
    get quality() { return qualityMode; },
    screenPoint,
    dispose() {
      destroyed = true; stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
      window.removeEventListener('mouseup', release); window.removeEventListener('touchend', release); window.removeEventListener('touchcancel', release);
      canvas.removeEventListener('webglcontextlost', onLost);
      sfx.dispose();
      for (const s of storefronts.values()) s.dispose();
      for (const o of fnbPlotObjects) o.dispose();
      popup?.dispose(); props?.dispose(); avatar?.dispose(); fx?.dispose(); factory?.dispose(); kit?.dispose();
      for (const m of labelMarkers) m.remove();
      try { map.remove(); } catch { /* already gone */ }
      if (debug && window.__world === api) delete window.__world;
    },
  };
  if (debug) {
    api.debug = {
      scene, camera: three.camera, nav, layout, get avatar() { return avatar; }, get popup() { return popup; }, storefronts,
      get renderer() { return three.renderer; },
      teleport(x, y) { avatar?.place(x, y); },
      setFast(on) { fastTest = !!on; },
      walkTo(x, y) { return walk(x, y); },
      // checks the 3D camera against MapLibre's own projection (pixels apart)
      projectionError() {
        let worst = 0;
        for (const [x, y, alt] of [[0, 0, 0], [-150, -80, 0], [110, -60, 5], [-170, 150, 20]]) {
          const a = screenPoint(x, y, alt), r = map.getCanvas().getBoundingClientRect();
          const bb = map.project(toLngLat(x, y));
          if (alt) continue;
          worst = Math.max(worst, Math.hypot(a.x - r.left - bb.x, a.y - r.top - bb.y));
        }
        return worst;
      },
      pxPerMetre: () => pxPerMetre(map.getZoom()),
    };
    window.__world = api;
  }
  return api;
}
