import * as THREE from 'three';
import { rr, fitFont, rng, hashSeed } from './kit';
import { LOOKS, safeStyle, goodsFor } from './catalog';
import { STALL_W as W, STALL_X, FONT_DISPLAY as FONT_D, FONT_CHALK as FONT_C } from './constants';
import { loadImage, drawCover } from './images';

const TAU = Math.PI * 2;
const GRAD = ['#fb923c', '#e0449a', '#8b2fc9'];

// Marks what a slot created for itself, so a style change frees exactly that.
function own(o, { geo = false, mat = false, map = false } = {}) {
  o.userData.ownGeo = geo; o.userData.ownMat = mat; o.userData.ownMap = map;
  return o;
}
function freeTree(root) {
  root.traverse((o) => {
    if (o.userData.ownGeo) o.geometry?.dispose();
    if (o.userData.ownMat && o.material && !Array.isArray(o.material)) {
      if (o.userData.ownMap) o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
function clearSlot(group) {
  while (group.children.length) { const c = group.children.pop(); freeTree(c); }
}

// Builds stalls (a seller's pitch) and plots (an empty pitch). Shared
// geometry, materials and textures live in this factory; each stall frees only
// what it made itself.
export function createStallFactory(kit, { motion = 1 } = {}) {
  const { std, mesh, G, canvasTex, glowSprite, glowPoints, line, T, S, mm, mergeParts, hitMat } = kit;
  const MOTION = motion;

  /* textures shared between stalls */
  const texCache = new Map();
  const cachedTex = (key, w, h, draw) => {
    if (!texCache.has(key)) texCache.set(key, canvasTex(w, h, draw));
    return texCache.get(key);
  };
  const matCache = new Map();
  const cachedMat = (key, make) => {
    if (!matCache.has(key)) matCache.set(key, kit.track(make()));
    return matCache.get(key);
  };
  const stripeMat = (a, b) => cachedMat(`stripe${a}${b}`, () => new THREE.MeshStandardMaterial({
    roughness: 0.85,
    map: cachedTex(`s${a}${b}`, 256, 64, (c, w, h) => {
      const n = 8, sw = w / n;
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * sw, 0, sw + 1, h); }
      c.fillStyle = 'rgba(0,0,0,.07)'; for (let i = 0; i < n; i++) c.fillRect(i * sw, 0, 2, h);
    }),
  }));
  const valanceMat = (a, b, scallop) => cachedMat(`val${a}${b}${scallop}`, () => new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.85,
    map: cachedTex(`v${a}${b}${scallop}`, 256, 64, (c, w, h) => {
      const n = 8, sw = w / n, body = scallop ? 38 : h;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i % 2 ? b : a; c.fillRect(i * sw, 0, sw + 1, body);
        if (scallop) { c.beginPath(); c.arc(i * sw + sw / 2, body - 1, sw / 2, 0, Math.PI); c.fill(); }
      }
      if (!scallop) { c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(0, h - 6, w, 6); }
    }),
  }));
  const glowCanopyTex = canvasTex(256, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, GRAD[0]); g.addColorStop(0.5, GRAD[1]); g.addColorStop(1, GRAD[2]);
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 1; i < 8; i++) c.fillRect(i * w / 8 - 1, 0, 2, h);
  });
  const glowCanopyMat = kit.track(new THREE.MeshStandardMaterial({ map: glowCanopyTex, emissive: 0xffffff, emissiveMap: glowCanopyTex, emissiveIntensity: 0.4, side: THREE.DoubleSide, roughness: 0.5 }));
  const ribsGeo = kit.track(mergeParts([-(W + 0.4) / 2, 0, (W + 0.4) / 2].map((x) => [G.rib, T(x, 2.72, 0), '#f3c14b'])));
  const ribsMat = kit.track(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.4 }));
  const canopyGeo = kit.track(new THREE.BoxGeometry(1, 1, 1));
  const bulbMat = std('#ffe2a3', { emissive: '#ffd27a', emissiveIntensity: 1.6 });
  const vcDouble = kit.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  const vcGloss = kit.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }));
  const lanternBodyMat = std('#d62f3a', { emissive: '#ff4a2a', emissiveIntensity: 0.9, roughness: 0.6 });
  // One lantern's frame (string, caps and tassel) in a single geometry.
  const lanternFrameGeo = kit.track(mergeParts([
    [G.post, mm(T(0, -0.1, 0), S(0.4, 0.2, 0.4)), '#2b1d33'],
    [G.cyl, mm(T(0, -0.22, 0), S(0.09, 0.05, 0.09)), '#f3c14b'],
    [G.cyl, mm(T(0, -0.64, 0), S(0.08, 0.05, 0.08)), '#f3c14b'],
    [G.post, mm(T(0, -0.77, 0), S(0.5, 0.22, 0.5)), '#d62f3a'],
  ]));
  const easelLegsGeo = kit.track(mergeParts([
    [G.post, mm(T(-0.42, 0.42, -0.06), kit.RX(-0.12), S(0.6, 0.84, 0.6)), '#5b361d'],
    [G.post, mm(T(0.42, 0.42, -0.06), kit.RX(-0.12), S(0.6, 0.84, 0.6)), '#5b361d'],
    [G.post, mm(T(0, 0.38, -0.22), kit.RX(0.45), S(0.5, 0.8, 0.5)), '#5b361d'],
  ]));
  const plantsGeo = kit.track(mergeParts([-1.62, 1.62].flatMap((x) => [
    [G.pot, T(x, 0.24, 1.15), '#c8643c'],
    [G.ico, mm(T(x, 0.66, 1.15), S(0.3)), '#3f9d6b'],
    [G.ico, mm(T(x + 0.08, 0.88, 1.2), S(0.2)), '#57b77f'],
  ])));
  const tarpTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#e8dcef'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d4c2e0'; for (let i = 0; i < 8; i += 2) c.fillRect(i * w / 8, 0, w / 8, h);
    c.strokeStyle = 'rgba(80,40,110,.25)'; c.lineWidth = 3; for (let y = 30; y < h; y += 34) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 6); c.stroke(); }
  });
  const tarpMat = kit.track(new THREE.MeshStandardMaterial({ map: tarpTex, roughness: 0.95 }));

  /* signboards */
  function signTexture(id, text) {
    return canvasTex(512, 136, (c, w, h) => {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (id === 'chalk') {
        c.fillStyle = '#24372f'; c.fillRect(0, 0, w, h);
        const r = rng(text.length * 7); for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; c.beginPath(); c.arc(r() * w, r() * h, 8 + r() * 26, 0, TAU); c.fill(); }
        c.strokeStyle = '#8a5a34'; c.lineWidth = 14; c.strokeRect(7, 7, w - 14, h - 14);
        fitFont(c, text, 700, FONT_C, 76, w - 70); c.fillStyle = 'rgba(250,250,245,.95)'; c.fillText(text, w / 2, h / 2 - 2);
        c.strokeStyle = 'rgba(255,214,120,.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.3, h - 26); c.quadraticCurveTo(w / 2, h - 18, w * 0.7, h - 26); c.stroke();
      } else if (id === 'neon') {
        c.fillStyle = '#151027'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2; for (let y = 17; y < h; y += 17) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        c.shadowColor = '#7cf3ff'; c.shadowBlur = 14; c.strokeStyle = '#bdfaff'; c.lineWidth = 4; rr(c, 14, 14, w - 28, h - 28, 20); c.stroke();
        fitFont(c, text, 600, FONT_D, 60, w - 80);
        c.shadowColor = '#ff4fb8'; c.shadowBlur = 24; c.fillStyle = '#ff7cc8'; c.fillText(text, w / 2, h / 2 + 2); c.fillText(text, w / 2, h / 2 + 2);
        c.shadowBlur = 6; c.fillStyle = '#fff0f8'; c.fillText(text, w / 2, h / 2 + 2);
      } else if (id === 'gold') {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1752'); g.addColorStop(1, '#250c38'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#f3c14b'; c.lineWidth = 5; c.strokeRect(9, 9, w - 18, h - 18); c.lineWidth = 2; c.strokeRect(19, 19, w - 38, h - 38);
        fitFont(c, text, 700, FONT_D, 60, w - 80);
        const tg = c.createLinearGradient(0, 30, 0, h - 30); tg.addColorStop(0, '#fff0b3'); tg.addColorStop(0.5, '#f3c14b'); tg.addColorStop(1, '#c48a12');
        c.fillStyle = 'rgba(0,0,0,.4)'; c.fillText(text, w / 2 + 2, h / 2 + 4); c.fillStyle = tg; c.fillText(text, w / 2, h / 2 + 2);
      } else {
        c.fillStyle = '#8a5a34'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#6e4428'; c.fillRect(0, 44, w, 3); c.fillRect(0, 90, w, 3);
        const r = rng(text.length * 13); c.strokeStyle = 'rgba(255,230,190,.12)'; c.lineWidth = 2;
        for (let i = 0; i < 14; i++) { const y = r() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3); c.stroke(); }
        c.strokeStyle = '#5b361d'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
        fitFont(c, text, 700, FONT_D, 62, w - 64);
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillText(text, w / 2 + 2, h / 2 + 4); c.fillStyle = '#fff3dc'; c.fillText(text, w / 2, h / 2 + 2);
      }
    });
  }

  /* goods on the counter, merged into one mesh per stall */
  function goodParts(shape, color, x, y0, z) {
    const P = [];
    const add = (geo, c, sx, sy, sz, y = 0) => P.push([geo, mm(T(x, y0 + y, z), S(sx, sy, sz)), c || '#ffffff']);
    switch (shape) {
      case 'loaf': add(G.box, color, 0.3, 0.15, 0.17, 0.075); add(G.box, '#e8c48c', 0.24, 0.02, 0.05, 0.155); break;
      case 'disc': for (let i = 0; i < 3; i++) add(G.cyl, color, 0.09, 0.026, 0.09, 0.013 + i * 0.028); break;
      case 'block': add(G.box, color, 0.15, 0.035, 0.15, 0.018); add(G.box, '#fff7e8', 0.15, 0.03, 0.15, 0.05); add(G.box, color, 0.15, 0.035, 0.15, 0.083); break;
      case 'ball': add(G.sphere, color, 0.085, 0.07, 0.085, 0.07); break;
      case 'pyramid': add(G.cone4, color, 0.12, 0.17, 0.12, 0.085); break;
      case 'bowl': add(G.cyl, '#f4f0e6', 0.11, 0.07, 0.11, 0.035); add(G.sphere, color, 0.09, 0.04, 0.09, 0.07); break;
      case 'jar': add(G.cyl, color, 0.065, 0.15, 0.065, 0.075); add(G.cyl, '#f3c14b', 0.07, 0.03, 0.07, 0.165); break;
      case 'steamer': add(G.cyl, '#d8b26e', 0.15, 0.09, 0.15, 0.045); add(G.cyl, '#c99f55', 0.155, 0.03, 0.155, 0.105); break;
      case 'bottle': add(G.cyl, color, 0.05, 0.2, 0.05, 0.1); add(G.cyl, color, 0.022, 0.06, 0.022, 0.23); add(G.cyl, '#f6efe6', 0.052, 0.06, 0.052, 0.1); break;
      case 'cup': add(G.cup, color, 1, 1, 1, 0.07); add(G.cyl, '#ffffff', 0.062, 0.015, 0.062, 0.145); break;
      case 'puff': add(G.sphere, color, 0.1, 0.055, 0.065, 0.05); break;
      case 'toast': add(G.box, color, 0.16, 0.05, 0.15, 0.025); add(G.box, '#6fa83c', 0.13, 0.012, 0.12, 0.055); break;
      case 'cake': add(G.cyl, color, 0.13, 0.13, 0.13, 0.065); add(G.cyl, '#fff6e4', 0.135, 0.02, 0.135, 0.13); break;
      case 'tub': add(G.cyl, color, 0.085, 0.09, 0.085, 0.045); add(G.cyl, '#ffffff', 0.088, 0.02, 0.088, 0.095); break;
      case 'box': add(G.box, color, 0.2, 0.16, 0.2, 0.08); add(G.box, '#fff4ea', 0.205, 0.165, 0.04, 0.08); add(G.box, '#fff4ea', 0.04, 0.165, 0.205, 0.08); break;
      case 'bag': add(G.box, color, 0.2, 0.22, 0.1, 0.11); add(G.box, '#5b361d', 0.1, 0.02, 0.02, 0.235); break;
      case 'candle': add(G.cyl, color, 0.06, 0.16, 0.06, 0.08); add(G.cyl, '#3b2a45', 0.008, 0.03, 0.008, 0.175); break;
      default: add(G.box, color, 0.15, 0.1, 0.15, 0.05);
    }
    return P;
  }

  /* awning, sign, lights and decor; each returns its group and animations */
  function buildAwning(id) {
    const g = new THREE.Group();
    const look = LOOKS.awning[id] || LOOKS.awning.sunset;
    if (look.kind === 'pagoda') {
      const roof = mesh(G.pyramid, std('#c8323c', { flatShading: true, roughness: 0.6 })); roof.scale.set(1.8 * Math.SQRT2, 1.25, 1.35 * Math.SQRT2); roof.position.set(0, 2.8 + 0.625, 0.15); g.add(roof);
      const trim = mesh(G.box, std('#f3c14b', { metalness: 0.3, roughness: 0.45 }), false); trim.scale.set(3.62, 0.1, 2.72); trim.position.set(0, 2.8, 0.15); g.add(trim);
      const fin = mesh(G.sphere, std('#f3c14b', { metalness: 0.3, roughness: 0.45 }), false); fin.scale.setScalar(0.11); fin.position.set(0, 4.1, 0.15); g.add(fin);
      return { g, info: { signY: 2.42, signZ: 1.52, rods: false, frontY: 2.75, frontZ: 1.64, halfW: 1.75, eaves: true } };
    }
    if (look.kind === 'glow') {
      const canopy = mesh(G.canopy, glowCanopyMat); canopy.position.set(0, 2.72, 0); g.add(canopy);
      const ribs = mesh(ribsGeo, ribsMat, false); g.add(ribs);
      return { g, info: { signY: 3.22, signZ: 1.44, rods: false, frontY: 2.72, frontZ: 1.38, halfW: 1.6 } };
    }
    const [a, b] = look.colors; const scallop = !!look.scallop;
    const len = Math.hypot(2.2, 0.35), ang = Math.atan2(0.35, 2.2);
    const canopy = mesh(canopyGeo, stripeMat(a, b));
    canopy.scale.set(W + 0.4, 0.05, len); canopy.rotation.x = ang; canopy.position.set(0, 2.775, 0.15); g.add(canopy);
    const vh = scallop ? 0.4 : 0.3;
    const val = own(new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, vh), valanceMat(a, b, scallop)), { geo: true });
    val.position.set(0, 2.6 - vh / 2 + 0.01, 1.255); g.add(val);
    return { g, info: { signY: 3.32, signZ: 1.0, rods: true, frontY: 2.6 - vh + 0.02, frontZ: 1.27, halfW: 1.6 } };
  }

  function buildSign(id, text, info) {
    const g = new THREE.Group(), ticks = [];
    const code = LOOKS.sign[id] ? id : 'wood';
    const tex = signTexture(code, text); kit.untrack(tex);
    let face;
    if (code === 'neon') face = new THREE.MeshBasicMaterial({ map: tex });
    else if (code === 'gold') face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.15, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
    else face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
    const frameColor = { wood: '#5b361d', chalk: '#7a5232', neon: '#1b1430', gold: '#3a1752' }[code];
    const parts = [[G.box, mm(T(0, info.signY, info.signZ), S(2.2, 0.58, 0.07)), frameColor]];
    if (info.rods) {
      const h = info.signY - 0.29 - 2.62;
      for (const x of [-0.8, 0.8]) parts.push([G.post, mm(T(x, 2.62 + h / 2, info.signZ - 0.03), S(1, h, 1)), '#3b2a45']);
    }
    const board = own(mesh(mergeParts(parts), kit.vcMat), { geo: true }); board.receiveShadow = false; g.add(board);
    const front = own(new THREE.Mesh(G.plane, face), { mat: true, map: true });
    front.scale.set(2.2, 0.58, 1); front.position.set(0, info.signY, info.signZ + 0.04); g.add(front);
    if (code === 'neon') {
      const glow = own(glowSprite('#ff4fb8', 1, 0.42), { mat: true }); glow.scale.set(3.4, 1.4, 1); glow.position.set(0, info.signY, info.signZ + 0.12); g.add(glow);
      ticks.push((t) => { glow.material.opacity = 0.38 + 0.06 * Math.sin(t * 7) * MOTION + (MOTION && Math.sin(t * 23) > 0.985 ? -0.25 : 0); });
    }
    return { g, ticks };
  }

  function buildLights(id, info) {
    const g = new THREE.Group(), ticks = [];
    const { frontY: y0, frontZ: z0, halfW: hw } = info;
    if (id === 'bulbs') {
      const curve = [], bulbs = [];
      for (let i = 0; i <= 20; i++) { const x = -hw + 2 * hw * i / 20; curve.push(new THREE.Vector3(x, y0 - 0.04 - 0.16 * (1 - (x / hw) ** 2), z0 + 0.03)); }
      g.add(own(line(curve), { geo: true, mat: true }));
      for (let i = 1; i < 20; i += 2) { const v = curve[i].clone(); v.y -= 0.07; bulbs.push(v); }
      const bulbGeo = mergeParts(bulbs.map((v) => [G.sphere, mm(T(v.x, v.y, v.z), S(0.055, 0.07, 0.055))]));
      bulbGeo.deleteAttribute('color');
      g.add(own(new THREE.Mesh(bulbGeo, bulbMat), { geo: true }));
      g.add(own(glowPoints(bulbs, 0xffc66b, 0.75), { geo: true, mat: true }));
    } else if (id === 'fairy') {
      const A = [], B = [];
      for (let i = 0; i < 22; i++) { const x = -hw + 2 * hw * i / 21; (i % 2 ? A : B).push(new THREE.Vector3(x, y0 - 0.06 - 0.08 * Math.sin(i * 1.7) ** 2, z0 + 0.03)); }
      for (const x of [-1.36, 1.36]) for (let i = 0; i < 9; i++) { (i % 2 ? A : B).push(new THREE.Vector3(x + 0.07 * Math.sin(i * 2.1), 0.3 + i * 0.27, 0.78)); }
      const pa = own(glowPoints(A, 0xbfe9ff, 0.34), { geo: true, mat: true }), pb = own(glowPoints(B, 0xfff3b0, 0.34), { geo: true, mat: true }); g.add(pa, pb);
      ticks.push((t) => { const s = MOTION ? Math.sin(t * 3.2) : 0; pa.material.opacity = 0.6 + 0.4 * s; pb.material.opacity = 0.6 - 0.4 * s; });
    } else if (id === 'lanterns') {
      (info.eaves ? [-1.62, 1.62] : [-1.15, 0, 1.15]).forEach((x, i) => {
        const L = new THREE.Group(); L.position.set(x, y0, z0 + 0.02);
        L.add(mesh(lanternFrameGeo, kit.vcMat, false));
        const body = mesh(G.sphere, lanternBodyMat, false); body.scale.set(0.17, 0.21, 0.17); body.position.y = -0.43; L.add(body);
        const gl = own(glowSprite('#ff6a3d', 0.95, 0.55), { mat: true }); gl.position.y = -0.43; L.add(gl);
        g.add(L);
        ticks.push((t) => { L.rotation.z = Math.sin(t * 1.6 + i * 1.3) * 0.08 * MOTION; });
      });
    }
    return { g, ticks };
  }

  function buildDecor(id) {
    const g = new THREE.Group(), ticks = [];
    if (id === 'plants') {
      g.add(mesh(plantsGeo, kit.vcFlatMat, false));
    } else if (id === 'bunting') {
      const cols = ['#fb923c', '#e0449a', '#8b2fc9', '#ffc23d', '#2fbf95'];
      const pts = []; for (let i = 0; i <= 10; i++) { const x = -1.3 + i * 0.26; pts.push(new THREE.Vector3(x, 0.98 - 0.06 * (1 - (x / 1.3) ** 2), 0.78)); }
      g.add(own(line(pts), { geo: true, mat: true }));
      const flags = [];
      for (let i = 0; i < 10; i++) { const m = pts[i].clone().lerp(pts[i + 1], 0.5); flags.push([G.flag, T(m.x, m.y, m.z + 0.005), cols[i % 5]]); }
      g.add(own(new THREE.Mesh(mergeParts(flags), vcDouble), { geo: true }));
    } else if (id === 'balloons') {
      const strings = [];
      [['#e0449a', 1.72, 3.32, 1.0], ['#fb923c', 2.02, 3.62, 0.78], ['#8b2fc9', 1.58, 3.84, 0.6]].forEach(([c, x, y, z], i) => {
        const B = own(mesh(mergeParts([[G.sphere, S(0.23, 0.27, 0.23), c], [G.cone4, mm(T(0, -0.29, 0), S(0.04, 0.06, 0.04)), c]]), vcGloss, false), { geo: true });
        B.position.set(x, y, z); g.add(B);
        strings.push(new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(1.38, 2.4, 0.72));
        ticks.push((t) => { B.position.y = y + Math.sin(t * 1.4 + i) * 0.05 * MOTION; });
      });
      const seg = own(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strings), new THREE.LineBasicMaterial({ color: '#f6eefa' })), { geo: true, mat: true });
      g.add(seg);
    }
    return { g, ticks };
  }

  /* the floating name label */
  function labelTexture(shop) {
    return canvasTex(512, 132, (c, w) => {
      c.shadowColor = 'rgba(30,10,50,.35)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
      if (shop.mine) { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]); c.fillStyle = g; }
      else c.fillStyle = 'rgba(253,250,255,.96)';
      rr(c, 10, 12, w - 20, 88, 44); c.fill();
      c.beginPath(); c.moveTo(w / 2 - 14, 98); c.lineTo(w / 2 + 14, 98); c.lineTo(w / 2, 118); c.closePath(); c.fill();
      c.shadowColor = 'transparent';
      c.textBaseline = 'middle';
      let x;
      if (shop.mine) {
        c.fillStyle = 'rgba(255,255,255,.95)'; rr(c, 30, 34, 82, 44, 22); c.fill();
        c.fillStyle = '#8b2fc9'; c.font = `700 26px ${FONT_D}`; c.textAlign = 'center'; c.fillText('YOU', 71, 57); x = 128;
      } else { c.fillStyle = shop.tint || '#e0449a'; c.beginPath(); c.arc(52, 56, 14, 0, TAU); c.fill(); x = 80; }
      c.textAlign = 'left'; c.fillStyle = shop.mine ? '#ffffff' : '#2a1838';
      fitFont(c, shop.name, 600, FONT_D, 40, w - x - 40); c.fillText(shop.name, x, 58);
    });
  }
  function makeLabel(shop) {
    const tex = kit.untrack(labelTexture(shop));
    const s = own(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })), { mat: true, map: true });
    s.center.set(0.5, 0.08); s.scale.set(3.4, 0.876, 1); s.renderOrder = 6;
    return s;
  }

  // Up to three product photos on a board behind the counter, loaded only
  // when the player comes close.
  function buildMenuBoard(stall) {
    const urls = (stall.shop.menu || []).map((m) => m.image_url).filter(Boolean).slice(0, 3);
    if (!urls.length) return;
    stall.boardState = 'loading';
    Promise.all(urls.map(loadImage)).then((imgs) => {
      if (stall.disposed) return;
      const ok = imgs.filter(Boolean);
      if (!ok.length) { stall.boardState = 'none'; return; }
      const cell = 120, gap = 10, pad = 12;
      const w = pad * 2 + ok.length * cell + (ok.length - 1) * gap, h = cell + pad * 2;
      const tex = kit.untrack(canvasTex(w, h, (c) => {
        c.fillStyle = '#fff8ef'; rr(c, 0, 0, w, h, 14); c.fill();
        ok.forEach((img, i) => {
          const x = pad + i * (cell + gap);
          c.save(); rr(c, x, pad, cell, cell, 10); c.clip(); drawCover(c, img, x, pad, cell); c.restore();
          c.strokeStyle = 'rgba(42,24,56,.12)'; c.lineWidth = 2; rr(c, x, pad, cell, cell, 10); c.stroke();
        });
      }));
      // A little easel at the front of the pitch, tilted up so the camera
      // (which looks down on the street) sees the photos.
      const bw = 0.42 * ok.length + 0.08, bh = bw * h / w;
      const easel = new THREE.Group(); easel.position.set(0.95, 0, 1.5);
      easel.add(mesh(easelLegsGeo, kit.vcMat, false));
      const board = new THREE.Group(); board.position.set(0, 0.42 + bh / 2, 0); board.rotation.x = -0.38;
      const back = mesh(G.box, std('#5b361d'), false); back.scale.set(bw + 0.07, bh + 0.07, 0.035); back.position.z = -0.025; board.add(back);
      const face = own(new THREE.Mesh(G.plane, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 })), { mat: true, map: true });
      face.scale.set(bw, bh, 1); board.add(face);
      easel.add(board);
      stall.details.add(easel);
      stall.boardState = 'ready';
    });
  }

  function placeOnStreet(root, slot, geo) {
    const side = slot % 2 === 0 ? 1 : -1, row = Math.floor(slot / 2), z = geo.rowZ(row);
    root.position.set(side * STALL_X, 0, z); root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return { side, row, z };
  }

  /* a seller's stall */
  function buildStall(shop, slot, geo) {
    const root = new THREE.Group(); root.name = `stall:${shop.tenant_id}`;
    const { side, z } = placeOnStreet(root, slot, geo);
    const seed = hashSeed(String(shop.tenant_id));
    const tint = /^#[0-9a-f]{6}$/i.test(shop.tint || '') ? shop.tint : '#e0449a';
    const stall = {
      kind: 'stall', shop: { ...shop, tint }, slot, side, z, root,
      center: new THREE.Vector3(side * STALL_X, 0, z), front: new THREE.Vector3(side * 2.9, 0, z),
      slots: {}, ticks: [], ls: 1, near: false, style: null, boardState: 'idle', disposed: false,
    };

    const base = [
      [G.box, mm(T(0, 0.75, -0.62), S(W - 0.1, 1.5, 0.38)), '#efe2d6'],
      ...[0, 1, 2, 3].map((k) => [G.box, mm(T(-0.9 + k * 0.6, 1.61, -0.62), S(0.3, 0.22, 0.24)), k % 2 ? tint : '#f6ead8']),
      [G.box, mm(T(0, 0.49, 0.38), S(W, 0.98, 0.72)), '#fbf3ea'],
      [G.box, mm(T(0, 0.52, 0.75), S(W - 0.16, 0.6, 0.03)), tint],
      [G.box, mm(T(0, 1.02, 0.38), S(W + 0.1, 0.08, 0.84)), '#c98a5c'],
      ...[[-1.36, 0.7, 2.72], [1.36, 0.7, 2.72], [-1.36, -0.72, 2.92], [1.36, -0.72, 2.92]].map(([px, pz, h]) => [G.post, mm(T(px, h / 2, pz), S(1, h, 1)), '#4a3550']),
    ];
    const baseMesh = own(mesh(mergeParts(base), kit.vcMat), { geo: true });
    root.add(baseMesh);

    // Details hide when the stall is far away.
    stall.details = new THREE.Group(); stall.details.visible = false; root.add(stall.details);
    const goods = goodsFor(shop, seed).flatMap(([shape, color], k) => goodParts(shape, color, -1.0 + k * 0.5, 1.06, 0.42));
    const goodsMesh = own(new THREE.Mesh(mergeParts(goods), kit.vcMat), { geo: true });
    goodsMesh.receiveShadow = true; stall.details.add(goodsMesh);

    for (const s of ['awning', 'sign']) { stall.slots[s] = new THREE.Group(); root.add(stall.slots[s]); }
    for (const s of ['lights', 'decor']) { stall.slots[s] = new THREE.Group(); stall.details.add(stall.slots[s]); }

    stall.hit = new THREE.Mesh(G.box, hitMat); stall.hit.scale.set(W + 0.8, 4.4, 2.8); stall.hit.position.set(0, 2.2, 0.2);
    stall.hit.userData.stall = stall; root.add(stall.hit);
    stall.label = makeLabel(stall.shop); stall.label.position.set(side * STALL_X, 4.75, z); stall.label.userData.stall = stall;

    stall.setStyle = (style) => {
      const st = safeStyle(style);
      if (stall.style && Object.keys(st).every((k) => st[k] === stall.style[k])) return;
      stall.style = st;
      stall.ticks.length = 0;
      for (const s of Object.keys(stall.slots)) clearSlot(stall.slots[s]);
      const aw = buildAwning(st.awning); stall.slots.awning.add(aw.g);
      const sg = buildSign(st.sign, stall.shop.name, aw.info); stall.slots.sign.add(sg.g);
      const li = buildLights(st.lights, aw.info); stall.slots.lights.add(li.g);
      const de = buildDecor(st.decor); stall.slots.decor.add(de.g);
      stall.ticks.push(...sg.ticks, ...li.ticks, ...de.ticks);
      stall.slots.sign.traverse((o) => { if (o.isSprite) o.visible = stall.near; });
    };
    stall.setNear = (near) => {
      if (near === stall.near) return;
      stall.near = near; stall.details.visible = near;
      stall.slots.sign.traverse((o) => { if (o.isSprite) o.visible = near; });
      if (near && stall.boardState === 'idle') buildMenuBoard(stall);
    };
    stall.dispose = () => {
      stall.disposed = true;
      freeTree(root); freeTree(stall.label);
      root.removeFromParent(); stall.label.removeFromParent();
    };
    stall.setStyle(shop.style);
    return stall;
  }

  /* an empty pitch: "Your shop here", or a covered stall before launch */
  function plotSignTexture(title, sub) {
    return canvasTex(512, 200, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]);
      c.fillStyle = g; rr(c, 0, 0, w, h, 26); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 5; c.setLineDash([16, 12]); rr(c, 12, 12, w - 24, h - 24, 18); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, title, 700, FONT_D, 56, w - 60); c.fillText(title, w / 2, sub ? 82 : h / 2);
      if (sub) { c.fillStyle = 'rgba(255,255,255,.88)'; fitFont(c, sub, 500, FONT_D, 30, w - 60); c.fillText(sub, w / 2, 140); }
    });
  }
  const plotOpenTex = plotSignTexture('Your shop here', 'Open a free shop');
  const plotSoonTex = plotSignTexture('Opening soon', 'A home seller is getting ready');
  const plotOpenMat = kit.track(new THREE.MeshStandardMaterial({ map: plotOpenTex, emissive: 0xffffff, emissiveMap: plotOpenTex, emissiveIntensity: 0.2, roughness: 0.7 }));
  const plotSoonMat = kit.track(new THREE.MeshStandardMaterial({ map: plotSoonTex, emissive: 0xffffff, emissiveMap: plotSoonTex, emissiveIntensity: 0.2, roughness: 0.7 }));
  const frameGeo = kit.track(mergeParts([
    [G.box, mm(T(0, 0.05, -0.95), S(W + 0.3, 0.1, 0.08)), '#fff4ea'],
    [G.box, mm(T(0, 0.05, 1.25), S(W + 0.3, 0.1, 0.08)), '#fff4ea'],
    [G.box, mm(T(-(W + 0.3) / 2, 0.05, 0.15), S(0.08, 0.1, 2.2)), '#fff4ea'],
    [G.box, mm(T((W + 0.3) / 2, 0.05, 0.15), S(0.08, 0.1, 2.2)), '#fff4ea'],
    [G.post, mm(T(-1.05, 0.75, 0.3), S(1, 1.5, 1)), '#4a3550'],
    [G.post, mm(T(1.05, 0.75, 0.3), S(1, 1.5, 1)), '#4a3550'],
  ]));
  const coveredGeo = kit.track(new THREE.BoxGeometry(W, 2.4, 1.6));

  function buildPlot(slot, geo, kind) {
    const root = new THREE.Group(); root.name = `plot:${slot}`;
    const { side, z } = placeOnStreet(root, slot, geo);
    const plot = { kind: 'plot', plotKind: kind, slot, side, z, root, ticks: [], near: true,
      center: new THREE.Vector3(side * STALL_X, 0, z), front: new THREE.Vector3(side * 2.9, 0, z) };
    if (kind === 'soon') {
      const body = mesh(coveredGeo, tarpMat); body.position.set(0, 1.2, 0.1); root.add(body);
      const sign = new THREE.Mesh(G.plane, plotSoonMat); sign.scale.set(1.9, 0.74, 1); sign.position.set(0, 1.55, 0.92); root.add(sign);
    } else {
      root.add(mesh(frameGeo, kit.vcMat));
      const sign = new THREE.Mesh(G.plane, plotOpenMat); sign.scale.set(2.0, 0.78, 1); sign.position.set(0, 1.85, 0.3); root.add(sign);
      const back = new THREE.Mesh(G.plane, std('#4a3550', { side: THREE.BackSide })); back.scale.set(2.0, 0.78, 1); back.position.set(0, 1.85, 0.29); root.add(back);
      const glow = own(glowSprite('#ffd27a', 1.6, 0.35), { mat: true }); glow.position.set(0, 0.5, 0.2); root.add(glow);
      plot.ticks.push((t) => { glow.material.opacity = 0.25 + 0.15 * Math.sin(t * 2.4 + slot) * MOTION; });
    }
    plot.hit = new THREE.Mesh(G.box, hitMat); plot.hit.scale.set(W + 0.8, 3, 2.8); plot.hit.position.set(0, 1.5, 0.2);
    plot.hit.userData.plot = plot; root.add(plot.hit);
    plot.setNear = (near) => { plot.near = near; };
    plot.dispose = () => { freeTree(root); root.removeFromParent(); };
    return plot;
  }

  function dispose() {
    for (const t of texCache.values()) t.dispose();
    texCache.clear(); matCache.clear();
  }

  return { buildStall, buildPlot, dispose };
}
