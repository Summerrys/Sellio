import * as THREE from 'three';

// Soft glowing points (lamp halos, fairy lights) sized in metres. Three's own
// PointsMaterial sizes points from the renderer's stored canvas height, which
// a shared map canvas does not keep up to date, so this one takes the
// drawing-buffer height as a uniform instead (see setViewportHeight).
const VERT = `
attribute vec3 aColor;
uniform float uSize;
uniform float uHalfH;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float f = projectionMatrix[1][1] / max(1e-6, -projectionMatrix[2][3]);
  gl_PointSize = clamp(uSize * f * uHalfH / max(0.1, -mv.z), 1.0, 256.0);
}`;
const FRAG = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * uOpacity);
}`;

const all = new Set();

export function createGlowPoints(kit, points, { size = 1, opacity = 0.8, colors = null, color = '#ffd27a' } = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const base = new THREE.Color(color);
  const col = new Float32Array(points.length * 3);
  points.forEach((_, i) => { const c = colors ? new THREE.Color(colors[i % colors.length]) : base; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; });
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: kit.glowTex }, uSize: { value: size }, uHalfH: { value: 400 }, uOpacity: { value: opacity } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.renderOrder = 4; p.frustumCulled = false;
  all.add(mat);
  mat.addEventListener('dispose', () => all.delete(mat));
  // `material.opacity` drives the shader, as it would on a PointsMaterial
  Object.defineProperty(mat, 'opacity', { configurable: true, get: () => mat.uniforms.uOpacity.value, set: (v) => { mat.uniforms.uOpacity.value = v; } });
  return {
    object: p,
    set opacity(v) { mat.uniforms.uOpacity.value = v; },
    get opacity() { return mat.uniforms.uOpacity.value; },
    dispose() { geo.dispose(); mat.dispose(); p.removeFromParent(); },
  };
}

// A drop-in for kit.glowPoints (used by the stalls), sized for the map.
export function glowPointsForMap(kit) {
  return (positions, color, size, opacity = 0.9) => {
    const g = createGlowPoints(kit, positions, { size: size * 0.5, opacity, color: '#' + new THREE.Color(color).getHexString() });
    g.object.userData.dispose = true;
    return g.object;
  };
}

export function setViewportHeight(h) { for (const m of all) m.uniforms.uHalfH.value = h / 2; }
