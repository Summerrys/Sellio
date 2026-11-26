import * as THREE from 'three';

// The player's hero. Mochi, the bouncy rice cake, is the original; the others
// are people, each assembled from the parts the wardrobe will later let
// players swap: skin, top [style, colour, trim], bottom [style, colour] and
// accessories. No hero has hair or a hat yet: those arrive with the wardrobe
// (Alvin, 17 Nov 2026). Every hero stands on y = 0, faces +z and has an
// animate(dt, t, moving, phase, motion) function.

export const CHARACTERS = [
  { id: 'mochi', name: 'Mochi', role: 'The original', line: 'A bouncy rice cake with a leaf on top.', kind: 'mochi', skin: '#fff8f2' },
  { id: 'kai', name: 'Kai', role: 'Explorer', line: 'Backpack packed, first down every street.',
    skin: '#f1c6a4', top: ['hoodie', '#e0449a'], bottom: ['pants', '#2f2a5a'], acc: ['backpack'], accColor: '#8b2fc9' },
  { id: 'mei', name: 'Mei', role: 'Baker', line: 'Flour on her apron and a tray always cooling somewhere.',
    skin: '#f6d7bd', top: ['apron', '#2fbf95', '#fff4ea'], bottom: ['pants', '#3b2a45'], acc: [], accColor: '#fb923c' },
  { id: 'arjun', name: 'Arjun', role: 'Courier', line: 'Knows every shortcut and never drops a parcel.',
    skin: '#8d5a3c', top: ['jacket', '#fb923c', '#fff4ea'], bottom: ['shorts', '#2f2a5a'], acc: ['courier'], accColor: '#1f9e78' },
  { id: 'nadia', name: 'Nadia', role: 'Stylist', line: 'Can spot a good find from three stalls away.',
    skin: '#c68a5e', top: ['tee', '#8b2fc9'], bottom: ['skirt', '#ffc23d'], acc: ['tote'], accColor: '#fff4ea' },
  { id: 'leo', name: 'Leo', role: 'Collector', line: 'Here for the rare things, and for the coins.',
    skin: '#e0a67e', top: ['jacket', '#2f4a80', '#f3c14b'], bottom: ['pants', '#6b4a3a'], acc: ['glasses'], accColor: '#1d1426' },
  { id: 'suri', name: 'Suri', role: 'Night-market DJ', line: 'Brings the playlist. The street brings the lights.',
    skin: '#e9b78f', top: ['hoodie', '#4b3a8c'], bottom: ['shorts', '#e0449a'], acc: ['headphones'], accColor: '#ffc23d' },
];
export const DEFAULT_CHARACTER = 'mochi';
export const characterOf = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// What the wardrobe will add, shown as "coming soon" in the hero picker.
export const WARDROBE_SOON = ['Hairstyles', 'Outfits', 'Accessories'];

// The chosen hero is remembered on this device.
const HERO_KEY = 'sellio-world-hero';
export function loadHero() {
  try { const id = localStorage.getItem(HERO_KEY); return CHARACTERS.some((c) => c.id === id) ? id : null; } catch { return null; }
}
export function saveHero(id) {
  try { localStorage.setItem(HERO_KEY, id); } catch { /* storage unavailable: the choice lasts for this visit */ }
}

export function buildCharacter(kit, id = DEFAULT_CHARACTER) {
  const c = characterOf(id);
  return c.kind === 'mochi' ? buildMochi(kit) : buildPerson(kit, c);
}

