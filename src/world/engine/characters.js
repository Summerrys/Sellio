import * as THREE from 'three';

// The player character: Mochi, a bouncy rice cake with a leaf sprout. Built
// from simple rounded shapes, standing on y = 0 and facing +z, with an
// animate(dt, t, moving, phase, motion) function for its hop and idle wobble.

export const CHARACTERS = [
  { id: 'mochi', name: 'Mochi', blurb: 'A bouncy rice cake with a leaf on top' },
];
export const DEFAULT_CHARACTER = 'mochi';

export function buildCharacter(kit) {
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
    animate,
    dispose() { for (const g of own) g.dispose(); },
  };
}
