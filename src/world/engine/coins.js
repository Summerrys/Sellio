import * as THREE from 'three';
import { PICKUP_RADIUS, FONT_DISPLAY } from './constants';

const TAU = Math.PI * 2;

// The coins on the street. Positions and values come from the server; the
// field only draws them, notices when the player reaches one and plays the
// pickup. A pickup the server refuses puts the coin back.
export function createCoinField(kit, scene, { coarse = false, motion = 1 } = {}) {
  const { canvasTex, glowSprite, G, hitMat } = kit;
  const root = new THREE.Group(); root.name = 'coins'; scene.add(root);
  const side = kit.track(new THREE.MeshStandardMaterial({ color: 0xf5b91f, metalness: 0.55, roughness: 0.32, emissive: 0x5a3500, emissiveIntensity: 0.4 }));
  const nightSide = kit.track(new THREE.MeshStandardMaterial({ color: 0xc79bff, metalness: 0.55, roughness: 0.3, emissive: 0x3a1066, emissiveIntensity: 0.5 }));
  const geos = [], faces = [], nightFaces = [];
  for (let v = 1; v <= 5; v++) {
    geos[v] = kit.track(new THREE.CylinderGeometry(0.24 + v * 0.035, 0.24 + v * 0.035, 0.09, 28));
    const face = (night) => canvasTex(128, 128, (c) => {
      let g;
      if (v === 5 || night) { g = c.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, night ? '#c79bff' : '#fb923c'); g.addColorStop(0.55, '#e0449a'); g.addColorStop(1, '#8b2fc9'); }
      else { g = c.createRadialGradient(48, 44, 4, 64, 64, 64); g.addColorStop(0, '#fff1a8'); g.addColorStop(0.45, '#ffc23d'); g.addColorStop(1, '#e09a12'); }
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      c.strokeStyle = v === 5 || night ? 'rgba(255,255,255,.6)' : 'rgba(120,70,0,.45)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 50, 0, TAU); c.stroke();
      c.fillStyle = v === 5 || night ? '#ffffff' : '#8a5200'; c.font = `700 64px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(v), 64, 68);
    });
    const mat = (tex) => kit.track(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }));
    faces[v] = mat(face(false)); nightFaces[v] = mat(face(true));
  }

  const coins = new Map();
  const pickables = [];

  function spawn(d, delay) {
    const v = Math.min(5, Math.max(1, Math.round(d.value)));
    const grp = new THREE.Group(); grp.position.set(d.x, 0, d.z); root.add(grp);
    const spin = new THREE.Group(); grp.add(spin);
    const face = d.night ? nightFaces[v] : faces[v];
    const m = new THREE.Mesh(geos[v], [d.night ? nightSide : side, face, face]); m.rotation.x = Math.PI / 2; m.castShadow = !coarse; spin.add(m);
    const glow = glowSprite(d.night ? '#c79bff' : v === 5 ? '#ff7ac8' : '#ffd36b', 1.1 + v * 0.12, 0.5); grp.add(glow);
    const hit = new THREE.Mesh(G.sphere, hitMat); hit.scale.setScalar(0.75); hit.position.y = 0.8; grp.add(hit);
    const c = { id: d.id, value: v, night: !!d.night, x: d.x, z: d.z, grp, spin, glow, hit, phase: Math.random() * TAU,
      state: 'idle', t: 0, hop: 0, drop: delay >= 0 && motion ? -delay : 1, cooldown: false, from: new THREE.Vector3() };
    hit.userData.coin = c; pickables.push(hit); coins.set(d.id, c);
    if (c.drop < 1) { spin.position.y = 6; glow.material.opacity = 0; grp.visible = false; }
    return c;
  }

  function destroy(c) {
    root.remove(c.grp); c.glow.material.dispose();
    const i = pickables.indexOf(c.hit); if (i >= 0) pickables.splice(i, 1);
    coins.delete(c.id);
  }

  // Shows exactly these drops. New ones fall in (staggered when `animate`).
  function set(drops, { animate = false } = {}) {
    const keepIds = new Set(drops.map((d) => d.id));
    for (const c of [...coins.values()]) if (!keepIds.has(c.id) && c.state !== 'collecting') destroy(c);
    let k = 0;
    for (const d of drops) if (!coins.has(d.id)) spawn(d, animate ? (k++) * 0.07 : -1);
  }

  function collect(id, playerPos) {
    const c = coins.get(id); if (!c || c.state !== 'idle') return null;
    c.state = 'collecting'; c.t = 0; c.from.set(c.x, c.spin.position.y, c.z);
    c.target = playerPos;
    return c;
  }
  function restore(id) {
    const c = coins.get(id); if (!c) return;
    c.state = 'idle'; c.cooldown = true; c.grp.visible = true;
    c.grp.position.set(c.x, 0, c.z); c.spin.scale.setScalar(1); c.glow.material.opacity = 0.5;
  }
  function remove(id) { const c = coins.get(id); if (c) destroy(c); }
  // A coin the player cannot pick up yet (signed out) hops instead.
  function hop(id) { const c = coins.get(id); if (c && c.state === 'idle') { c.hop = 1; c.cooldown = true; } }

  const reached = [];
  function update(dt, t, playerPos) {
    reached.length = 0;
    for (const c of coins.values()) {
      if (c.state === 'collecting') {
        // Fly into the player, then pop up and vanish.
        c.t += dt;
        const k = Math.min(1, c.t / 0.22);
        c.grp.position.x = c.from.x + (c.target.x - c.from.x) * k;
        c.grp.position.z = c.from.z + (c.target.z - c.from.z) * k;
        c.spin.position.y = c.from.y + (1.2 - c.from.y) * k + (c.t > 0.22 ? (c.t - 0.22) * 6 : 0);
        c.spin.rotation.y += dt * 22;
        const fade = Math.max(0, (c.t - 0.22) / 0.2);
        c.spin.scale.setScalar(Math.max(0.01, 1 + k * 0.25 - fade * 1.25));
        c.glow.material.opacity = Math.max(0, 0.6 - fade * 0.6);
        if (c.t > 0.45) { c.state = 'done'; c.grp.visible = false; }
        continue;
      }
      if (c.state === 'done') continue;
      if (c.drop < 1) {
        c.drop += dt * 1.8;
        c.grp.visible = c.drop >= 0;
        const k = Math.max(0, Math.min(1, c.drop));
        const bounce = k < 1 ? Math.abs(Math.cos(k * Math.PI * 1.5)) * (1 - k) : 0;
        c.spin.position.y = 0.78 + (1 - k) * 5.2 * (1 - k) + bounce * 0.6;
        c.glow.material.opacity = 0.5 * k; c.glow.position.y = c.spin.position.y;
        c.spin.rotation.y += dt * 6;
        continue;
      }
      c.spin.rotation.y += dt * 2.4 * (motion || 0.3);
      let y = 0.78 + Math.sin(t * 2 + c.phase) * 0.12 * motion;
      if (c.hop > 0) { c.hop = Math.max(0, c.hop - dt * 2.2); y += Math.sin(c.hop * Math.PI) * 0.7 * (motion || 0.4); }
      c.spin.position.y = y; c.glow.position.y = y;
      const d = Math.hypot(playerPos.x - c.x, playerPos.z - c.z);
      if (c.cooldown) { if (d > PICKUP_RADIUS + 0.6) c.cooldown = false; continue; }
      if (d < PICKUP_RADIUS) reached.push(c);
    }
    return reached;
  }

  function nearest(p) {
    let best = null;
    for (const c of coins.values()) {
      if (c.state !== 'idle') continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (!best || d < best.dist) best = { x: c.x, z: c.z, dist: d, id: c.id };
    }
    return best;
  }

  function clear() { for (const c of [...coins.values()]) destroy(c); }
  function dispose() { clear(); scene.remove(root); }
  const count = () => [...coins.values()].filter((c) => c.state === 'idle').length;

  return { set, collect, restore, remove, hop, update, nearest, clear, dispose, pickables, coins, count };
}
