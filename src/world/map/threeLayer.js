import * as THREE from 'three';
import { MERC_PER_M } from './geo';

// Draws a three.js scene inside MapLibre, sharing the map's WebGL context and
// depth buffer, so 3D objects sit on the vector map and hide behind its
// extruded buildings. The scene uses metres around Sellio Plaza with three.js
// axes (x east, y up, z south).
//
// MapLibre hands the layer one matrix (mercator to clip space). Rather than
// using it as a bare projection, it is split into a real camera position,
// rotation and projection, so sprites, distance checks, level of detail and
// raycasting all work as in any three.js scene.

// three.js metres -> Web Mercator units (x east, y south, z up)
const MODEL = new THREE.Matrix4()
  .makeTranslation(0.5, 0.5, 0)
  .multiply(new THREE.Matrix4().makeScale(MERC_PER_M, -MERC_PER_M, MERC_PER_M))
  .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

const M = new THREE.Matrix4(), L = new THREE.Matrix4(), R = new THREE.Matrix4(), RX = new THREE.Matrix4(), W = new THREE.Matrix4();
const C = new THREE.Vector3();

function solve3(a, b) {
  // Cramer's rule for a 3x3 system a·x = b (a given by rows).
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(a);
  if (Math.abs(d) < 1e-30) return null;
  const col = (k) => a.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

/** Updates `camera` from MapLibre's matrix and the map's bearing and pitch (degrees). */
export function syncCamera(camera, matrix, bearingDeg, pitchDeg) {
  M.fromArray(matrix);
  L.multiplyMatrices(M, MODEL);
  const e = L.elements; // column-major: e[col * 4 + row]
  // A perspective projection leaves x, y and w at zero for the camera's own
  // position, which pins the camera down from rows 0, 1 and 3.
  const rows = [0, 1, 3];
  const c = solve3(rows.map((r) => [e[r], e[4 + r], e[8 + r]]), rows.map((r) => -e[12 + r]));
  if (!c) return false;
  C.set(c[0], c[1], c[2]);
  const b = THREE.MathUtils.degToRad(bearingDeg), p = THREE.MathUtils.degToRad(pitchDeg);
  R.makeRotationY(-b).multiply(RX.makeRotationX(-(Math.PI / 2 - p)));
  W.copy(R).setPosition(C);
  camera.matrix.copy(W);
  camera.matrixWorld.copy(W);
  camera.matrixWorldInverse.copy(W).invert();
  camera.projectionMatrix.multiplyMatrices(L, W);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.position.copy(C);
  camera.quaternion.setFromRotationMatrix(R);
  return true;
}

/**
 * A MapLibre custom layer that renders `scene`. `beforeRender(camera)` runs
 * after the camera is updated and before drawing.
 */
export function createThreeLayer({ id = 'sellio-3d', scene, onContext, beforeRender }) {
  const camera = new THREE.PerspectiveCamera();
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  let renderer = null, map = null;
  const layer = {
    id, type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      onContext?.(renderer);
    },
    render(gl, matrix) {
      if (!renderer) return;
      if (!syncCamera(camera, matrix, map.getBearing(), map.getPitch())) return;
      renderer.resetState();
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      beforeRender?.(camera, gl);
      renderer.render(scene, camera);
    },
    onRemove() { renderer?.dispose(); renderer = null; },
  };
  return { layer, camera, get renderer() { return renderer; } };
}
