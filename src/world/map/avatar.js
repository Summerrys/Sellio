import * as THREE from 'three';
import { buildCharacter } from '../engine/characters';

const TAU = Math.PI * 2;
export const lerpAngle = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };

export const WALK_SPEED = 4.6;   // m/s on Pop-up Street (the coin rules allow up to 7)
const RUN_SPEED = 8.5;           // m/s for long walks elsewhere on the island
const RUN_AFTER = 26;            // metres left before Mochi breaks into a run

/**
 * Mochi on the map: follows paths from the walk grid or the arrow keys, with
 * a soft shadow, a ring at its feet, a pointer to the nearest coin, a pin
 * that keeps Mochi findable when the map is zoomed out, and the Sellio Hop.
 * Positions are map metres (x east, y north).
 */
export function createAvatar(kit, scene, { motion = 1, nav, isStreet }) {
  const { G } = kit;
  const own = [];
  const keep = (o) => { own.push(o); return o; };
  const tex = (...a) => keep(kit.untrack(kit.canvasTex(...a)));
  const root = new THREE.Group(); root.name = 'mochi'; scene.add(root);
  const char = buildCharacter(kit, 'mochi');
  const body = new THREE.Group(); body.add(char.group); root.add(body);
  char.group.scale.setScalar(1.5); // a touch larger than life, so Mochi reads at map scale

  const shadowTex = tex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(40,20,50,.42)'); g.addColorStop(1, 'rgba(40,20,50,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const shadow = new THREE.Mesh(G.plane, keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; shadow.scale.set(1.9, 1.9, 1); shadow.renderOrder = 2; root.add(shadow);
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.8, 0.94, 40)), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.renderOrder = 2; root.add(ring);

  // pointer to the nearest coin
  const arrowShape = new THREE.Shape(); arrowShape.moveTo(0, 0.34); arrowShape.lineTo(0.2, 0); arrowShape.lineTo(0.08, 0.04); arrowShape.lineTo(0, -0.02); arrowShape.lineTo(-0.08, 0.04); arrowShape.lineTo(-0.2, 0); arrowShape.closePath();
  const arrowMat = keep(new THREE.MeshBasicMaterial({ color: 0xffc23d, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const arrowGeo = keep(new THREE.ShapeGeometry(arrowShape)); arrowGeo.rotateX(Math.PI / 2);
  const arrow = new THREE.Mesh(arrowGeo, arrowMat); arrow.position.y = 0.05; arrow.renderOrder = 2; root.add(arrow);

  // the pin above Mochi when the camera is far away (kept a steady size on screen)
  const pinTex = tex(128, 160, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#fb923c'); g.addColorStop(0.55, '#e0449a'); g.addColorStop(1, '#8b2fc9');
    c.fillStyle = g; c.beginPath(); c.arc(64, 60, 56, Math.PI * 0.82, Math.PI * 2.18); c.lineTo(64, 156); c.closePath(); c.fill();
    c.fillStyle = '#fff8f2'; c.beginPath(); c.ellipse(64, 64, 38, 33, 0, 0, TAU); c.fill();
    c.fillStyle = '#20142b'; for (const x of [50, 78]) { c.beginPath(); c.ellipse(x, 62, 5, 6.5, 0, 0, TAU); c.fill(); }
    c.fillStyle = '#ff9ec4'; for (const x of [40, 88]) { c.beginPath(); c.ellipse(x, 72, 6, 3.5, 0, 0, TAU); c.fill(); }
    c.strokeStyle = '#20142b'; c.lineWidth = 3; c.beginPath(); c.arc(64, 70, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#4caf6e'; c.beginPath(); c.ellipse(56, 30, 10, 4, -0.5, 0, TAU); c.fill(); c.beginPath(); c.ellipse(72, 30, 10, 4, 0.5, 0, TAU); c.fill();
  });
  const pinMat = keep(new THREE.SpriteMaterial({ map: pinTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  const pin = new THREE.Sprite(pinMat); pin.center.set(0.5, 0); pin.renderOrder = 20; root.add(pin);

  const state = {
    x: 0, y: 0, heading: Math.PI, path: [], goal: null, keys: { x: 0, y: 0 }, moving: false, phase: 0, hop: null, hidden: false, speed: 0,
  };
  const position = { x: 0, y: 0 };

  function place(x, y, heading = state.heading) {
    const p = nav.walkable(x, y) ? [x, y] : nav.nearestWalkable(x, y) || [x, y];
    state.x = p[0]; state.y = p[1]; state.heading = heading; state.path = []; state.goal = null;
    sync();
  }
  function sync() { position.x = state.x; position.y = state.y; root.position.set(state.x, 0, -state.y); body.rotation.y = state.heading; }

  /** Walks to a point; returns the end point (snapped to walkable ground) or null. */
  function walkTo(x, y) {
    const path = nav.findPath(state.x, state.y, x, y);
    if (!path || !path.length) return null;
    state.path = path; state.goal = path[path.length - 1];
    return state.goal;
  }
  function stop() { state.path = []; state.goal = null; }
  const remaining = () => {
    let d = 0, px = state.x, py = state.y;
    for (const [x, y] of state.path) { d += Math.hypot(x - px, y - py); px = x; py = y; }
    return d;
  };

  /* the Sellio Hop: shrink into the pad, then pop out somewhere else */
  function hop(to, onMid, pause = 0.35) {
    state.hop = { t: 0, to, onMid, fired: false, pause };
    stop();
  }

  // Moves Mochi. Returns 'arrived' on the frame a walk ends.
  function update(dt, t, { camera, nearestCoin, cameraBearing = 0 } = {}) {
    let event = null;
    if (state.hop) {
      const h = state.hop; h.t += dt;
      const k = h.t / 0.45;
      if (k < 1) { body.scale.setScalar(Math.max(0.01, 1 - k)); body.rotation.y += dt * 18; body.position.y = Math.sin(k * Math.PI) * 0.6; }
      else if (!h.fired) { h.fired = true; place(h.to.x, h.to.y, h.to.heading ?? state.heading); h.onMid?.(); }
      else {
        const k2 = Math.min(1, (h.t - 0.45 - h.pause) / 0.4);
        const s = k2 <= 0 ? 0.01 : 1 + Math.sin(k2 * Math.PI) * 0.25 * (1 - k2);
        body.scale.setScalar(Math.max(0.01, k2 <= 0 ? 0.01 : s * Math.min(1, k2 * 1.6)));
        body.position.y = k2 > 0 ? Math.sin(k2 * Math.PI) * 0.8 : 0;
        if (k2 >= 1) { state.hop = null; body.scale.setScalar(1); body.position.y = 0; event = 'hopped'; }
      }
    }
    let vx = 0, vy = 0;
    const onStreet = isStreet(state.x, state.y);
    if (!state.hop && (state.keys.x || state.keys.y)) {
      // keys move relative to the camera: up is "away from the camera"
      const b = cameraBearing * Math.PI / 180;
      const fx = Math.sin(b), fy = Math.cos(b), rx = Math.cos(b), ry = -Math.sin(b);
      vx = fx * state.keys.y + rx * state.keys.x; vy = fy * state.keys.y + ry * state.keys.x;
      const l = Math.hypot(vx, vy) || 1, sp = WALK_SPEED * 1.15;
      vx = vx / l * sp; vy = vy / l * sp;
      state.path = []; state.goal = null;
    } else if (!state.hop && state.path.length) {
      const [tx, ty] = state.path[0];
      const dx = tx - state.x, dy = ty - state.y, d = Math.hypot(dx, dy);
      const run = !onStreet && remaining() > RUN_AFTER;
      const target = run ? RUN_SPEED : WALK_SPEED;
      state.speed += (target - state.speed) * Math.min(1, dt * 4);
      if (d < 0.05) { state.path.shift(); if (!state.path.length) { state.goal = null; event = 'arrived'; } }
      else { const sp = Math.min(state.speed, d / Math.max(dt, 1e-4)); vx = dx / d * sp; vy = dy / d * sp; }
    }
    state.moving = Math.hypot(vx, vy) > 0.1;
    if (state.moving) {
      let nx = state.x + vx * dt, ny = state.y + vy * dt;
      if (state.keys.x || state.keys.y) {
        // slide along walls rather than stopping dead
        if (!nav.walkable(nx, ny)) { if (nav.walkable(nx, state.y)) ny = state.y; else if (nav.walkable(state.x, ny)) nx = state.x; else { nx = state.x; ny = state.y; } }
      }
      state.x = nx; state.y = ny;
      state.heading = lerpAngle(state.heading, Math.atan2(vx, -vy), 1 - Math.exp(-dt * 12));
      state.phase += dt * (Math.hypot(vx, vy) > WALK_SPEED * 1.3 ? 15 : 10.5);
    } else state.speed = Math.min(state.speed, WALK_SPEED);
    sync();
    char.animate(dt, t, state.moving, state.phase, motion);
    ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08 * motion);
    ringMat.opacity = state.hop ? 0 : 0.85;
    shadow.scale.setScalar(1.9 * (state.hop ? body.scale.x : 1));

    // the coin pointer
    let arrowTarget = 0;
    if (nearestCoin && nearestCoin.dist > 6 && onStreet) {
      arrowTarget = 0.9;
      const a = Math.atan2(nearestCoin.x - state.x, -(nearestCoin.y - state.y));
      arrow.rotation.y = a; arrow.position.set(Math.sin(a) * 1.15, 0.05, Math.cos(a) * 1.15);
      arrow.scale.setScalar(1 + Math.sin(t * 4) * 0.08 * motion);
    }
    arrowMat.opacity += (arrowTarget - arrowMat.opacity) * Math.min(1, dt * 4);
    arrow.visible = arrowMat.opacity > 0.02;

    // the pin: fades in as the camera pulls away
    if (camera) {
      const d = camera.position.distanceTo(root.position);
      const goal = state.hidden ? 0 : Math.max(0, Math.min(1, (d - 70) / 60));
      pinMat.opacity += (goal - pinMat.opacity) * Math.min(1, dt * 6);
      pin.visible = pinMat.opacity > 0.02;
      const s = d * 0.05;
      pin.scale.set(s * 0.8, s, 1); pin.position.y = 1.4 + s * 0.12 + Math.sin(t * 2.4) * s * 0.04 * motion;
    }
    return event;
  }

  function dispose() { root.removeFromParent(); char.dispose(); for (const o of own) o.dispose?.(); }
  return {
    root, position, state, place, walkTo, stop, hop, update, dispose, remaining,
    get moving() { return state.moving; },
    get busy() { return !!state.hop; },
    setKeys(x, y) { state.keys.x = x; state.keys.y = y; },
    setHidden(on) { state.hidden = !!on; root.visible = !on; },
  };
}
