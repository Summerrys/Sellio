// The island lives on a local grid in metres: x east, y north, origin at
// Sellio Plaza. The map needs longitude/latitude, so the island is placed on
// the equator at 0°, 0° where a metre is the same size in every direction.
// The 3D layer uses the same metres with three.js axes: x east, y up, z south.

const EARTH = 40075016.68557849; // circumference used by Web Mercator, metres

export const ORIGIN = [0, 0];
// Mercator units per metre at the origin (Web Mercator is 0..1 across the world).
export const MERC_PER_M = 1 / EARTH;

export function toLngLat(x, y) {
  const mx = 0.5 + x * MERC_PER_M;
  const my = 0.5 - y * MERC_PER_M;
  const lng = mx * 360 - 180;
  const lat = (360 / Math.PI) * Math.atan(Math.exp((180 - my * 360) * Math.PI / 180)) - 90;
  return [lng, lat];
}
export function fromLngLat([lng, lat]) {
  const mx = (180 + lng) / 360;
  const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360;
  return { x: (mx - 0.5) / MERC_PER_M, y: (0.5 - my) / MERC_PER_M };
}
// three.js position (x east, z south) from map metres and back.
export const toThree = (x, y) => ({ x, z: -y });
export const fromThree = (x, z) => ({ x, y: -z });

// Pixels per metre at a zoom level (MapLibre uses 512-pixel tiles).
export const pxPerMetre = (zoom) => 512 * 2 ** zoom / EARTH;
// A MapLibre expression for a width that stays `m` metres wide at any zoom.
export const metres = (m) => ['interpolate', ['exponential', 2], ['zoom'], 10, m * pxPerMetre(10), 24, m * pxPerMetre(24)];

/* shapes, all in metres */
export const ring = (pts) => { const r = pts.map(([x, y]) => toLngLat(x, y)); r.push(r[0]); return r; };
export const polygon = (pts, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring(pts)] } });
export const polygonWithHoles = (outer, holes, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring(outer), ...holes.map(ring)] } });
export const line = (pts, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => toLngLat(x, y)) } });
export const point = (x, y, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: toLngLat(x, y) } });

export function rect(cx, cy, w, d, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export function circle(cx, cy, r, n = 48) {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cy + Math.sin(i / n * Math.PI * 2) * r]);
}
// Closed Catmull-Rom curve through control points.
export function smoothClosed(pts, perSeg = 10) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  return out;
}
// Open Catmull-Rom curve.
export function smoothOpen(pts, perSeg = 10) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[n - 1]);
  return out;
}
// Signed area (positive when the points run anticlockwise, y north).
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
// Moves a closed polygon's edge inward by d metres (outward when d < 0).
export function offsetClosed(pts, d) {
  const n = pts.length, dir = polygonArea(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    return [p[0] + nx * d * dir, p[1] + ny * d * dir];
  });
}
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
