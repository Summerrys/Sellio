import * as THREE from 'three';
import { rr, fitFont, hashSeed, rng } from '../engine/kit';
import { FONT_DISPLAY as FONT_D } from '../engine/constants';
import { loadImage } from '../engine/images';

// Full storefront buildings for the F&B District, in the spirit of the
// Cafetelier render: a two-storey stone, brick or stucco shophouse with the
// merchant's colour on the trim and awnings, a lit display window, a door
// with steps, lamps, topiaries and the shop's name and logo. Each building is
// a few merged meshes; small details hide when the camera is far away.

const W = 12.5, D = 11.5, H = 8.6;
const FRONT = D / 2;
const FACADES = [
  { wall: '#efe5d3', joint: 'rgba(120,100,70,.10)', base: '#d9ccb6', name: 'stone' },
  { wall: '#c96f55', joint: 'rgba(255,240,230,.18)', base: '#9c4e3a', name: 'brick' },
  { wall: '#f4d7c8', joint: 'rgba(120,80,60,.06)', base: '#e0b9a6', name: 'stucco' },
  { wall: '#dfe8ef', joint: 'rgba(60,80,100,.07)', base: '#c6d2dc', name: 'stucco-blue' },
];
const validColour = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fallback);
const shade = (hex, k) => {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), Math.max(0, Math.min(1, hsl.l * k)));
  return '#' + c.getHexString();
};

