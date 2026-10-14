import * as THREE from 'three';

const TAU = Math.PI * 2;
const COLOURS = ['#ffc23d', '#fb923c', '#e0449a', '#b77cff', '#ffffff'];

// Confetti bursts and the tap marker. Sparks come from a fixed pool of
// sprites, so a burst never allocates during play.
export function createFx(kit, scene, { motion = 1 } = {}) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const POOL = 48;
  const sparks = [];
  for (let i = 0; i < POOL; i++) {
    const s = kit.glowSprite(COLOURS[i % COLOURS.length], 0.6, 0);
    s.visible = false; root.add(s);
    sparks.push({ s, v: new THREE.Vector3(), life: 0 });
  }
  let next = 0;
  function burst(pos, n = 22) {
    if (!motion) n = Math.min(n, 8);
    for (let i = 0; i < n; i++) {
      const p = sparks[next]; next = (next + 1) % POOL;
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2.5;
      p.s.position.copy(pos); p.s.visible = true; p.s.scale.setScalar(0.5 + Math.random() * 0.35);
      p.v.set(Math.cos(a) * sp, 2.5 + Math.random() * 3, Math.sin(a) * sp).multiplyScalar(motion ? 1 : 0.4);
      p.life = 1;
    }
  }

  const markerMat = kit.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const marker = new THREE.Mesh(kit.track(new THREE.RingGeometry(0.26, 0.38, 32)), markerMat);
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.04; root.add(marker);
  let markerLife = 0;
  function mark(x, z) { marker.position.set(x, 0.04, z); markerLife = 1; }

  function update(dt) {
    if (markerLife > 0) { markerLife = Math.max(0, markerLife - dt * 1.6); markerMat.opacity = markerLife * 0.9; marker.scale.setScalar(1 + (1 - markerLife) * 0.8); }
    for (const p of sparks) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.1; p.v.y -= dt * 6;
      p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  function dispose() {
    for (const p of sparks) p.s.material.dispose();
    scene.remove(root);
  }
  return { burst, mark, update, dispose };
}
