import * as THREE from 'three';
import { rr, fitFont, rng } from '../engine/kit';
import { THEMES, ARCH_Z, FONT_DISPLAY, STALL_W, REACH } from '../engine/constants';
import { createStallFactory } from '../engine/stall';
import { createCoinField } from '../engine/coins';
import { createGlowPoints } from './glow';
import { STREET_X, STREET_ENTRANCE_Y } from './layout';

const TAU = Math.PI * 2;
const FACADES = [['#f6c9a8', '#3c8c7a'], ['#bfe3d0', '#a2443b'], ['#f7e3a1', '#3a6fa8'], ['#c9d3f5', '#3c8c7a'], ['#f4b8c8', '#3a6fa8'], ['#d7c4ef', '#a2443b']];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NEAR_DIST = 34;

/**
 * Pop-up Street on the island: paving, shophouses, the arch, string lights,
 * the stalls and the coins. It is built in the street's own frame (x across,
 * z along, the entrance at +z), the same frame the server uses for coin
 * positions, and placed on the map facing the plaza.
 */
export function createPopupStreet(kit, scene, { motion = 1, coarse = false } = {}) {
  const { G, T, RY, S, mm, mergeParts, std, mesh } = kit;
  const root = new THREE.Group(); root.name = 'popup-street';
  root.rotation.y = Math.PI;
  scene.add(root);
  const factory = createStallFactory(kit, { motion });
  const coins = createCoinField(kit, root, { coarse, motion });
  const labels = new THREE.Group(); root.add(labels);
  let env = null, geo = null, floors = null, themeName = 'day';
  const stalls = new Map();
  let plots = [];
  let pickables = [];

  // street-local position <-> map metres
  const toLocal = (mx, my) => ({ x: STREET_X - mx, z: my + (geo.walkZMax - STREET_ENTRANCE_Y) });
  const toMap = (x, z) => ({ x: STREET_X - x, y: z - (geo.walkZMax - STREET_ENTRANCE_Y) });

  /* the street's fixed parts, rebuilt when its length changes */
  function buildEnv() {
    const own = [];
    const keep = (o) => { own.push(o); return o; };
    const tex = (...a) => keep(kit.untrack(kit.canvasTex(...a)));
    const g = new THREE.Group(); root.add(g);
    const length = 22 - geo.farZ, midZ = (22 + geo.farZ) / 2;

    const streetMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.92 }));
    const street = new THREE.Mesh(G.plane, streetMat); street.scale.set(8.2, length, 1);
    street.rotation.x = -Math.PI / 2; street.position.set(0, 0.02, midZ); g.add(street);
    const sideMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(G.plane, sideMat); side.scale.set(5, length, 1);
      side.rotation.x = -Math.PI / 2; side.position.set(s * 6.6, 0.018, midZ); g.add(side);
      const kerb = mesh(G.box, std('#ecd9d2'), false); kerb.scale.set(0.22, 0.12, length); kerb.position.set(s * 4.1, 0.06, midZ); g.add(kerb);
    }
    let paverTex = null, sideTex = null;
    const paint = () => {
      const th = THEMES[themeName];
      paverTex?.dispose(); sideTex?.dispose();
      paverTex = kit.untrack(kit.canvasTex(256, 256, (c) => {
        const r = rng(7);
        c.fillStyle = th.paver.base; c.fillRect(0, 0, 256, 256);
        for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) { c.fillStyle = th.paver.tiles[Math.floor(r() * th.paver.tiles.length)]; rr(c, col * 64 + (row % 2) * 32 + 2, row * 32 + 2, 60, 28, 4); c.fill(); }
      }, [3, length / 2.77]));
      sideTex = kit.untrack(kit.canvasTex(128, 128, (c) => {
        c.fillStyle = th.side.base; c.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? th.side.a : th.side.b; c.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
      }, [2, length / 2.57]));
      streetMat.map = paverTex; streetMat.needsUpdate = true;
      sideMat.map = sideTex; sideMat.needsUpdate = true;
    };

    /* shophouses either side */
    const facadeMats = FACADES.map(([wall, shutter], i) => {
      const r = rng(100 + i); const lit = [];
      for (let k = 0; k < 6; k++) lit.push(r() < 0.45);
      const drawWindows = (c, emissive) => {
        [44, 168].forEach((y, ri) => [34, 106, 178].forEach((x, ci) => {
          const on = lit[ri * 3 + ci];
          if (emissive) { if (on) { c.fillStyle = '#ffcf86'; c.fillRect(x + 6, y + 6, 32, 84); } return; }
          c.fillStyle = '#ffffff'; c.fillRect(x - 3, y - 3, 50, 102);
          if (on) { c.fillStyle = '#ffd98a'; c.fillRect(x, y, 44, 96); c.fillStyle = shutter; c.fillRect(x - 12, y, 12, 96); c.fillRect(x + 44, y, 12, 96); }
          else { c.fillStyle = shutter; c.fillRect(x, y, 44, 96); c.fillStyle = 'rgba(0,0,0,.18)'; for (let s = y + 6; s < y + 96; s += 8) c.fillRect(x + 2, s, 40, 2); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 21, y, 2, 96); }
        }));
      };
      const map = tex(256, 512, (c) => {
        c.fillStyle = wall; c.fillRect(0, 0, 256, 512);
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(0, 0, 256, 20); c.fillRect(0, 286, 256, 14);
        c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(0, 0, 14, 512); c.fillRect(242, 0, 14, 512);
        c.fillStyle = 'rgba(0,0,0,.06)'; for (let k = 26; k < 280; k += 12) c.fillRect(14, k, 228, 1);
        drawWindows(c, false);
        [[30, 118], [138, 226]].forEach(([a, b]) => {
          c.fillStyle = '#3b1f3c'; c.beginPath(); c.moveTo(a, 512); c.lineTo(a, 380); c.arc((a + b) / 2, 380, (b - a) / 2, Math.PI, 0); c.lineTo(b, 512); c.fill();
          const gr = c.createLinearGradient(0, 512, 0, 360); gr.addColorStop(0, 'rgba(255,184,103,.85)'); gr.addColorStop(1, 'rgba(255,184,103,0)'); c.fillStyle = gr; c.fillRect(a + 6, 380, b - a - 12, 132);
        });
      });
      const emissiveMap = tex(256, 512, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 256, 512); drawWindows(c, true);
        [[30, 118], [138, 226]].forEach(([a, b]) => { const gr = c.createLinearGradient(0, 512, 0, 380); gr.addColorStop(0, '#ff9e4a'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(a + 6, 380, b - a - 12, 132); });
      });
      return keep(new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, roughness: 0.9 }));
    });
    {
      const r = rng(42); let idx = 0;
      const bodies = [], roofs = [], fronts = FACADES.map(() => []);
      for (const s of [-1, 1]) {
        for (let z = 21; z > geo.farZ; z -= 4.2) {
          const h = 6.6 + r() * 1.8, fi = (idx++) % FACADES.length;
          bodies.push([G.box, mm(T(s * 11.6, h / 2, z), S(5, h, 4.16)), FACADES[fi][0]]);
          roofs.push([G.roofPrism, mm(T(s * 11.6, h + 0.5 * 1.3 / 1.5, z), S(5.6 / Math.sqrt(3), 1.3 / 1.5, 4.2)), '#b9573c']);
          fronts[fi].push([G.plane, mm(T(s * 9.08, h / 2, z), RY(s < 0 ? Math.PI / 2 : -Math.PI / 2), S(4.16, h, 1))]);
        }
      }
      g.add(new THREE.Mesh(keep(mergeParts(bodies)), kit.vcMat));
      g.add(new THREE.Mesh(keep(mergeParts(roofs)), kit.vcFlatMat));
      fronts.forEach((list, fi) => { if (list.length) g.add(new THREE.Mesh(keep(mergeParts(list, true)), facadeMats[fi])); });
    }

    /* the arch gate */
    const archTex = tex(1024, 132, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#fb923c'); gr.addColorStop(0.55, '#e0449a'); gr.addColorStop(1, '#8b2fc9');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 4; rr(c, 10, 10, w - 20, h - 20, 16); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 22px ${FONT_DISPLAY}`; try { c.letterSpacing = '8px'; } catch { /* older browsers */ }
      c.fillText('SELLIO WORLD', w / 2, 34);
      try { c.letterSpacing = '0px'; } catch { /* older browsers */ }
      c.font = `700 62px ${FONT_DISPLAY}`; c.fillText('Pop-up Street', w / 2, 86);
      for (const x of [90, w - 90]) { c.fillStyle = '#ffc23d'; c.beginPath(); c.arc(x, h / 2, 26, 0, TAU); c.fill(); c.fillStyle = '#8a5200'; c.font = `700 30px ${FONT_DISPLAY}`; c.fillText('S', x, h / 2 + 2); }
    });
    const beamFace = keep(new THREE.MeshStandardMaterial({ map: archTex, emissive: 0xffffff, emissiveMap: archTex, roughness: 0.6, transparent: true }));
    const plum = keep(new THREE.MeshStandardMaterial({ color: '#5b2a86', roughness: 0.7, transparent: true }));
    const gold = keep(new THREE.MeshStandardMaterial({ color: '#f3c14b', metalness: 0.3, roughness: 0.4, transparent: true }));
    const archMats = [beamFace, plum, gold];
    const arch = new THREE.Group(); g.add(arch);
    const beam = new THREE.Mesh(G.box, plum); beam.scale.set(11, 1.4, 0.5); beam.position.set(0, 4.75, ARCH_Z); arch.add(beam);
    for (const dz of [1, -1]) { const f = new THREE.Mesh(G.plane, beamFace); f.scale.set(11, 1.4, 1); f.position.set(0, 4.75, ARCH_Z + dz * 0.252); if (dz < 0) f.rotation.y = Math.PI; arch.add(f); }
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(G.box, plum); p.scale.set(0.8, 4.9, 0.8); p.position.set(s * 5, 2.45, ARCH_Z); arch.add(p);
      const cap = new THREE.Mesh(G.box, gold); cap.scale.set(1.0, 0.25, 1.0); cap.position.set(s * 5, 5.55, ARCH_Z); arch.add(cap);
      const base = new THREE.Mesh(G.box, gold); base.scale.set(1.0, 0.3, 1.0); base.position.set(s * 5, 0.15, ARCH_Z); arch.add(base);
    }
    const archBulbs = createGlowPoints(kit, Array.from({ length: 17 }, (_, i) => new THREE.Vector3(-5 + i * 10 / 16, 3.92, ARCH_Z + 0.3)), { size: 0.45, opacity: 0.7, color: '#ffd27a' });
    arch.add(archBulbs.object);

    /* string lights across the street */
    const bulbPts = [], bulbCols = [], palette = ['#ffd27a', '#ff9ccf', '#fff1d6'];
    const postParts = [], wire = [];
    for (const z of geo.gapZs) {
      if (z < geo.lastRowZ - 4) continue;
      for (const s of [-1, 1]) postParts.push([G.post, mm(T(s * 4.35, 2.15, z), S(1, 4.3, 1)), '#3b2a45']);
      const curve = [];
      for (let i = 0; i <= 24; i++) { const x = -4.35 + i * 8.7 / 24; curve.push(new THREE.Vector3(x, 4.1 - 0.65 * (1 - (x / 4.35) ** 2), z)); }
      for (let i = 0; i < 24; i++) wire.push(curve[i], curve[i + 1]);
      for (let i = 1; i < 24; i += 2) { const v = curve[i].clone(); v.y -= 0.1; bulbPts.push(v); bulbCols.push(palette[(i >> 1) % 3]); }
    }
    g.add(new THREE.Mesh(keep(mergeParts(postParts)), kit.vcMat));
    g.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setFromPoints(wire)), keep(new THREE.LineBasicMaterial({ color: '#2b1d33' }))));
    const bulbs = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.075, 8, 6)), keep(new THREE.MeshBasicMaterial()), bulbPts.length);
    const m4 = new THREE.Matrix4(), cc = new THREE.Color();
    bulbPts.forEach((v, i) => { m4.makeTranslation(v.x, v.y, v.z); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, cc.set(bulbCols[i])); });
    g.add(bulbs);
    const bulbGlow = createGlowPoints(kit, bulbPts, { size: 0.42, opacity: 0.6, colors: bulbCols });
    g.add(bulbGlow.object);

    /* the board at the far end */
    const endTex = tex(512, 200, (c, w) => {
      c.fillStyle = '#2a1838'; c.fillRect(0, 0, w, 200);
      c.strokeStyle = '#ffc23d'; c.lineWidth = 6; rr(c, 10, 10, w - 20, 180, 18); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, 'More stalls coming', 700, FONT_DISPLAY, 48, w - 60); c.fillText('More stalls coming', w / 2, 82);
      c.fillStyle = '#ffc9e4'; fitFont(c, 'The street grows as sellers join', 500, FONT_DISPLAY, 26, w - 60); c.fillText('The street grows as sellers join', w / 2, 134);
    });
    const board = new THREE.Mesh(G.box, std('#2a1838')); board.scale.set(3.6, 1.4, 0.12); board.position.set(0, 2.1, geo.endZ); g.add(board);
    const face = new THREE.Mesh(G.plane, keep(new THREE.MeshStandardMaterial({ map: endTex, emissive: 0xffffff, emissiveMap: endTex, emissiveIntensity: 0.3 })));
    face.scale.set(3.6, 1.4, 1); face.position.set(0, 2.1, geo.endZ + 0.062); g.add(face);
    g.add(new THREE.Mesh(keep(mergeParts([-1, 1].map((s) => [G.post, mm(T(s * 1.7, 1.45, geo.endZ - 0.1), S(1.4, 2.9, 1.4)), '#3b2a45']))), kit.vcMat));
    const planterMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    const boxes = [], shrubs = [];
    for (let x = -3.6; x <= 3.6; x += 1.2) { boxes.push([G.box, mm(T(x, 0.25, geo.endZ + 0.9), S(0.9, 0.5, 0.5))]); shrubs.push([G.ico, mm(T(x, 0.72, geo.endZ + 0.9), S(0.38)), '#3f9d6b']); }
    const boxGeo = keep(mergeParts(boxes)); boxGeo.deleteAttribute('color');
    g.add(new THREE.Mesh(boxGeo, planterMat));
    g.add(new THREE.Mesh(keep(mergeParts(shrubs)), kit.vcFlatMat));
    const floorMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.85 }));

    function setTheme() {
      const th = THEMES[themeName];
      paint();
      for (const m of facadeMats) m.emissiveIntensity = th.facadeGlow;
      beamFace.emissiveIntensity = th.archGlow;
      bulbGlow.opacity = th.bulbGlow; archBulbs.opacity = themeName === 'dusk' ? 0.9 : 0.55;
      floorMat.color.set(th.stallFloor);
      planterMat.color.set(th.planter);
    }
    // Fade the arch while it stands between the camera and Mochi.
    function update(camLocal, playerLocal, dt) {
      const crossing = Math.abs(camLocal.z - ARCH_Z) < 2.6 && Math.abs(camLocal.x) < 7 && camLocal.y < 9;
      const blocks = (camLocal.z - ARCH_Z) * (playerLocal.z - ARCH_Z) < 0 && camLocal.y < 12 && Math.abs(playerLocal.x) < 8;
      const goal = crossing ? 0 : blocks ? 0.18 : 1;
      const a = archMats[0].opacity + (goal - archMats[0].opacity) * Math.min(1, dt * 8);
      for (const m of archMats) { m.opacity = a; m.depthWrite = a > 0.95; }
      arch.visible = a > 0.02;
    }
    function dispose() {
      g.removeFromParent(); archBulbs.dispose(); bulbGlow.dispose();
      paverTex?.dispose(); sideTex?.dispose();
      for (const o of own) o.dispose?.();
    }
    setTheme();
    return { rows: geo.rows, zmin: geo.zmin, floorMat, setTheme, update, dispose };
  }

  /** Shows these shops (open/preview) or covered stalls (closed). */
  function setStreet({ shops = [], mode = 'open', liveCount = 0 } = {}, streetGeo) {
    const capacity = 48;
    const soon = mode === 'closed' ? Math.min(liveCount, capacity) : 0;
    geo = streetGeo;
    root.position.set(STREET_X, 0, geo.walkZMax - STREET_ENTRANCE_Y);
    if (!env || env.rows !== geo.rows || env.zmin !== geo.zmin) { env?.dispose(); env = buildEnv(); }
    for (const s of stalls.values()) s.dispose();
    stalls.clear();
    for (const p of plots) p.dispose();
    plots = [];
    const total = geo.rows * 2;
    shops.slice(0, total).forEach((shop, i) => {
      const st = factory.buildStall(shop, i, geo);
      root.add(st.root); labels.add(st.label); stalls.set(shop.tenant_id, st);
    });
    for (let i = Math.min(shops.length, total); i < total; i++) {
      const p = factory.buildPlot(i, geo, i < soon ? 'soon' : 'open');
      root.add(p.root); plots.push(p);
    }
    if (floors) { floors.removeFromParent(); floors.dispose(); }
    floors = new THREE.InstancedMesh(G.box, env.floorMat, total);
    const m = new THREE.Matrix4(), local = new THREE.Matrix4().makeTranslation(0, 0.03, 0.15).multiply(new THREE.Matrix4().makeScale(STALL_W + 0.5, 0.06, 2.5));
    for (let i = 0; i < total; i++) {
      const side = i % 2 === 0 ? 1 : -1, z = geo.rowZ(Math.floor(i / 2));
      m.makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(side * 5.4, 0, z).multiply(local);
      floors.setMatrixAt(i, m);
    }
    root.add(floors);
    pickables = [...[...stalls.values()].flatMap((s) => [s.hit, s.label]), ...plots.map((p) => p.hit)];
  }

  /* level of detail, labels and animations */
  const camLocal = new THREE.Vector3();
  function update(dt, t, camera, playerLocal) {
    camLocal.copy(camera.position); root.worldToLocal(camLocal);
    const k = 1 - Math.exp(-dt * 8);
    const camFar = Math.hypot(camLocal.x, camLocal.z - geo.zmin / 2) > 260 + (camLocal.y > 0 ? camLocal.y : 0);
    for (const s of stalls.values()) {
      const camD = camLocal.distanceTo(s.label.position);
      s.setNear(camD < NEAR_DIST);
      if (s.near) for (const f of s.ticks) f(t);
      const near = Math.hypot(playerLocal.x - s.center.x, playerLocal.z - s.center.z) <= REACH;
      let op = clamp(1.2 - (camD - 18) / 28, 0.3, 1);
      if (s.shop.mine) op = Math.max(op, 0.9);
      if (near) op = 1;
      if (camD > 150) op = 0;
      s.label.material.opacity += (op - s.label.material.opacity) * k;
      s.label.visible = s.label.material.opacity > 0.02 && !camFar;
      s.ls += ((near ? 1.12 : 1) - s.ls) * k;
      const sc = clamp(camD / 16, 0.6, 1.6);
      s.label.scale.set(3.4 * s.ls * sc, 0.876 * s.ls * sc, 1);
      s.label.position.y = 4.75 + (near ? Math.sin(t * 3) * 0.08 * motion : 0);
    }
    for (const p of plots) for (const f of p.ticks) f(t);
    env?.update(camLocal, playerLocal, dt);
  }

  return {
    root, coins, stalls, get plots() { return plots; }, get pickables() { return pickables; }, get geo() { return geo; },
    toLocal, toMap, setStreet, update,
    setTheme(name) { themeName = name; env?.setTheme(); },
    dispose() {
      for (const s of stalls.values()) s.dispose();
      for (const p of plots) p.dispose();
      if (floors) floors.dispose();
      env?.dispose(); coins.dispose(); factory.dispose(); root.removeFromParent();
    },
  };
}