export function createStorefrontFactory(kit) {
  const { G, T, S, RX, RY, mm, mergeParts, canvasTex, std } = kit;
  const own = [];
  const keep = (o) => { own.push(o); return o; };
  const facadeTex = new Map();
  const wallTexture = (f) => {
    if (facadeTex.has(f.name)) return facadeTex.get(f.name);
    const t = keep(kit.untrack(canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = f.wall; c.fillRect(0, 0, w, h);
      c.fillStyle = f.joint;
      if (f.name === 'brick') for (let y = 0; y < h; y += 16) { c.fillRect(0, y, w, 2); for (let x = (y / 16) % 2 ? 0 : 16; x < w; x += 32) c.fillRect(x, y, 2, 16); }
      else for (let y = 0; y < h; y += 32) { c.fillRect(0, y, w, 2); for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) c.fillRect(x, y, 2, 32); }
    }, [W / 4, H / 4])));
    facadeTex.set(f.name, t); return t;
  };
  const awningMats = new Map();
  const awningMat = (a, b) => {
    const k = a + b;
    if (!awningMats.has(k)) {
      const tex = keep(kit.untrack(canvasTex(256, 64, (c, w, h) => { const n = 8, sw = w / n; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(i * sw, 0, sw + 1, h); } c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, h - 6, w, 6); })));
      awningMats.set(k, keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide })));
    }
    return awningMats.get(k);
  };
  const curtainTex = keep(kit.untrack(canvasTex(64, 96, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe2b0'); g.addColorStop(1, '#f6b875');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff6ea'; c.fillRect(0, 0, 18, h); c.fillRect(w - 18, 0, 18, h);
    c.fillStyle = 'rgba(160,110,80,.25)'; for (let x = 3; x < 18; x += 5) { c.fillRect(x, 0, 1.5, h); c.fillRect(w - x, 0, 1.5, h); }
    c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 1, 0, 2, h); c.fillRect(0, h / 2 - 1, w, 2);
  })));
  const upperMat = keep(new THREE.MeshStandardMaterial({ map: curtainTex, emissive: 0xffffff, emissiveMap: curtainTex, emissiveIntensity: 0.35, roughness: 0.7 }));
  const glassMat = keep(new THREE.MeshStandardMaterial({ color: '#9fc4d8', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }));
  const lampMat = std('#fff3d1', { emissive: '#ffd27a', emissiveIntensity: 1.6 });
  const shadowTex = keep(kit.untrack(canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 20, 64, 64, 64); g.addColorStop(0, 'rgba(40,20,50,.35)'); g.addColorStop(1, 'rgba(40,20,50,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); })));
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const plotSignTex = keep(kit.untrack(canvasTex(512, 200, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fb923c'); g.addColorStop(0.55, '#e0449a'); g.addColorStop(1, '#8b2fc9');
    c.fillStyle = g; rr(c, 0, 0, w, h, 26); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, 'Your café here', 700, FONT_D, 58, w - 60); c.fillText('Your café here', w / 2, 82);
    c.fillStyle = 'rgba(255,255,255,.88)'; fitFont(c, 'Open a Sellio storefront', 500, FONT_D, 30, w - 60); c.fillText('Open a Sellio storefront', w / 2, 142);
  })));
  const plotSignMat = keep(new THREE.MeshStandardMaterial({ map: plotSignTex, emissive: 0xffffff, emissiveMap: plotSignTex, emissiveIntensity: 0.25 }));
  const hoardingTex = keep(kit.untrack(canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#f6eefa'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0449a'; for (let x = -h; x < w; x += 28) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 14, h); c.lineTo(x + 14 + h, 0); c.lineTo(x + h, 0); c.fill(); } })));
  const hoardingMat = keep(new THREE.MeshStandardMaterial({ map: hoardingTex, roughness: 0.9 }));

  // The view into the shop: warm light, shelves, a pastry counter and a menu screen.
  function interiorTexture(tint, seed) {
    const r = rng(seed);
    return keep(kit.untrack(canvasTex(512, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff1d6'); g.addColorStop(1, '#f2c98f');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(80 + i * 170, 18, 42, 10, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#6b4a3a'; for (const y of [70, 110]) c.fillRect(20, y, 200, 6);
      for (let i = 0; i < 14; i++) { c.fillStyle = ['#3b2318', '#d9b28c', '#efe1cf', tint][Math.floor(r() * 4)]; c.fillRect(26 + i * 14, (i % 2 ? 50 : 90), 9, 20); }
      c.fillStyle = '#20142b'; rr(c, 290, 40, 170, 80, 8); c.fill();
      c.fillStyle = tint; c.fillRect(300, 52, 70, 8); c.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 4; i++) c.fillRect(300, 70 + i * 11, 120 - i * 15, 4);
      c.fillStyle = '#d9d2c9'; c.fillRect(0, 160, w, 96);
      c.fillStyle = 'rgba(190,225,240,.55)'; c.fillRect(10, 150, w - 20, 50);
      for (let i = 0; i < 16; i++) { c.fillStyle = ['#c98543', '#e8b25e', '#a8642c', '#f2d7a6', tint][Math.floor(r() * 5)]; c.beginPath(); c.ellipse(30 + i * 30, 180, 11, 7, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = shade(tint, 0.55); c.fillRect(0, 205, w, 51);
    })));
  }

  function signTexture(shop, tint, logo) {
    return keep(kit.untrack(canvasTex(512, 300, (c, w, h) => {
      c.fillStyle = tint; rr(c, 6, 6, w - 12, h - 12, 120); c.fill();
      c.strokeStyle = '#f3c14b'; c.lineWidth = 10; rr(c, 14, 14, w - 28, h - 28, 112); c.stroke();
      if (logo) {
        const s = 190; c.save(); c.beginPath(); c.arc(w / 2, h / 2, s / 2, 0, Math.PI * 2); c.clip();
        c.fillStyle = '#fff'; c.fillRect(w / 2 - s / 2, h / 2 - s / 2, s, s);
        const k = Math.min(s / logo.naturalWidth, s / logo.naturalHeight);
        c.drawImage(logo, w / 2 - logo.naturalWidth * k / 2, h / 2 - logo.naturalHeight * k / 2, logo.naturalWidth * k, logo.naturalHeight * k);
        c.restore();
      } else {
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 170px ${FONT_D}`;
        c.fillText((shop.name || '?').trim().charAt(0).toUpperCase(), w / 2, h / 2 + 8);
      }
    })));
  }
  function fasciaTexture(shop, tint) {
    return keep(kit.untrack(canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = shade(tint, 0.62); c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f3c14b'; c.lineWidth = 5; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#fff8ea'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const name = (shop.name || '').trim();
      fitFont(c, name, 700, FONT_D, 74, w - 80); c.fillText(name, w / 2, h / 2 + 4);
    })));
  }

  /** A storefront for `shop` on a plot, facing +z in its own frame. */
  function buildStorefront(shop) {
    const seed = hashSeed(String(shop.tenant_id || shop.slug || shop.name));
    const r = rng(seed);
    const tint = validColour(shop.tint, '#5b2a86');
    const trim = shade(tint, 0.62), trimLight = shade(tint, 0.9);
    const f = FACADES[seed % FACADES.length];
    const root = new THREE.Group(); root.name = `storefront:${shop.slug || shop.tenant_id}`;
    const near = new THREE.Group(); root.add(near);

    // shell: body, cornices, pilasters, plinth and roof parapet in one mesh
    const parts = [
      [G.box, mm(T(0, H / 2, 0), S(W, H, D)), f.wall],
      [G.box, mm(T(0, 0.25, FRONT + 0.15), S(W + 0.4, 0.5, 0.5)), f.base],
      [G.box, mm(T(0, 3.55, FRONT + 0.2), S(W + 0.3, 0.32, 0.5)), trim],
      [G.box, mm(T(0, H + 0.25, 0), S(W + 0.5, 0.5, D + 0.5)), f.base],
      [G.box, mm(T(0, H + 0.75, FRONT - 0.1), S(W + 0.5, 0.5, 0.3)), f.base],
      [G.box, mm(T(-W / 2 + 0.35, 1.8, FRONT + 0.12), S(0.6, 3.6, 0.3)), f.base],
      [G.box, mm(T(W / 2 - 0.35, 1.8, FRONT + 0.12), S(0.6, 3.6, 0.3)), f.base],
      // window and door frames
      [G.box, mm(T(2.35, 3.0, FRONT + 0.08), S(6.3, 0.16, 0.2)), trim],
      [G.box, mm(T(2.35, 0.62, FRONT + 0.08), S(6.3, 0.16, 0.2)), trim],
      [G.box, mm(T(-0.8, 1.8, FRONT + 0.08), S(0.16, 2.5, 0.2)), trim],
      [G.box, mm(T(5.5, 1.8, FRONT + 0.08), S(0.16, 2.5, 0.2)), trim],
      [G.box, mm(T(-2.9, 1.5, FRONT + 0.05), S(2.1, 3.0, 0.16)), trim],
      // steps
      [G.box, mm(T(-2.9, 0.09, FRONT + 0.75), S(2.6, 0.18, 0.9)), f.base],
      [G.box, mm(T(-2.9, 0.27, FRONT + 0.45), S(2.4, 0.18, 0.5)), f.base],
      // lamp housings
      ...[-4.35, -1.45].map((x) => [G.box, mm(T(x, 2.6, FRONT + 0.16), S(0.18, 0.5, 0.18)), '#2b1d33']),
    ];
    // a slate roof behind the parapet, with a chimney and a skylight
    const roofH = 2.3, k = roofH / 1.5;
    parts.push([G.roofPrism, mm(T(0, H + 0.5 + 0.5 * k, -0.5), RY(Math.PI / 2), S((D - 0.9) / Math.sqrt(3), k, W - 0.2)), '#858c9b']);
    parts.push([G.box, mm(T(0, H + 0.5 + roofH - 0.04, -0.5), S(W - 0.1, 0.16, 0.34)), '#5f6676']);
    parts.push([G.box, mm(T(W / 2 - 2.2, H + 1.9, -3.3), S(0.9, 2.4, 0.9)), f.base]);
    parts.push([G.box, mm(T(W / 2 - 2.2, H + 3.15, -3.3), S(1.1, 0.16, 1.1)), '#5f6676']);
    parts.push([G.box, mm(T(-2.2, H + 1.76, 2.0), RX(0.41), S(2.4, 0.12, 1.6)), '#bfe3f2']);
    // upper floor windows with shutters and flower boxes
    for (const x of [-4.2, 4.2]) {
      parts.push([G.box, mm(T(x, 5.7, FRONT + 0.04), S(1.6, 2.1, 0.12)), '#3a2a45']);
      parts.push([G.box, mm(T(x - 1.05, 5.7, FRONT + 0.08), S(0.45, 2.1, 0.1)), trimLight]);
      parts.push([G.box, mm(T(x + 1.05, 5.7, FRONT + 0.08), S(0.45, 2.1, 0.1)), trimLight]);
      parts.push([G.box, mm(T(x, 4.55, FRONT + 0.25), S(1.8, 0.3, 0.45)), trim]);
      for (let k = 0; k < 4; k++) parts.push([G.ico, mm(T(x - 0.6 + k * 0.4, 4.78, FRONT + 0.28), S(0.2)), ['#e0449a', '#ffc23d', '#57b77f', '#fb923c'][(k + Math.floor(r() * 4)) % 4]]);
    }
    // topiaries in pots either side of the door
    for (const x of [-4.6, -1.2]) {
      parts.push([G.pot, mm(T(x, 0.35, FRONT + 0.75), S(1.6, 2, 1.6)), trim]);
      parts.push([G.sphere, mm(T(x, 1.25, FRONT + 0.75), S(0.48)), '#3f9d6b']);
    }
    // planters under the display window
    parts.push([G.box, mm(T(2.35, 0.3, FRONT + 0.55), S(6.2, 0.6, 0.7)), f.base]);
    for (let k = 0; k < 12; k++) parts.push([G.ico, mm(T(-0.5 + k * 0.52, 0.7, FRONT + 0.55 + (k % 2) * 0.12), S(0.26)), ['#57b77f', '#e0449a', '#b77cff', '#ffc23d', '#3f9d6b'][k % 5]]);
    const shellGeo = keep(mergeParts(parts));
    const shell = new THREE.Mesh(shellGeo, kit.vcMat); shell.castShadow = false; shell.receiveShadow = false;
    root.add(shell);

    // walls textured (front only; sides share the shell colour)
    const wallMat = keep(new THREE.MeshStandardMaterial({ map: wallTexture(f), roughness: 0.92 }));
    const wall = new THREE.Mesh(G.plane, wallMat); wall.scale.set(W - 0.02, H - 0.02, 1); wall.position.set(0, H / 2, FRONT + 0.006); root.add(wall);

    // display window and door, lit from inside
    const inside = interiorTexture(tint, seed);
    const interiorMat = keep(new THREE.MeshStandardMaterial({ map: inside, emissive: 0xffffff, emissiveMap: inside, emissiveIntensity: 0.55, roughness: 0.6 }));
    const win = new THREE.Mesh(G.plane, interiorMat); win.scale.set(6.1, 2.25, 1); win.position.set(2.35, 1.8, FRONT + 0.02); near.add(win);
    const glass = new THREE.Mesh(G.plane, glassMat); glass.scale.set(6.1, 2.25, 1); glass.position.set(2.35, 1.8, FRONT + 0.06); near.add(glass);
    const doorMat = keep(new THREE.MeshStandardMaterial({ map: inside, emissive: 0xffffff, emissiveMap: inside, emissiveIntensity: 0.45, roughness: 0.6 }));
    const door = new THREE.Mesh(G.plane, doorMat); door.scale.set(1.6, 2.6, 1); door.position.set(-2.9, 1.3, FRONT + 0.14); near.add(door);

    // awnings over the window and the door
    const aw = awningMat(tint, '#fff4ea');
    const awning = (x, width, y) => {
      const m = new THREE.Mesh(G.box, aw); m.scale.set(width, 0.06, 1.5); m.rotation.x = 0.42; m.position.set(x, y, FRONT + 0.7); near.add(m);
    };
    awning(2.35, 6.6, 3.25); awning(-2.9, 2.4, 3.1);

    // fascia with the shop's name, and the logo sign
    const fascia = new THREE.Mesh(G.plane, keep(new THREE.MeshStandardMaterial({ map: fasciaTexture(shop, tint), emissive: 0xffffff, emissiveMap: null, roughness: 0.6 })));
    fascia.material.emissiveMap = fascia.material.map; fascia.material.emissiveIntensity = 0.12;
    fascia.scale.set(8.6, 1.07, 1); fascia.position.set(0, 4.05, FRONT + 0.12);
    root.add(fascia);
    const signMat = keep(new THREE.MeshStandardMaterial({ map: signTexture(shop, tint, null), emissive: 0xffffff, roughness: 0.5, transparent: true, alphaTest: 0.5 }));
    signMat.emissiveMap = signMat.map; signMat.emissiveIntensity = 0.15;
    const sign = new THREE.Mesh(G.plane, signMat); sign.scale.set(3.3, 1.93, 1); sign.position.set(0, 6.05, FRONT + 0.14); root.add(sign);
    // the upper windows, softly lit behind curtains
    for (const x of [-4.2, 4.2]) { const w = new THREE.Mesh(G.plane, upperMat); w.scale.set(1.3, 1.8, 1); w.position.set(x, 5.7, FRONT + 0.105); root.add(w); }
    if (shop.logo_url) loadImage(shop.logo_url).then((img) => {
      if (!img || root.userData.disposed) return;
      const t = signTexture(shop, tint, img); signMat.map = t; signMat.emissiveMap = t; signMat.needsUpdate = true;
    });

    // wall lamps
    for (const x of [-4.35, -1.45]) { const l = new THREE.Mesh(G.sphere, lampMat); l.scale.set(0.12, 0.16, 0.12); l.position.set(x, 2.6, FRONT + 0.3); near.add(l); }

    // soft contact shadow round the base
    const shadow = new THREE.Mesh(G.plane, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(W + 4, D + 4, 1); shadow.position.y = 0.02; root.add(shadow);

    // tap target
    const hit = new THREE.Mesh(G.box, kit.hitMat); hit.scale.set(W, H, D); hit.position.y = H / 2; root.add(hit);
    hit.userData.storefront = shop;

    return {
      root, hit, near, shop,
      setNear(on) { near.visible = on; },
      setTheme(name) {
        const dusk = name === 'dusk';
        interiorMat.emissiveIntensity = dusk ? 1.15 : 0.55;
        doorMat.emissiveIntensity = dusk ? 0.95 : 0.45;
        fascia.material.emissiveIntensity = dusk ? 0.42 : 0.12;
        signMat.emissiveIntensity = dusk ? 0.5 : 0.15;
        upperMat.emissiveIntensity = dusk ? 0.9 : 0.35;
      },
      dispose() { root.userData.disposed = true; root.removeFromParent(); },
    };
  }

  /** An empty plot: hoarding and a "Your café here" sign. */
  function buildEmptyPlot(index) {
    const root = new THREE.Group(); root.name = `fnb-plot:${index}`;
    const hoard = new THREE.Mesh(G.box, hoardingMat); hoard.scale.set(W - 1, 2.2, 0.15); hoard.position.set(0, 1.1, FRONT - 0.6); root.add(hoard);
    for (const s of [-1, 1]) { const side = new THREE.Mesh(G.box, hoardingMat); side.scale.set(0.15, 2.2, D - 1.5); side.position.set(s * (W - 1) / 2, 1.1, 0); root.add(side); }
    const sign = new THREE.Mesh(G.plane, plotSignMat); sign.scale.set(4.2, 1.64, 1); sign.position.set(0, 3.4, FRONT - 0.5); root.add(sign);
    const post = new THREE.Mesh(G.box, std('#4a3550')); post.scale.set(0.12, 2.3, 0.12); post.position.set(0, 1.15, FRONT - 0.55); root.add(post);
    const hit = new THREE.Mesh(G.box, kit.hitMat); hit.scale.set(W, 4, D); hit.position.y = 2; root.add(hit);
    hit.userData.fnbPlot = index;
    return { root, hit, setNear() {}, dispose() { root.removeFromParent(); } };
  }

  function dispose() { for (const o of own) o.dispose?.(); own.length = 0; facadeTex.clear(); awningMats.clear(); }
  return { buildStorefront, buildEmptyPlot, dispose, size: { W, D, H } };
}
export { W as STOREFRONT_W, D as STOREFRONT_D };
