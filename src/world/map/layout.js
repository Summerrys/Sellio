import { polygon, line, rect, circle, smoothClosed, smoothOpen, offsetClosed, polygonArea, pointInPolygon } from './geo';
import { rng } from '../engine/kit';
import { streetGeometry } from '../engine/constants';

// The island of Sellio World, laid out in metres around Sellio Plaza (0, 0).
// North-west: Retail Avenue. North-east: Services Garden. South-west: F&B
// District. South-east: Pop-up Street. Everything the map draws and everything
// the player can walk on comes from here.

export const DISTRICTS = [
  { key: 'fnb', name: 'F&B District', status: 'live', blurb: 'Cafés, restaurants and bakeries in full storefronts', center: [-150, -80], pad: [-28, -80], view: { zoom: 19.2, bearing: -90, pitch: 58 } },
  { key: 'popup', name: 'Pop-up Street', status: 'live', blurb: 'Home sellers’ stalls, coins and daily rewards', center: [110, -60], pad: [110, -27], view: { zoom: 19.4, bearing: 180, pitch: 58 } },
  { key: 'retail', name: 'Retail Avenue', status: 'live', blurb: 'Boutiques and product-led shops', center: [-150, 180], pad: [-88, 160], view: { zoom: 18.6, bearing: -90, pitch: 56 } },
  { key: 'services', name: 'Services Garden', status: 'live', blurb: 'Studios, wellness and appointment-led services', center: [150, 180], pad: [88, 160], view: { zoom: 18.6, bearing: 90, pitch: 56 } },
];
export const PLAZA = { key: 'plaza', name: 'Sellio Plaza', center: [0, 0], radius: 34, pad: [0, 22] };
export const STREET_X = 110;           // Pop-up Street's centre line, metres east
export const STREET_ENTRANCE_Y = -40;  // where the street meets the avenue from the plaza
export const FNB_BOULEVARD_Y = -80;
export const PAD_RADIUS = 3.6;
export const BOULEVARD_HALF = 8.5; // storefront fronts stand this far either side of the boulevard's centre
const OPEN_PLOTS = 5;                  // "Open for lease!" units after the last café
// Retail Avenue and Services Garden, laid out like the F&B District: a Sellio
// Hop pad on a forecourt, a gateway arch, then a boulevard of shop units that
// ends in a small square. `dir` is the way the boulevard runs from its gate
// (-1 west, 1 east). Until merchants move in, every unit is "Open for lease!".
export const BUSINESS_STREETS = [
  { key: 'retail', name: 'Retail Avenue', pad: -88, gate: -106, y: 160, dir: -1 },
  { key: 'services', name: 'Services Garden', pad: 88, gate: 106, y: 160, dir: 1 },
];
const UNIT_GAP = 14.5;                 // unit centres along a boulevard
const UNITS_PER_SIDE = 6;
const SQUARE_RADIUS = 13;

const ISLAND_CTRL = [
  [-330, 40], [-322, 150], [-262, 216], [-120, 242], [-20, 248], [60, 238], [170, 244], [292, 206], [338, 120],
  [334, 10], [306, -82], [268, -150], [244, -238], [160, -276], [40, -258], [-60, -240], [-170, -250], [-282, -204], [-334, -110],
];

const PASTELS = ['#f6c9a8', '#bfe3d0', '#f7e3a1', '#c9d3f5', '#f4b8c8', '#d7c4ef', '#fbd9b9', '#cfe8f0'];

/**
 * Builds the island for this many Pop-up Street shops (the street grows with
 * them) and this many F&B storefronts.
 */