function buildMochi(kit) {
  const { std, mesh, G } = kit;
  const own = [];
  const keep = (g) => { own.push(g); return g; };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const add = (parent, geo, mat, [x, y, z] = [0, 0, 0], s = 1, cast = true) => {
    const m = mesh(geo, mat, cast);
    m.position.set(x, y, z);
    if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]); else m.scale.setScalar(s);
    parent.add(m); return m;
  };
  const eyeMat = std('#20142b', { roughness: 0.3 });
  const shine = std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 });
  const dough = std('#fff8f2', { roughness: 0.55 }), blush = std('#ff9ec4', { roughness: 0.6 }), leaf = std('#4caf6e', { flatShading: true }), foot = std('#f3d9cf');

  const squash = new THREE.Group(); body.add(squash);
  add(squash, G.sphere, dough, [0, 0.52, 0], [0.56, 0.5, 0.52]);
  for (const s of [-1, 1]) {
    add(squash, G.sphere, eyeMat, [s * 0.16, 0.62, 0.45], [0.055, 0.055 * 1.25, 0.055 * 0.6], false);
    add(squash, G.sphere, shine, [s * 0.16 + 0.015, 0.642, 0.475], 0.055 * 0.32, false);
    add(squash, G.sphere, blush, [s * 0.29, 0.5, 0.38], [0.09, 0.05, 0.03], false);
  }
  const mouth = add(squash, keep(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI)), eyeMat, [0, 0.52, 0.5], 1, false);
  mouth.rotation.z = Math.PI;
  const sprout = new THREE.Group(); sprout.position.set(0, 1.0, 0); squash.add(sprout);
  add(sprout, G.cyl, leaf, [0, 0.05, 0], [0.02, 0.12, 0.02], false);
  for (const s of [-1, 1]) { const l = add(sprout, G.sphere, leaf, [s * 0.1, 0.13, 0], [0.11, 0.035, 0.06], false); l.rotation.z = s * 0.4; }
  const feet = [-0.18, 0.18].map((x) => add(body, G.sphere, foot, [x, 0.06, 0.08], [0.12, 0.07, 0.15]));

  function animate(dt, t, moving, ph, m = 1) {
    const hop = moving ? Math.abs(Math.sin(ph * 0.75)) : 0;
    squash.position.y = hop * 0.28;
    const st = moving ? 1 + (hop - 0.5) * 0.16 : 1 + Math.sin(t * 2.4) * 0.025 * m;
    squash.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    sprout.rotation.z = Math.sin(t * (moving ? 10 : 2)) * (moving ? 0.3 : 0.12) * m;
    feet.forEach((f, i) => { f.position.y = 0.06 + squash.position.y * 0.8 + (moving ? Math.max(0, Math.sin(ph * 0.75 + i * Math.PI)) * 0.04 : 0); });
  }

  return {
    group: root,
    scale: 1.5, // a touch larger than life, so Mochi reads at map scale
    animate,
    dispose() { for (const g of own) g.dispose(); },
  };
}

