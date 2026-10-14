import * as THREE from 'three';
import { rr, fitFont, rng } from '../engine/kit';
import { FONT_DISPLAY } from '../engine/constants';
import { DISTRICTS, PAD_RADIUS, FNB_BOULEVARD_Y, BOULEVARD_HALF } from './layout';
import { createGlowPoints } from './glow';

const TAU = Math.PI * 2;
const GRAD = ['#fb923c', '#e0449a', '#8b2fc9'];
const LEAVES = ['#5aa55a', '#4c9a55', '#6cb35b', '#3f8f4f', '#79bd5f'];
const FLOWERS = ['#e0449a', '#ffc23d', '#b77cff', '#fb923c', '#ffffff', '#ff7aa8'];
const UMBRELLAS = ['#e0449a', '#fb923c', '#8b2fc9', '#fff4ea', '#1f9e78'];

// Everything on the island that is not a shop, stall or Mochi: the floating
// rock underneath, clouds, trees, lamps, benches, flower beds, café tables,
// the plaza fountain with its giant Sellio coin, Sellio Hop pads, the F&B
// gateway, the canal bridge and the cranes over the districts still being
// built. Static pieces are merged into a handful of meshes.
export function buildProps(kit, scene, layout, { motion = 1 } = {}) {
  const { G, T, S, RY, RX, RZ, mm, mergeParts, canvasTex, std } = kit;
  const root = new THREE.Group(); root.name = 'props'; scene.add(root);
  const own = [];
  const keep = (o) => { own.push(o); return o; };
  const tex = (...a) => keep(kit.untrack(canvasTex(...a)));
  const R = rng(4242);
  const at = (x, y, alt = 0) => T(x, alt, -y); // map metres -> three
  const flat = [], smooth = [], glowSpots = [], shadows = [], canopies = [];
  const cone7 = keep(new THREE.ConeGeometry(1, 1, 7));
  const cone10 = keep(new THREE.ConeGeometry(1, 1, 10));
  const ball = keep(new THREE.SphereGeometry(1, 10, 7)); // small round things
  const TREE = 1.5; // trees read better a little larger than life from the air
  const pick = (list) => list[Math.floor(R() * list.length)];
  const jitter = (hex, k) => { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * k)); return c; };

  /* ---------------------------------------------------------------- rock */
  // The island floats: a rocky underside tapering to a point, with a grassy lip.
  {
    const outline = resample(layout.island, 220);
    let cx = 0, cy = 0; for (const [x, y] of outline) { cx += x; cy += y; } cx /= outline.length; cy /= outline.length;
    const rings = [
      { f: 1.0, d: 0.0, y: 0.0, n: 0 },
      { f: 1.0, d: -0.4, y: -0.9, n: 0.2 },
      { f: 0.998, d: -1.0, y: -2.8, n: 0.5 },
      { f: 0.995, d: -1.5, y: -12, n: 2.8 },
      { f: 0.97, d: -2, y: -24, n: 4.5 },
      { f: 0.9, d: 0, y: -36, n: 6 },
      { f: 0.76, d: 0, y: -48, n: 7 },
      { f: 0.52, d: 0, y: -60, n: 7 },
      { f: 0.24, d: 0, y: -70, n: 5 },
    ];
    const rr2 = rng(77);
    const ringPts = rings.map((ring) => outline.map(([x, y], i) => {
      const nx = x - cx, ny = y - cy, l = Math.hypot(nx, ny) || 1;
      const wob = Math.sin(i * 0.37) * 0.5 + Math.sin(i * 1.13 + ring.y) * 0.35 + (rr2() - 0.5) * 0.6;
      const k = ring.f, push = ring.d + wob * ring.n;
      return [cx + nx * k + nx / l * push, ring.y + (ring.n ? (rr2() - 0.5) * ring.n * 0.6 : 0), cy + ny * k + ny / l * push];
    }));
    const tip = [cx, -80, cy];
    const pos = [], col = [];
    const grass = new THREE.Color('#7cbd57'), grassDark = new THREE.Color('#5d9f45');
    const rockTop = new THREE.Color('#d9c9b5'), rockMid = new THREE.Color('#b7a8a0'), rockLow = new THREE.Color('#8e86a0');
    const colourAt = (y, band) => {
      if (band < 2) return band === 0 ? grass : grassDark;
      const t = Math.min(1, -y / 70);
      const c = t < 0.4 ? rockTop.clone().lerp(rockMid, t / 0.4) : rockMid.clone().lerp(rockLow, (t - 0.4) / 0.6);
      return c.multiplyScalar(0.9 + rr2() * 0.18);
    };
    const tri = (pa, pb, pc, colour) => {
      // points are [map x, altitude, map y]; into three's axes first
      const [a, b, c] = [pa, pb, pc].map((v) => [v[0], v[1], -v[2]]);
      // then keep every face pointing out of the rock
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const mid = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 + 36, (a[2] + b[2] + c[2]) / 3 + cy];
      const out = n[0] * mid[0] + n[1] * mid[1] * 0.2 + n[2] * mid[2] > 0;
      for (const v of (out ? [a, b, c] : [a, c, b])) { pos.push(v[0], v[1], v[2]); col.push(colour.r, colour.g, colour.b); }
    };
    for (let r = 0; r + 1 < ringPts.length; r++) {
      const A = ringPts[r], B = ringPts[r + 1];
      for (let i = 0; i < A.length; i++) {
        const j = (i + 1) % A.length;
        const c = colourAt((A[i][1] + B[i][1]) / 2, r);
        tri(A[i], A[j], B[i], c); tri(A[j], B[j], B[i], c.clone().multiplyScalar(0.97));
      }
    }
    const last = ringPts[ringPts.length - 1];
    for (let i = 0; i < last.length; i++) tri(last[i], last[(i + 1) % last.length], tip, colourAt(-60, 9));
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, kit.vcFlatMat); rock.name = 'rock'; root.add(rock);

    // The land itself hides anything below it (MapLibre's flat fills do not
    // write depth): an invisible copy of the island at ground level.
    const shape = new THREE.Shape(layout.island.map(([x, y]) => new THREE.Vector2(x, y)));
    const capGeo = keep(new THREE.ShapeGeometry(shape)); capGeo.rotateX(-Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, keep(new THREE.MeshBasicMaterial({ colorWrite: false })));
    cap.position.y = -0.03; cap.renderOrder = -10; root.add(cap);
  }

  /* -------------------------------------------------------------- clouds */
  const cloudTex = tex(256, 128, (c) => {
    const blob = (x, y, r, a = 0.95) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.6, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 128); };
    blob(70, 76, 46); blob(124, 60, 58); blob(182, 78, 46); blob(122, 86, 62); blob(90, 90, 40, 0.7);
  });
  const cloudMats = [];
  const clouds = new THREE.Group(); root.add(clouds);
  {
    const b = layout.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, rx = (b.maxX - b.minX) / 2, ry = (b.maxY - b.minY) / 2;
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * TAU + R() * 0.2, k = 1.05 + R() * 0.55;
      const m = keep(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.75 + R() * 0.2 }));
      cloudMats.push(m);
      const s = new THREE.Sprite(m);
      const w = 90 + R() * 110;
      s.scale.set(w, w * 0.45, 1);
      s.position.set(cx + Math.cos(a) * rx * k, -18 - R() * 40, -(cy + Math.sin(a) * ry * k));
      s.userData.drift = (R() - 0.5) * 0.6;
      clouds.add(s);
    }
  }

  /* -------------------------------------------------------------- paving */
  // Real paving where people walk most, in metres, so it holds up close.
  const pavingMats = [];
  const planarUV = (g, metresPerRepeat) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / metresPerRepeat; uv[i * 2 + 1] = p.getY(i) / metresPerRepeat; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const paverTex = (base, tiles, w = 64, h = 32) => {
    const t = tex(256, 256, (c) => {
      const r = rng(9);
      c.fillStyle = base; c.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 256 / h; row++) for (let col = -1; col <= 256 / w; col++) {
        c.fillStyle = tiles[Math.floor(r() * tiles.length)];
        rr(c, col * w + (row % 2) * w / 2 + 2, row * h + 2, w - 4, h - 4, 3); c.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const pave = (geo, map, y = 0.012) => {
    const m = keep(new THREE.MeshStandardMaterial({ map, roughness: 0.92 }));
    pavingMats.push(m);
    const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; root.add(mesh);
    return mesh;
  };
  const stoneTex = paverTex('#e3d3c4', ['#f6eee5', '#f2e7dc', '#efe2d5', '#f8f2ea']);
  const warmTex = paverTex('#dcc3b0', ['#f3e3d4', '#efdac8', '#f6e8dc', '#ead3c0']);
  const terracotta = paverTex('#d9b39c', ['#f0cfba', '#ebc4ad', '#f3d8c6', '#e7bea5'], 48, 48);
  {
    // Sellio Plaza: a mosaic in the middle, pavers round the edge
    const R0 = 27.5, R1 = 33.6;
    const mosaic = tex(1024, 1024, (c, w) => {
      const cx = w / 2, k = w / 2 / R0;
      c.fillStyle = '#f6efe7'; c.fillRect(0, 0, w, w);
      for (let i = 0; i < 24; i++) {
        const a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU;
        c.fillStyle = i % 2 ? '#f9e4ea' : '#fdf1e4';
        c.beginPath(); c.arc(cx, cx, 25.5 * k, a0, a1); c.arc(cx, cx, 9.5 * k, a1, a0, true); c.closePath(); c.fill();
      }
      c.strokeStyle = '#e9c9b5'; c.lineWidth = 0.35 * k;
      for (const r of [9.5, 14, 19.5, 25.5]) { c.beginPath(); c.arc(cx, cx, r * k, 0, TAU); c.stroke(); }
      c.strokeStyle = 'rgba(224,68,154,.35)'; c.lineWidth = 0.5 * k;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.beginPath(); c.moveTo(cx + Math.cos(a) * 14 * k, cx + Math.sin(a) * 14 * k); c.lineTo(cx + Math.cos(a) * 25.5 * k, cx + Math.sin(a) * 25.5 * k); c.stroke(); }
      const g = c.createLinearGradient(0, 0, w, w); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]);
      c.strokeStyle = g; c.lineWidth = 0.9 * k; c.beginPath(); c.arc(cx, cx, 26.6 * k, 0, TAU); c.stroke();
    });
    const inner = keep(new THREE.CircleGeometry(R0, 96)); inner.rotateX(-Math.PI / 2);
    pave(inner, mosaic).position.set(0, 0.012, 0);
    const ring = keep(planarUV(new THREE.RingGeometry(R0 - 0.02, R1, 96, 1), 3.2)); ring.rotateX(-Math.PI / 2);
    pave(ring, stoneTex);
    // the F&B boulevard and Makan Square
    const blv = keep(planarUV(new THREE.PlaneGeometry(270, BOULEVARD_HALF * 2 - 0.2), 3.2)); blv.rotateX(-Math.PI / 2);
    pave(blv, warmTex).position.set(-167, 0.012, -FNB_BOULEVARD_Y);
    const sq = keep(planarUV(new THREE.RingGeometry(4.4, 21.8, 72, 1), 3)); sq.rotateX(-Math.PI / 2);
    pave(sq, terracotta, 0.014).position.set(-175, 0.014, -FNB_BOULEVARD_Y);
    const fore = keep(planarUV(new THREE.CircleGeometry(9.9, 48), 3)); fore.rotateX(-Math.PI / 2);
    pave(fore, terracotta, 0.014).position.set(-28, 0.014, -FNB_BOULEVARD_Y);
  }

  /* --------------------------------------------------------------- trees */
  const shadowTex = tex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(30,40,30,.34)'); g.addColorStop(1, 'rgba(30,40,30,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  for (const t of layout.trees) {
    const s = t.s * TREE * (0.9 + R() * 0.25), base = mm(at(t.x, t.y), RY(R() * TAU), S(s));
    const l1 = jitter(pick(LEAVES), 0.92 + R() * 0.16), l2 = jitter(pick(LEAVES), 0.9 + R() * 0.2);
    if (t.v === 1) {
      // palm: a leaning trunk and drooping fronds
      const lean = 0.12 + R() * 0.1;
      for (let k = 0; k < 5; k++) flat.push([G.cyl, mm(base.clone(), RZ(lean * k * 0.2), T(lean * k * 0.9, 0.55 + k * 1.02, 0), S(0.17 - k * 0.012, 1.06, 0.17 - k * 0.012)), k % 2 ? '#8a6446' : '#9c7352']);
      const top = mm(base.clone(), T(lean * 4.6, 5.2, 0));
      for (let k = 0; k < 7; k++) flat.push([G.box, mm(top.clone(), RY(k / 7 * TAU), RX(0.42), T(0, 0, 1.25), S(0.62, 0.07, 2.6)), k % 2 ? l1 : l2]);
      for (let k = 0; k < 3; k++) flat.push([G.ico, mm(top.clone(), RY(k * 2.1), T(0.28, -0.25, 0), S(0.17)), '#6b4a2a']);
      shadows.push([t.x, t.y, 4.2 * s]);
    } else if (t.v === 2) {
      // cypress
      flat.push([G.cyl, mm(base.clone(), T(0, 0.6, 0), S(0.16, 1.2, 0.16)), '#6e4a33']);
      flat.push([cone7, mm(base.clone(), T(0, 2.3, 0), S(1.25, 3.0, 1.25)), jitter('#2f7d4f', 0.9 + R() * 0.2)]);
      flat.push([cone7, mm(base.clone(), T(0, 3.9, 0), S(0.9, 2.2, 0.9)), jitter('#3a8b57', 0.9 + R() * 0.2)]);
      shadows.push([t.x, t.y, 3.0 * s]);
    } else {
      // round leafy tree
      flat.push([G.cyl, mm(base.clone(), T(0, 0.95, 0), S(0.17, 1.9, 0.17)), '#7a5238']);
      flat.push([G.ico, mm(base.clone(), T(0, 2.75, 0), S(1.45)), l1]);
      flat.push([G.ico, mm(base.clone(), T(0.62, 3.25, 0.3), S(1.05)), l2]);
      flat.push([G.ico, mm(base.clone(), T(-0.55, 3.05, -0.35), S(1.0)), jitter(l1, 1.08)]);
      shadows.push([t.x, t.y, 4.6 * s]);
    }
  }

  for (const b of layout.bushes) {
    const o = mm(at(b.x, b.y), RY(R() * TAU), S(b.s * 1.2));
    const leaf = jitter(pick(LEAVES), 0.85 + R() * 0.2);
    flat.push([G.ico, mm(o.clone(), T(0, 0.45, 0), S(0.75, 0.6, 0.75)), leaf]);
    flat.push([G.ico, mm(o.clone(), T(0.5, 0.35, 0.2), S(0.5, 0.42, 0.5)), jitter(leaf, 1.08)]);
    if (b.f) for (let k = 0; k < 4; k++) flat.push([G.ico, mm(o.clone(), T(Math.cos(k * 1.7) * 0.45, 0.8 + (k % 2) * 0.12, Math.sin(k * 1.7) * 0.45), S(0.13)), pick(FLOWERS)]);
  }

  /* --------------------------------------------- lamps, benches and beds */
  const lampHeads = [];
  for (const [x, y] of layout.lamps) {
    smooth.push([G.cyl, mm(at(x, y), T(0, 0.15, 0), S(0.16, 0.3, 0.16)), '#3b2a45']);
    smooth.push([G.cyl, mm(at(x, y), T(0, 1.9, 0), S(0.065, 3.6, 0.065)), '#3b2a45']);
    smooth.push([G.cyl, mm(at(x, y), T(0, 3.72, 0), S(0.2, 0.08, 0.2)), '#3b2a45']);
    lampHeads.push([ball, mm(at(x, y), T(0, 3.95, 0), S(0.2, 0.24, 0.2))]);
    smooth.push([cone10, mm(at(x, y), T(0, 4.26, 0), S(0.26, 0.2, 0.26)), '#3b2a45']);
    glowSpots.push(new THREE.Vector3(x, 3.95, -y));
  }
  for (const b of layout.benches) {
    const o = mm(at(b.x, b.y), RY(b.rot));
    smooth.push([G.box, mm(o.clone(), T(0, 0.46, 0), S(1.8, 0.08, 0.48)), '#b07a52']);
    smooth.push([G.box, mm(o.clone(), T(0, 0.78, -0.22), RX(-0.12), S(1.8, 0.42, 0.06)), '#b07a52']);
    for (const s of [-1, 1]) smooth.push([G.box, mm(o.clone(), T(s * 0.75, 0.23, -0.02), S(0.08, 0.46, 0.44)), '#3b2a45']);
  }
  for (const b of layout.beds) {
    const o = mm(at(b.x, b.y), RY(b.rot || 0));
    smooth.push([G.box, mm(o.clone(), T(0, 0.22, 0), S(b.w, 0.44, b.d)), '#eadfd1']);
    smooth.push([G.box, mm(o.clone(), T(0, 0.45, 0), S(b.w - 0.24, 0.04, b.d - 0.24)), '#6b4a3a']);
    const n = Math.max(6, Math.round(b.w * b.d * 2.2));
    for (let k = 0; k < n; k++) {
      const px = (R() - 0.5) * (b.w - 0.5), pz = (R() - 0.5) * (b.d - 0.5);
      if (R() < 0.3) flat.push([G.ico, mm(o.clone(), T(px, 0.62, pz), S(0.32)), jitter('#4f9e5a', 0.9 + R() * 0.25)]);
      else flat.push([G.ico, mm(o.clone(), T(px, 0.6 + R() * 0.12, pz), S(0.15 + R() * 0.08)), pick(FLOWERS)]);
    }
  }

  /* --------------------------------------------- café tables, Makan Square */
  layout.umbrellas.forEach(([x, y], i) => {
    smooth.push([G.cyl, mm(at(x, y), T(0, 1.25, 0), S(0.05, 2.5, 0.05)), '#efe6dc']);
    smooth.push([G.cyl, mm(at(x, y), T(0, 0.74, 0), S(0.62, 0.06, 0.62)), '#f8f1e8']);
    smooth.push([G.cyl, mm(at(x, y), T(0, 0.37, 0), S(0.06, 0.74, 0.06)), '#3b2a45']);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + i;
      smooth.push([G.box, mm(at(x, y), RY(a), T(0, 0.42, 0.95), S(0.42, 0.06, 0.42)), '#c98a5c']);
      smooth.push([G.box, mm(at(x, y), RY(a), T(0, 0.66, 1.14), S(0.42, 0.44, 0.05)), '#c98a5c']);
    }
    canopies.push([cone10, mm(at(x, y), T(0, 2.62, 0), S(1.75, 0.6, 1.75)), UMBRELLAS[i % UMBRELLAS.length]]);
    shadows.push([x, y, 4.4]);
  });
  // café terraces in front of the storefronts
  for (const c of layout.terraces) {
    smooth.push([G.cyl, mm(at(c.x, c.y), T(0, 0.74, 0), S(0.5, 0.05, 0.5)), '#fbf6ef']);
    smooth.push([G.cyl, mm(at(c.x, c.y), T(0, 0.37, 0), S(0.05, 0.74, 0.05)), '#3b2a45']);
    smooth.push([G.cyl, mm(at(c.x, c.y), T(0, 1.15, 0), S(0.035, 2.3, 0.035)), '#efe6dc']);
    canopies.push([cone10, mm(at(c.x, c.y), T(0, 2.35, 0), S(1.3, 0.42, 1.3)), UMBRELLAS[(c.i + 1) % UMBRELLAS.length]]);
    for (const a of [0.6, 2.6, 4.6]) {
      smooth.push([G.box, mm(at(c.x, c.y), RY(a), T(0, 0.42, 0.78), S(0.38, 0.05, 0.38)), '#2f2a3d']);
      smooth.push([G.box, mm(at(c.x, c.y), RY(a), T(0, 0.65, 0.96), S(0.38, 0.42, 0.04)), '#2f2a3d']);
    }
    shadows.push([c.x, c.y, 3.2]);
  }

  // a planted island in the middle of the square, with a big shade tree
  flat.push([G.cyl, mm(at(-175, FNB_BOULEVARD_Y), T(0, 0.25, 0), S(4.4, 0.5, 4.4)), '#e9dccd']);
  flat.push([G.cyl, mm(at(-175, FNB_BOULEVARD_Y), T(0, 1.6, 0), S(0.3, 2.6, 0.3)), '#7a5238']);
  for (const [dx, dy, dz, s] of [[0, 4.2, 0, 2.6], [1.6, 4.9, 0.6, 1.8], [-1.5, 4.6, -0.8, 1.9], [0.3, 5.6, -0.4, 1.6]]) flat.push([G.ico, mm(at(-175, FNB_BOULEVARD_Y), T(dx, dy, dz), S(s)), jitter(pick(LEAVES), 0.95 + R() * 0.15)]);
  for (let k = 0; k < 26; k++) { const a = k / 26 * TAU; flat.push([G.ico, mm(at(-175 + Math.cos(a) * 3.9, FNB_BOULEVARD_Y + Math.sin(a) * 3.9), T(0, 0.62, 0), S(0.22)), FLOWERS[k % FLOWERS.length]]); }
  shadows.push([-175, FNB_BOULEVARD_Y, 9]);

  /* --------------------------------------------------- the canal bridge */
  {
    const { x, y, length, width } = layout.bridge;
    const segs = 14;
    for (let k = 0; k < segs; k++) {
      const u0 = k / segs - 0.5, u1 = (k + 1) / segs - 0.5;
      const h0 = Math.cos(u0 * Math.PI) * 1.4, h1 = Math.cos(u1 * Math.PI) * 1.4;
      const xm = x + (u0 + u1) / 2 * length, hm = (h0 + h1) / 2, ang = Math.atan2(h1 - h0, length / segs);
      smooth.push([G.box, mm(at(xm, y), T(0, hm, 0), RZ(ang), S(length / segs + 0.05, 0.3, width)), '#f2e6d8']);
      for (const s of [-1, 1]) smooth.push([G.box, mm(at(xm, y), T(0, hm + 0.55, s * (width / 2 - 0.1)), RZ(ang), S(length / segs + 0.05, 0.08, 0.12)), '#8b2fc9']);
      if (k % 2 === 0) for (const s of [-1, 1]) smooth.push([G.box, mm(at(xm, y), T(0, hm + 0.3, s * (width / 2 - 0.1)), S(0.1, 0.55, 0.1)), '#efe2d0']);
    }
    for (const s of [-1, 1]) smooth.push([G.box, mm(at(x + s * (length / 2 + 0.6), y), T(0, 0.1, 0), S(1.6, 0.2, width + 0.6)), '#e2d4c3']);
  }

  /* ------------------------------------------- districts still being built */
  for (const c of layout.cranes) {
    const o = mm(at(c.x, c.y), RY(c.rot));
    const h = c.h;
    smooth.push([G.box, mm(o.clone(), T(0, 0.3, 0), S(3.2, 0.6, 3.2)), '#9a96a6']);
    for (let k = 0; k < Math.floor(h / 2.4); k++) {
      smooth.push([G.box, mm(o.clone(), T(0, 0.6 + k * 2.4 + 1.2, 0), S(1.3, 2.4, 1.3)), k % 2 ? '#f2b632' : '#f5c247']);
      smooth.push([G.box, mm(o.clone(), T(0, 0.6 + k * 2.4 + 1.2, 0.66), RZ(k % 2 ? 0.6 : -0.6), S(0.1, 2.6, 0.06)), '#d99a1b']);
    }
    smooth.push([G.box, mm(o.clone(), T(0, h + 0.4, 1.0), S(1.7, 1.5, 1.7)), '#fdfaf5']);
    smooth.push([G.box, mm(o.clone(), T(8.5, h + 1.4, 0), S(19, 0.8, 0.9)), '#f2b632']);
    smooth.push([G.box, mm(o.clone(), T(-4.2, h + 1.4, 0), S(7, 0.8, 0.9)), '#f2b632']);
    smooth.push([G.box, mm(o.clone(), T(-6.6, h + 0.4, 0), S(1.8, 1.8, 1.5)), '#8f8a99']);
    smooth.push([G.pyramid, mm(o.clone(), T(0, h + 3.4, 0), S(0.9, 3, 0.9)), '#f2b632']);
    smooth.push([G.cyl, mm(o.clone(), T(14, h * 0.7, 0), S(0.035, h * 0.6, 0.035)), '#3b2a45']);
    smooth.push([G.box, mm(o.clone(), T(14, h * 0.4, 0), S(0.6, 0.7, 0.6)), '#e0449a']);
    smooth.push([G.box, mm(o.clone(), T(14, h * 0.4 - 1.2, 0), S(2.6, 0.5, 1.2)), '#c9b8a6']);
  }
  const boardGroup = new THREE.Group(); root.add(boardGroup);
  for (const b of layout.boards) {
    const d = DISTRICTS.find((x) => x.key === b.key);
    const t = tex(768, 300, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]);
      c.fillStyle = g; rr(c, 0, 0, w, h, 34); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6; c.setLineDash([22, 14]); rr(c, 16, 16, w - 32, h - 32, 24); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, d.name, 700, FONT_DISPLAY, 92, w - 90); c.fillText(d.name, w / 2, 118);
      c.fillStyle = 'rgba(255,255,255,.9)'; fitFont(c, 'Coming soon to Sellio World', 600, FONT_DISPLAY, 46, w - 90); c.fillText('Coming soon to Sellio World', w / 2, 210);
    });
    const face = new THREE.Mesh(G.plane, keep(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.7 })));
    face.scale.set(6.4, 2.5, 1); face.position.set(b.x, 3.2, -b.y - 0.07); face.rotation.y = Math.PI; face.userData.comingSoon = b.key;
    const back = face.clone(); back.position.z = -b.y + 0.07; back.rotation.y = 0;
    boardGroup.add(face, back);
    for (const s of [-1, 1]) smooth.push([G.box, mm(at(b.x + s * 2.6, b.y), T(0, 1.9, 0), S(0.18, 3.8, 0.18)), '#3b2a45']);
    smooth.push([G.box, mm(at(b.x, b.y), T(0, 3.2, 0), S(6.6, 2.7, 0.1)), '#2a1838']);
  }

  /* ------------------------------------------------- the F&B gateway arch */
  const archTex = tex(1024, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 4; rr(c, 10, 10, w - 20, h - 20, 16); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 24px ${FONT_DISPLAY}`; try { c.letterSpacing = '8px'; } catch { /* older browsers */ }
    c.fillText('SELLIO WORLD', w / 2, 40);
    try { c.letterSpacing = '0px'; } catch { /* older browsers */ }
    c.font = `700 70px ${FONT_DISPLAY}`; c.fillText('F&B District', w / 2, 104);
  });
  {
    const ax = -46, ay = FNB_BOULEVARD_Y, span = BOULEVARD_HALF * 2 - 0.6;
    for (const s of [-1, 1]) {
      smooth.push([G.box, mm(at(ax, ay + s * span / 2), T(0, 2.8, 0), S(0.9, 5.6, 0.9)), '#5b2a86']);
      smooth.push([G.box, mm(at(ax, ay + s * span / 2), T(0, 0.2, 0), S(1.2, 0.4, 1.2)), '#f3c14b']);
      smooth.push([G.box, mm(at(ax, ay + s * span / 2), T(0, 5.7, 0), S(1.15, 0.28, 1.15)), '#f3c14b']);
    }
    smooth.push([G.box, mm(at(ax, ay), T(0, 6.4, 0), S(0.5, 1.6, span + 1)), '#5b2a86']);
    const face = new THREE.Mesh(G.plane, keep(new THREE.MeshStandardMaterial({ map: archTex, emissive: 0xffffff, emissiveMap: archTex, emissiveIntensity: 0.22, roughness: 0.6 })));
    face.scale.set(span + 1, 1.6, 1);
    const f1 = face.clone(); f1.position.set(ax + 0.26, 6.4, -ay); f1.rotation.y = Math.PI / 2;
    const f2 = face.clone(); f2.position.set(ax - 0.26, 6.4, -ay); f2.rotation.y = -Math.PI / 2;
    root.add(f1, f2);
    for (let k = 0; k <= 16; k++) glowSpots.push(new THREE.Vector3(ax + 0.3, 5.45, -(ay - span / 2 + k * span / 16)));
  }

  /* ------------------------------------------------------- merged meshes */
  if (flat.length) root.add(new THREE.Mesh(keep(mergeParts(flat)), kit.vcFlatMat));
  if (smooth.length) root.add(new THREE.Mesh(keep(mergeParts(smooth)), kit.vcMat));
  if (canopies.length) root.add(new THREE.Mesh(keep(mergeParts(canopies)), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true }))));
  const lampMat = keep(new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffd27a', emissiveIntensity: 0.6, roughness: 0.4 }));
  if (lampHeads.length) root.add(new THREE.Mesh(keep(mergeParts(lampHeads)), lampMat));
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  if (shadows.length) {
    const sh = new THREE.Mesh(keep(mergeParts(shadows.map(([x, y, s]) => [G.plane, mm(at(x, y, 0.025), RX(-Math.PI / 2), S(s, s, 1))]), true)), shadowMat);
    sh.renderOrder = 1; root.add(sh);
  }
  const lampGlow = createGlowPoints(kit, glowSpots, { size: 1.5, opacity: 0.5, color: '#ffd27a' });
  root.add(lampGlow.object);

  /* --------------------------------------------------------- Sellio Hop pads */
  const padTex = tex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, GRAD[0]); g.addColorStop(0.55, GRAD[1]); g.addColorStop(1, GRAD[2]);
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(w / 2, h / 2, 34 + k * 14, k * 0.9, k * 0.9 + 2.2); c.stroke(); }
    c.fillStyle = '#fff'; c.font = `700 96px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', w / 2, h / 2 + 6);
  });
  const padSoonTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#cfc6da'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 6; c.setLineDash([14, 12]); c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 20, 0, TAU); c.stroke();
    c.fillStyle = '#fff'; c.font = `700 96px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', w / 2, h / 2 + 6);
  });
  const beamTex = tex(32, 128, (c, w, h) => { const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const ringGeo = keep(new THREE.TorusGeometry(PAD_RADIUS, 0.16, 8, 64)); ringGeo.rotateX(Math.PI / 2);
  const discGeo = keep(new THREE.CircleGeometry(PAD_RADIUS - 0.2, 48)); discGeo.rotateX(-Math.PI / 2);
  const beamGeo = keep(new THREE.CylinderGeometry(PAD_RADIUS - 0.4, PAD_RADIUS - 0.2, 14, 32, 1, true)); beamGeo.translate(0, 7, 0);
  const padBaseGeo = keep(new THREE.CylinderGeometry(PAD_RADIUS + 0.5, PAD_RADIUS + 0.7, 0.24, 48)); padBaseGeo.translate(0, 0.12, 0);
  const padLiveMat = keep(new THREE.MeshStandardMaterial({ map: padTex, emissive: 0xffffff, emissiveMap: padTex, emissiveIntensity: 0.35, roughness: 0.5 }));
  const padSoonMat = keep(new THREE.MeshStandardMaterial({ map: padSoonTex, roughness: 0.7 }));
  const ringLiveMat = keep(new THREE.MeshStandardMaterial({ color: '#ff9ad5', emissive: '#e0449a', emissiveIntensity: 1.1, roughness: 0.4 }));
  const ringSoonMat = keep(new THREE.MeshStandardMaterial({ color: '#d8cfe3', roughness: 0.6 }));
  const baseMat = std('#f6efe8');
  const pads = layout.pads.map((p) => {
    const g = new THREE.Group(); g.position.set(p.x, 0, -p.y); root.add(g);
    g.add(new THREE.Mesh(padBaseGeo, baseMat));
    const disc = new THREE.Mesh(discGeo, p.live ? padLiveMat : padSoonMat); disc.position.y = 0.25; g.add(disc);
    const ring = new THREE.Mesh(ringGeo, p.live ? ringLiveMat : ringSoonMat); ring.position.y = 0.3; g.add(ring);
    let beam = null;
    if (p.live) {
      beam = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ map: beamTex, color: '#e0449a', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
      beam.renderOrder = 5; beam.position.y = 0.3; g.add(beam);
    }
    const hit = new THREE.Mesh(G.cyl, kit.hitMat); hit.scale.set(PAD_RADIUS + 0.6, 1.2, PAD_RADIUS + 0.6); hit.position.y = 0.6; g.add(hit);
    hit.userData.pad = p;
    return { ...p, group: g, disc, ring, beam, hit };
  });

  /* ------------------------------- Sellio Plaza: fountain and the giant coin */
  const plaza = new THREE.Group(); plaza.position.set(layout.fountain.x, 0, -layout.fountain.y); root.add(plaza);
  const coinFace = tex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(96, 88, 10, w / 2, h / 2, w / 2); g.addColorStop(0, '#fff1a8'); g.addColorStop(0.45, '#ffc23d'); g.addColorStop(1, '#e09a12');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,70,0,.45)'; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, h / 2, 104, 0, TAU); c.stroke();
    c.fillStyle = '#8a5200'; c.font = `700 150px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', w / 2, h / 2 + 10);
  });
  {
    const r = layout.fountain.r;
    const rim = keep(new THREE.TorusGeometry(1, 0.06, 8, 64)); rim.rotateX(Math.PI / 2);
    const basin = keep(mergeParts([
      [G.cyl, mm(T(0, 0.25, 0), S(r, 0.5, r)), '#efe4d8'],
      [rim, mm(T(0, 0.62, 0), S(r, 2.2, r)), '#f8f1e9'],
      [G.cyl, mm(T(0, 1.6, 0), S(1.3, 3.2, 1.3)), '#efe4d8'],
      [G.cyl, mm(T(0, 3.25, 0), S(2.4, 0.3, 2.4)), '#f8f1e9'],
      [G.cyl, mm(T(0, 3.6, 0), S(0.6, 0.6, 0.6)), '#f3c14b'],
    ]));
    plaza.add(new THREE.Mesh(basin, kit.vcMat));
    const water = new THREE.Mesh(G.cyl, keep(new THREE.MeshStandardMaterial({ color: '#86d3ec', emissive: '#3aa6cc', emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1 })));
    water.scale.set(r - 0.1, 0.12, r - 0.1); water.position.y = 0.52; plaza.add(water);
  }
  const jetMat = keep(new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.55, depthWrite: false }));
  const jets = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU, j = new THREE.Mesh(cone7, jetMat);
    j.position.set(Math.cos(a) * 4.4, 1.6, Math.sin(a) * 4.4); j.rotation.z = Math.cos(a) * 0.35; j.rotation.x = -Math.sin(a) * 0.35; j.scale.set(0.18, 1.8, 0.18);
    plaza.add(j); jets.push(j);
  }
  const coin = new THREE.Group(); coin.position.y = 8.2; plaza.add(coin);
  {
    const coinSide = keep(new THREE.MeshStandardMaterial({ color: '#f5b91f', metalness: 0.55, roughness: 0.3, emissive: '#5a3500', emissiveIntensity: 0.35 }));
    const coinFaceMat = keep(new THREE.MeshStandardMaterial({ map: coinFace, metalness: 0.3, roughness: 0.35, emissive: 0xffffff, emissiveMap: coinFace, emissiveIntensity: 0.25 }));
    const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 48)), [coinSide, coinFaceMat, coinFaceMat]);
    m.rotation.x = Math.PI / 2; coin.add(m);
    const glow = kit.glowSprite('#ffd36b', 9, 0.45); own.push(glow.material); coin.add(glow);
  }

  /* ----------------------------------------------------------- animation */
  let theme = 'day';
  function update(dt, t, camera) {
    coin.rotation.y += dt * 0.9 * (motion || 0.3);
    coin.position.y = 8.2 + Math.sin(t * 1.3) * 0.35 * motion;
    jets.forEach((j, k) => { j.scale.y = 1.8 + Math.sin(t * 3 + k) * 0.25 * motion; });
    for (const p of pads) {
      if (!p.live) continue;
      p.disc.rotation.y += dt * 0.6 * (motion || 0.2);
      p.ring.scale.setScalar(1 + Math.sin(t * 2.6 + p.x) * 0.025 * motion);
      // the light beams help find pads from afar; up close they would wash out the view
      const far = camera ? Math.max(0, Math.min(1, (camera.position.distanceTo(p.group.position) - 45) / 70)) : 1;
      p.beam.material.opacity = ((theme === 'dusk' ? 0.34 : 0.22) + Math.sin(t * 2 + p.y) * 0.05 * motion) * far;
      p.beam.visible = far > 0.01;
    }
    for (const c of clouds.children) c.position.x += c.userData.drift * dt * motion;
  }
  function setTheme(name) {
    theme = name;
    const dusk = name === 'dusk';
    lampMat.emissiveIntensity = dusk ? 2.2 : 0.6;
    lampGlow.opacity = dusk ? 0.95 : 0.35;
    ringLiveMat.emissiveIntensity = dusk ? 1.8 : 1.1;
    padLiveMat.emissiveIntensity = dusk ? 0.6 : 0.35;
    for (const m of cloudMats) m.color.set(dusk ? '#ffc2d6' : '#ffffff');
    for (const m of pavingMats) m.color.set(dusk ? '#d9bfc4' : '#ffffff');
  }
  setTheme('day');

  return {
    root, pads, update, setTheme,
    pickables: [...pads.map((p) => p.hit), ...boardGroup.children],
    dispose() {
      root.removeFromParent(); lampGlow.dispose();
      for (const o of own) o.dispose?.();
    },
  };
}

// Points spaced evenly along a closed outline.
function resample(pts, n) {
  const seg = [], total = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); seg.push(l); return s + l; }, 0);
  const out = []; let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = k / n * total;
    while (acc + seg[i] < d) { acc += seg[i]; i++; }
    const p = pts[i], q = pts[(i + 1) % pts.length], t = (d - acc) / (seg[i] || 1);
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
}