export function buildLayout({ popupLayout = null, popupShops = 0, fnbCount = 0 } = {}) {
  const geo = streetGeometry(popupLayout, popupShops);
  const R = rng(20261014);
  const F = []; // GeoJSON features
  const blockers = []; // polygons Mochi cannot walk through
  const walkways = []; // drawn after the blockers: bridges
  const trees = [], lamps = [], benches = [], beds = [], cranes = [], boards = []; // (no cranes or boards: every district is open)

  /* island and its rim */
  let island = smoothClosed(ISLAND_CTRL, 8);
  if (polygonArea(island) < 0) island = island.reverse();
  const inner = offsetClosed(island, 3);
  F.push(polygon(offsetClosed(island, -30), { kind: 'halo' }));
  F.push(polygon(offsetClosed(island, -12), { kind: 'halo2' }));
  F.push(polygon(island, { kind: 'land' }));
  const promenade = offsetClosed(island, 14);
  F.push(line([...promenade, promenade[0]], { kind: 'path', width: 5, tone: 'promenade' }));
  const treeZone = offsetClosed(island, 8);

  /* districts (tinted ground) */
  const district = (key, pts) => F.push(polygon(pts, { kind: 'district', key }));
  district('retail', [[-300, 62], [-34, 62], [-30, 222], [-250, 205], [-305, 140]]);
  district('services', [[34, 62], [300, 62], [310, 130], [270, 195], [40, 222]]);
  district('fnb', [[-312, -48], [-18, -48], [-18, -112], [-300, -112]]);
  district('popup', [[92, -30], [128, -30], [128, -48 - (geo.walkZMax - geo.farZ)], [92, -48 - (geo.walkZMax - geo.farZ)]]);

  /* parks: lawns between the districts */
  const park = (pts) => F.push(polygon(pts, { kind: 'park' }));
  park([[-300, -126], [-60, -126], [-80, -205], [-160, -228], [-270, -192]]);
  park([[148, -40], [285, -60], [262, -140], [230, -225], [148, -246]]);
  park([[-32, 40], [32, 40], [26, 58], [-26, 58]]);
  park(smoothClosed([[-62, -16], [-50, -36], [-30, -44], [-36, -24]], 4));
  park(smoothClosed([[40, -96], [80, -100], [84, -150], [44, -170], [22, -130]], 4));

  /* water: the canal from the north shore into the plaza pond, Services pools */
  const canal = smoothOpen([[6, 246], [-6, 200], [8, 150], [-4, 108], [0, 78]], 8);
  const canalPoly = [...canal.map(([x, y]) => [x - 7, y]), ...canal.slice().reverse().map(([x, y]) => [x + 7, y])];
  F.push(polygon(canalPoly, { kind: 'water' })); blockers.push(canalPoly);
  const pond = circle(0, 70, 17, 40); F.push(polygon(pond, { kind: 'water' })); blockers.push(pond);
  for (const [cx, cy, r] of [[150, 114, 12], [252, 124, 13]]) { const p = circle(cx, cy, r, 36); F.push(polygon(p, { kind: 'water' })); blockers.push(p); }
  // A footbridge over the canal joins Retail Avenue and Services Garden.
  const bridge = { x: 2, y: 128, length: 26, width: 4.6 };
  walkways.push(rect(bridge.x, bridge.y, bridge.length, bridge.width));

  /* Sellio Plaza */
  F.push(polygon(circle(0, 0, PLAZA.radius, 64), { kind: 'plaza', tone: 'plaza' }));
  F.push(polygon(circle(0, 0, PLAZA.radius - 6, 64), { kind: 'plaza', tone: 'stone' }));
  const fountain = circle(0, -2, 7.2, 32);
  blockers.push(fountain);

  /* avenues from the plaza */
  const paths = [[[...promenade, promenade[0]], 5]];
  const path = (pts, width, tone = 'avenue') => { F.push(line(pts, { kind: 'path', width, tone })); paths.push([pts, width]); };
  path(smoothOpen([[-24, -24], [-30, -46], [-28, FNB_BOULEVARD_Y + 8]], 6), 8);
  path(smoothOpen([[24, -24], [56, -34], [STREET_X, STREET_ENTRANCE_Y + 2]], 6), 8);
  path(smoothOpen([[-20, 28], [-50, 72], [-78, 118], [-86, 152]], 6), 8);
  path(smoothOpen([[20, 28], [50, 72], [78, 118], [86, 152]], 6), 8);
  path([[0, 34], [0, 52]], 6);
  path([[-80, bridge.y], [80, bridge.y]], 5);

  /* F&B District: a boulevard of storefronts round Makan Square */
  path([[-32, FNB_BOULEVARD_Y], [-300, FNB_BOULEVARD_Y]], BOULEVARD_HALF * 2 - 0.4, 'boulevard');
  F.push(polygon(circle(-175, FNB_BOULEVARD_Y, 22, 48), { kind: 'plaza', tone: 'square' }));
  F.push(polygon(circle(-28, FNB_BOULEVARD_Y, 10, 40), { kind: 'plaza', tone: 'square' })); // the entrance forecourt
  for (const s of [-1, 1]) beds.push({ x: -39, y: FNB_BOULEVARD_Y + s * 10.8, w: 6, d: 2.2, rot: 0 });
  F.push(polygon(circle(-175, FNB_BOULEVARD_Y, 4.5, 24), { kind: 'park' }));
  blockers.push(circle(-175, FNB_BOULEVARD_Y, 4.2, 16));
  const fnbPlots = [], terraces = [];
  for (const side of [1, -1]) {
    for (let x = -56; x > -296; x -= 14.5) {
      if (Math.abs(x + 175) < 30) continue; // Makan Square
      const front = FNB_BOULEVARD_Y + side * BOULEVARD_HALF, depth = 11.5;
      fnbPlots.push({ x, y: front + side * depth / 2, w: 12.5, d: depth, side, facing: side > 0 ? 0 : Math.PI, front });
    }
  }
  fnbPlots.sort((a, b) => (b.x - a.x) || (b.side - a.side)); // nearest the plaza first
  fnbPlots.forEach((p, i) => {
    p.index = i;
    p.kind = i < fnbCount ? 'shop' : i < fnbCount + OPEN_PLOTS ? 'open' : 'garden';
    p.door = [p.x - 2.9 * (p.side > 0 ? 1 : -1), p.front - p.side * 1.6]; // just outside the door
    const pts = rect(p.x, p.y, p.w, p.d);
    if (p.kind === 'garden') {
      F.push(polygon(rect(p.x, p.y, p.w - 0.6, p.d - 0.6), { kind: 'park' }));
      beds.push({ x: p.x, y: p.front + p.side * 1.2, w: p.w - 3, d: 1.2 });
      benches.push({ x: p.x - 2.5, y: p.front + p.side * 2.6, rot: p.facing });
      benches.push({ x: p.x + 2.5, y: p.front + p.side * 2.6, rot: p.facing });
      return;
    }
    F.push(polygon(pts, { kind: 'lot', taken: p.kind === 'shop' }));
    if (p.kind === 'shop') {
      // a café table on the terrace in front of the display window
      const tx = p.x + 2.6 * (p.side > 0 ? 1 : -1), ty = p.front - p.side * 2.1;
      terraces.push({ x: tx, y: ty, i: p.index }); blockers.push(circle(tx, ty, 1.35, 10));
    }
    // a unit's steps, planters and topiaries stand just in front of it
    blockers.push(rect(p.x, p.y - p.side * 0.6, p.w, p.d + 1.2));
  });
  // Café tables round Makan Square (drawn in 3D; block walking)
  const umbrellas = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.2, r = 14;
    const ux = -175 + Math.cos(a) * r, uy = FNB_BOULEVARD_Y + Math.sin(a) * r;
    if (Math.abs(uy - FNB_BOULEVARD_Y) < BOULEVARD_HALF) continue; // keep the boulevard clear
    umbrellas.push([ux, uy]); blockers.push(circle(ux, uy, 1.5, 10));
  }

  /* Pop-up Street: paving, stall pitches and shophouses either side */
  const toMapY = (z) => STREET_ENTRANCE_Y - (geo.walkZMax - z); // street-local z to map y
  const streetFrom = STREET_ENTRANCE_Y + 2, streetTo = toMapY(geo.farZ);
  F.push(polygon(rect(STREET_X, (streetFrom + streetTo) / 2, 18, streetFrom - streetTo), { kind: 'plaza', tone: 'street' }));
  for (let row = 0; row < geo.rows; row++) {
    const y = toMapY(geo.rowZ(row));
    for (const s of [-1, 1]) blockers.push(rect(STREET_X + s * 5.4, y, 3.4, 3.3));
  }
  for (const s of [-1, 1]) {
    for (let z = 21; z > geo.farZ; z -= 4.2) blockers.push(rect(STREET_X + s * 11.6, toMapY(z), 5, 4.16));
  }
  blockers.push(rect(STREET_X, toMapY(geo.endZ), 4.2, 1.2)); // the board at the end

  /* Retail Avenue and Services Garden: forecourt, gateway, boulevard of units, end square */
  const block = (x, y, w, d, h, color, area, rot = 0) => {
    const pts = rect(x, y, w, d, rot);
    F.push(polygon(pts, { kind: 'building', height: h, color, area }));
    blockers.push(pts);
  };
  const leasePlots = [];
  const gateways = [{ key: 'fnb', name: 'F&B District', x: -46, y: FNB_BOULEVARD_Y, face: 1 }];
  const streets = BUSINESS_STREETS.map((st) => {
    const first = st.gate + st.dir * 10, last = first + st.dir * (UNITS_PER_SIDE - 1) * UNIT_GAP;
    return { ...st, first, last, end: last + st.dir * (6.25 + SQUARE_RADIUS + 3), radius: SQUARE_RADIUS }; // `end`: the square at the far end
  });
  for (const st of streets) {
    const { dir, y, first, last, end } = st;
    path([[st.pad + dir * 4, y], [end, y]], BOULEVARD_HALF * 2 - 0.4, 'boulevard');
    F.push(polygon(circle(st.pad, y, 10, 40), { kind: 'plaza', tone: 'square' })); // the entrance forecourt
    F.push(polygon(circle(end, y, SQUARE_RADIUS, 48), { kind: 'plaza', tone: 'square' }));
    if (st.key === 'services') { const pond = circle(end, y, 4.6, 28); F.push(polygon(pond, { kind: 'water' })); blockers.push(pond); }
    else { F.push(polygon(circle(end, y, 4.5, 24), { kind: 'park' })); blockers.push(circle(end, y, 4.2, 16)); } // a planted island with a shade tree
    for (const s of [-1, 1]) beds.push({ x: st.pad + dir * 11, y: y + s * 10.8, w: 6, d: 2.2, rot: 0 });
    gateways.push({ key: st.key, name: st.name, x: st.gate, y, face: -dir });
    const plots = [];
    for (let k = 0; k < UNITS_PER_SIDE; k++) {
      for (const side of [1, -1]) {
        const front = y + side * BOULEVARD_HALF, depth = 11.5;
        plots.push({ district: st.key, kind: 'open', x: first + dir * k * UNIT_GAP, y: front + side * depth / 2, w: 12.5, d: depth, side, facing: side > 0 ? 0 : Math.PI, front });
      }
    }
    plots.forEach((p, i) => { // nearest the gate first
      p.index = i;
      p.door = [p.x - 2.9 * (p.side > 0 ? 1 : -1), p.front - p.side * 1.6];
      F.push(polygon(rect(p.x, p.y, p.w, p.d), { kind: 'lot', taken: false }));
      blockers.push(rect(p.x, p.y - p.side * 0.6, p.w, p.d + 1.2));
      leasePlots.push(p);
    });
    // a quieter back row, to give the street a skyline
    const tones = st.key === 'retail' ? PASTELS : ['#e8f2ea', '#dcebdf', '#eef3e6', '#d9e9e4'];
    for (let k = 0; k < 4; k++) block(first + dir * (6 + k * 20), y + 32.5, 13 + R() * 3, 10 + R() * 3, 10 + R() * 7, tones[Math.floor(R() * tones.length)], st.key);
    for (let x = first - dir * 2; dir * (last + dir * 8 - x) > 0; x += dir * 18) { lamps.push([x, y + 5.9]); lamps.push([x + dir * 9, y - 5.9]); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; lamps.push([end + Math.cos(a) * (SQUARE_RADIUS - 0.6), y + Math.sin(a) * (SQUARE_RADIUS - 0.6)]); }
    benches.push({ x: end + dir * 9.5, y: y + 4.5, rot: dir > 0 ? -Math.PI / 2 : Math.PI / 2 }, { x: end + dir * 9.5, y: y - 4.5, rot: dir > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  /* Sellio Hop pads */
  const pads = [{ key: 'plaza', x: PLAZA.pad[0], y: PLAZA.pad[1], live: true }, ...DISTRICTS.map((d) => ({ key: d.key, x: d.pad[0], y: d.pad[1], live: d.status === 'live' }))];
  for (const p of pads) F.push(polygon(circle(p.x, p.y, PAD_RADIUS + 0.8, 40), { kind: 'plaza', tone: 'pad' }));

  /* lamps along the boulevard, the plaza ring and the avenues */
  for (let x = -52; x > -300; x -= 18) { if (Math.abs(x + 175) < 24) continue; lamps.push([x, FNB_BOULEVARD_Y + 5.9]); lamps.push([x - 9, FNB_BOULEVARD_Y - 5.9]); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.26; lamps.push([Math.cos(a) * 33.5, Math.sin(a) * 33.5]); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lamps.push([-175 + Math.cos(a) * 21.5, FNB_BOULEVARD_Y + Math.sin(a) * 21.5]); }
  for (const l of lamps) blockers.push(circle(l[0], l[1], 0.35, 6));

  /* benches and flower beds round the plaza */
  // (rotations are three.js y rotations, which turn anticlockwise on the map)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52; benches.push({ x: Math.cos(a) * 22, y: Math.sin(a) * 22, rot: a - Math.PI / 2 }); }
  for (const b of benches) blockers.push(rect(b.x, b.y, 2, 0.8, b.rot));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; beds.push({ x: Math.cos(a) * 15, y: Math.sin(a) * 15, w: 5, d: 2.2, rot: a + Math.PI / 2 }); }
  for (const b of beds) blockers.push(rect(b.x, b.y, b.w, b.d, b.rot || 0));

  /* trees: avenues, parks and round the plaza */
  const clearOf = (x, y, r) => [...pads.map((p) => [p.x, p.y, PAD_RADIUS + 3])].every(([px, py, pr]) => Math.hypot(x - px, y - py) > pr + r);
  const onPath = (x, y) => (Math.abs(y - FNB_BOULEVARD_Y) < BOULEVARD_HALF + 1.5 && x < -16 && x > -304)
    || streets.some((st) => Math.abs(y - st.y) < BOULEVARD_HALF + 4 && st.dir * (x - st.pad) > -46 && st.dir * (x - st.end) < SQUARE_RADIUS + 2)
    // keep the view clear behind the camera's first look at each district
    || (x > 92 && x < 128 && y > -28 && y < 8) || (x > -30 && x < 14 && y > -92 && y < -68);
  const nearPath = (x, y, r) => paths.some(([pts, w]) => {
    for (let i = 0; i + 1 < pts.length; i++) if (segDist(x, y, pts[i], pts[i + 1]) < w / 2 + r) return true;
    return false;
  });
  const tryTree = (x, y, s = 1, v = 0) => {
    if (!pointInPolygon(x, y, treeZone)) return;
    if (blockers.some((b) => pointInPolygon(x, y, b)) || !clearOf(x, y, s) || onPath(x, y) || nearPath(x, y, 0.9 * s)) return;
    if (Math.abs(x - STREET_X) < 16 && y < STREET_ENTRANCE_Y + 6 && y > streetTo - 4) return;
    if (Math.hypot(x, y) < PLAZA.radius - 1) return;
    trees.push({ x, y, s, v }); blockers.push(circle(x, y, 0.9 * s, 8));
  };
  for (let x = -290; x <= -60; x += 15) { tryTree(x, FNB_BOULEVARD_Y + 25, 1.1, 1); tryTree(x + 7, FNB_BOULEVARD_Y - 25, 1.1, 1); }
  for (const s of [-1, 1]) { tryTree(-33, FNB_BOULEVARD_Y + s * 14.5, 1.15, 1); tryTree(-45, FNB_BOULEVARD_Y + s * 14, 1.05, 1); }
  for (const st of streets) {
    for (const s of [-1, 1]) { tryTree(st.pad + st.dir * 5, st.y + s * 14.5, 1.15, 1); tryTree(st.pad + st.dir * 17, st.y + s * 14, 1.05, 1); }
    for (let k = 0; k < 6; k++) { tryTree(st.first + st.dir * (k * 15 - 4), st.y + 24.5, 1.05, k % 3); tryTree(st.first + st.dir * (k * 15 + 3), st.y - 24.5, 1.05, (k + 1) % 3); }
  }
  for (const p of fnbPlots) if (p.kind === 'garden') { tryTree(p.x - 3.5, p.y + p.side * 2.5, 1.0, 0); tryTree(p.x + 3.5, p.y + p.side * 2.2, 0.9, 2); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + 0.1; tryTree(Math.cos(a) * 37, Math.sin(a) * 37, 0.95, 1); }
  for (let y = STREET_ENTRANCE_Y - 2; y > streetTo; y -= 9) { tryTree(STREET_X - 17.5, y, 1, 0); tryTree(STREET_X + 17.5, y - 4, 1, 2); }
  const parkSpots = [[-300, -126, -60, -228], [148, -40, 285, -246], [22, -96, 84, -170]];
  const inPark = (x, y) => parkSpots.some(([x0, y0, x1, y1]) => x > Math.min(x0, x1) && x < Math.max(x0, x1) && y < Math.max(y0, y1) && y > Math.min(y0, y1));
  for (let i = 0; i < 900; i++) {
    const x = -320 + R() * 640, y = -260 + R() * 500;
    if (!inPark(x, y) && R() < 0.6) continue;
    if (Math.abs(x) < 46 && Math.abs(y) < 50) continue;
    tryTree(x, y, 0.8 + R() * 0.7, R() < 0.18 ? 1 : R() < 0.35 ? 2 : 0);
  }
  // low shrubs and flowering bushes between the trees
  const bushes = [];
  for (let i = 0; i < 1100; i++) {
    const x = -320 + R() * 640, y = -260 + R() * 500;
    if (!inPark(x, y) && R() < 0.5) continue;
    if (Math.hypot(x, y) < PLAZA.radius + 4 || !pointInPolygon(x, y, treeZone)) continue;
    if (blockers.some((b) => pointInPolygon(x, y, b)) || !clearOf(x, y, 1) || onPath(x, y) || nearPath(x, y, 0.8)) continue;
    if (Math.abs(x - STREET_X) < 16 && y < STREET_ENTRANCE_Y + 6 && y > streetTo - 4) continue;
    bushes.push({ x, y, s: 0.6 + R() * 0.7, f: R() < 0.3 });
  }

  const xs = island.map((p) => p[0]), ys = island.map((p) => p[1]);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };

  return {
    island, inner, bounds,
    features: { type: 'FeatureCollection', features: F },
    blockers, walkways, trees, bushes, lamps, terraces, pads, umbrellas, fnbPlots, leasePlots, gateways, streets, benches, beds, cranes, boards, bridge, fountain: { x: 0, y: -2, r: 7.2 },
    street: { x: STREET_X, entranceY: STREET_ENTRANCE_Y, geo, toMapY, fromY: streetFrom, toY: streetTo },
  };
}

// The district a point (metres) is in, or null.
export function districtAt(x, y, layout) {
  if (Math.hypot(x, y) < PLAZA.radius + 4) return 'plaza';
  const s = layout.street;
  if (Math.abs(x - s.x) < 18 && y < s.fromY + 18 && y > s.toY - 2) return 'popup';
  if (y < -46 && y > -114 && x < -16) return 'fnb';
  if (y > 60 && x < -30) return 'retail';
  if (y > 60 && x > 30) return 'services';
  return null;
}

function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