function buildPerson(kit, h) {
  const { std, mesh, G } = kit;
  const own = [];
  const keep = (g) => { own.push(g); return g; };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = std(h.skin, { roughness: 0.7 }), dark = std('#1d1426', { roughness: 0.3 });
  const [topStyle, topCol, trimCol] = h.top, [botStyle, botCol] = h.bottom;
  const topM = std(topCol), botM = std(botCol), accM = std(h.accColor || '#8b2fc9');
  const part = (geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, parent = body, cast = true) => {
    const m = mesh(geo, mat, cast); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  };
  const open = (geo, color) => { const m = new THREE.Mesh(keep(geo), std(color, { side: THREE.DoubleSide })); body.add(m); return m; };

  /* body */
  part(keep(new THREE.CapsuleGeometry(0.3, 0.36, 6, 14)), topM, 0, 1.0, 0);
  if (topStyle === 'apron') {
    open(new THREE.CylinderGeometry(0.312, 0.325, 0.6, 18, 1, true, -0.8, 1.6), trimCol).position.y = 0.9;
    open(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12, 1, true, -0.32, 0.64), '#f3c14b').position.y = 0.82;
    part(keep(new THREE.TorusGeometry(0.2, 0.028, 6, 20)), std(trimCol), 0, 1.3, 0).rotation.x = Math.PI / 2;
  } else if (topStyle === 'jacket') {
    open(new THREE.CylinderGeometry(0.312, 0.312, 0.64, 8, 1, true, -0.13, 0.26), trimCol).position.y = 1.0;
    part(keep(new THREE.TorusGeometry(0.2, 0.05, 8, 20)), std(trimCol), 0, 1.31, 0).rotation.x = Math.PI / 2;
  } else if (topStyle === 'hoodie') {
    part(G.sphere, topM, 0, 1.33, -0.17, 0.2, 0.15, 0.17, body, false);
    open(new THREE.CylinderGeometry(0.315, 0.315, 0.17, 10, 1, true, -0.42, 0.84), topCol).position.y = 0.84;
  }
  /* head (no hair and no hat: those are wardrobe items, added later) */
  part(G.sphere, skin, 0, 1.6, 0, 0.3);
  for (const x of [-0.1, 0.1]) part(G.sphere, dark, x, 1.6, 0.275, 0.04, 0.04, 0.04, body, false);
  const smile = part(keep(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI)), dark, 0, 1.52, 0.268, 1, 1, 1, body, false);
  smile.rotation.z = Math.PI; smile.rotation.x = -0.2;
  /* legs */
  const bare = botStyle !== 'pants';
  if (botStyle === 'skirt') part(keep(new THREE.CylinderGeometry(0.25, 0.42, 0.36, 18)), botM, 0, 0.6, 0);
  const legGeo = keep(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10));
  const shortsGeo = botStyle === 'shorts' ? keep(new THREE.CylinderGeometry(0.12, 0.125, 0.3, 12)) : null;
  const shoe = std('#fdfaff');
  const legs = [-0.13, 0.13].map((x) => {
    const piv = new THREE.Group(); piv.position.set(x, 0.62, 0); body.add(piv);
    part(legGeo, bare ? skin : botM, 0, -0.28, 0, 1, 1, 1, piv);
    if (shortsGeo) part(shortsGeo, botM, 0, -0.1, 0, 1, 1, 1, piv);
    part(G.box, shoe, 0, -0.56, 0.04, 0.18, 0.1, 0.26, piv);
    return piv;
  });
  /* arms */
  const armGeo = keep(new THREE.CapsuleGeometry(0.08, 0.3, 4, 10));
  const sleeveGeo = topStyle === 'tee' ? keep(new THREE.CapsuleGeometry(0.098, 0.08, 4, 10)) : null;
  const arms = [-0.37, 0.37].map((x) => {
    const piv = new THREE.Group(); piv.position.set(x, 1.24, 0); body.add(piv);
    part(armGeo, topStyle === 'tee' ? skin : topM, 0, -0.2, 0, 1, 1, 1, piv);
    if (sleeveGeo) part(sleeveGeo, topM, 0, -0.07, 0, 1, 1, 1, piv);
    part(G.sphere, skin, 0, -0.42, 0, 0.08, 0.08, 0.08, piv);
    return piv;
  });
  /* accessories */
  for (const a of h.acc || []) {
    if (a === 'backpack') part(G.box, accM, 0, 1.05, -0.3, 0.4, 0.42, 0.18);
    else if (a === 'courier') { part(G.box, accM, 0, 1.0, -0.36, 0.5, 0.44, 0.26); part(G.box, std('#fff4ea'), 0, 1.0, -0.495, 0.2, 0.2, 0.01, body, false); }
    else if (a === 'tote') { part(G.box, accM, 0.43, 0.74, 0.02, 0.07, 0.3, 0.3); part(G.box, std('#e0449a'), 0.468, 0.76, 0.02, 0.01, 0.1, 0.1, body, false); }
    else if (a === 'glasses') {
      const rim = keep(new THREE.TorusGeometry(0.068, 0.014, 6, 18));
      for (const x of [-0.1, 0.1]) part(rim, accM, x, 1.6, 0.285, 1, 1, 1, body, false);
      part(G.box, accM, 0, 1.6, 0.295, 0.07, 0.014, 0.014, body, false);
    } else if (a === 'headphones') {
      part(keep(new THREE.TorusGeometry(0.33, 0.03, 8, 22, Math.PI)), accM, 0, 1.62, 0);
      for (const x of [-0.325, 0.325]) part(G.cyl, accM, x, 1.59, 0, 0.1, 0.07, 0.1).rotation.z = Math.PI / 2;
    }
  }

  function animate(dt, t, moving, ph, m = 1) {
    const sw = moving ? Math.sin(ph) * 0.75 : 0;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.x = -sw * 0.85; arms[1].rotation.x = sw * 0.85;
    arms[0].rotation.z = -0.08; arms[1].rotation.z = 0.08;
    body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.07 : Math.sin(t * 2.2) * 0.012 * m;
    body.rotation.x = moving ? 0.06 : 0;
  }

  return {
    group: root,
    scale: 1.2, // 1.9 units tall as built; a touch larger than life at map scale
    animate,
    dispose() { for (const g of own) g.dispose(); },
  };
}
