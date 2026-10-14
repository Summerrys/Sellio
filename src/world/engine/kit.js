import * as THREE from 'three';

// Shared building blocks for the engine: cached materials and geometries,
// canvas textures, glow sprites and geometry merging. Everything created here
// is tracked and released by kit.dispose().
export function createKit(renderer) {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tracked = new Set();
  const track = (o) => { tracked.add(o); return o; };
  const untrack = (o) => { tracked.delete(o); return o; };

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return track(t);
  }

  const mats = new Map();
  function std(color, o = {}) {
    const k = color + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, track(new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o })));
    return mats.get(k);
  }
  function mesh(geo, mat, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true;
    return m;
  }

  const G = {
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    post: track(new THREE.CylinderGeometry(0.055, 0.055, 1, 8)),
    sphere: track(new THREE.SphereGeometry(1, 18, 14)),
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 18)),
    cone4: track(new THREE.ConeGeometry(1, 1, 4)),
    ico: track(new THREE.IcosahedronGeometry(1, 0)),
    cup: track(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 14)),
    plane: track(new THREE.PlaneGeometry(1, 1)),
    pot: track(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 12)),
    canopy: track(new THREE.CylinderGeometry(1.35, 1.35, 3.2, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)),
    rib: track(new THREE.TorusGeometry(1.35, 0.035, 6, 28, Math.PI).rotateY(Math.PI / 2)),
    pyramid: track(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4)),
    roofPrism: track(new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(Math.PI / 2).rotateZ(Math.PI)),
    flag: track(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.12, 0, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(0, -0.26, 0)])),
  };
  G.flag.computeVertexNormals();

  const hitMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  const vcMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const vcFlatMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));

  const glowTex = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  function glowSprite(color, scale, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(scale, scale, 1); s.renderOrder = 3; s.userData.noShadow = true; s.userData.dispose = 'mat';
    return s;
  }
  function glowPoints(positions, color, size, opacity = 0.9) {
    const geo = new THREE.BufferGeometry().setFromPoints(positions);
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    p.renderOrder = 3; p.userData.dispose = true;
    return p;
  }
  function line(points, color = '#2b1d33') {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color }));
    l.userData.dispose = true;
    return l;
  }

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RX = (a) => new THREE.Matrix4().makeRotationX(a);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const S = (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z);
  const mm = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

  // Merges [geometry, matrix, colour?] parts into one geometry, so a stall's
  // fixed parts draw in a single call. Colours go to a vertex colour attribute;
  // withUV keeps texture coordinates instead.
  function mergeParts(parts, withUV = false) {
    const ready = parts.map(([g, m, c]) => {
      const ng = g.index ? g.toNonIndexed() : g.clone();
      ng.applyMatrix4(m);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      return [ng, c ? new THREE.Color(c) : null];
    });
    const total = ready.reduce((n, [g]) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const col = withUV ? null : new Float32Array(total * 3), uv = withUV ? new Float32Array(total * 2) : null;
    let o = 0;
    for (const [g, c] of ready) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (withUV) uv.set(g.attributes.uv.array, o * 2);
      else for (let i = 0; i < n; i++) { const k = (o + i) * 3; col[k] = c ? c.r : 1; col[k + 1] = c ? c.g : 1; col[k + 2] = c ? c.b : 1; }
      o += n; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (withUV) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    else out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // Removes a group's children and frees what they created for themselves.
  function clearGroup(group) {
    while (group.children.length) {
      const c = group.children.pop();
      c.traverse((o) => {
        if (o.userData.dispose) {
          if (o.userData.dispose !== 'mat') o.geometry?.dispose();
          if (o.material && !Array.isArray(o.material)) o.material.dispose();
        }
      });
    }
  }

  function dispose() {
    for (const o of tracked) o.dispose?.();
    tracked.clear(); mats.clear();
  }

  return { THREE, canvasTex, std, mesh, G, hitMat, vcMat, vcFlatMat, glowTex, glowSprite, glowPoints, line,
    T, RX, RY, RZ, S, mm, mergeParts, clearGroup, track, untrack, maxAniso, dispose };
}

// Rounded rectangle path and text fitting, used by the canvas textures.
export function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
export function fitFont(c, text, weight, family, max, maxW) {
  let s = max;
  for (;;) {
    c.font = `${weight} ${s}px ${family}`;
    if (c.measureText(text).width <= maxW || s <= 14) break;
    s -= 2;
  }
  return s;
}
export function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
