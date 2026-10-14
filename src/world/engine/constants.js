// Shared numbers for the Pop-up Street engine. The street layout mirrors
// app.world_config.street_layout on the server, so coins always land on the
// street the app draws.

export const WALK_SPEED = 4.4;          // units per second (server allows up to 7)
export const REACH = 5.5;               // tap a stall within this distance to open it
export const PICKUP_RADIUS = 0.9;       // walk this close to a coin to pick it up
export const STALL_X = 5.4;             // stall centres sit this far either side of the street
export const STREET_HALF = 3.6;         // walkable half-width
export const STALL_W = 2.8;
export const ARCH_Z = 9.5;
export const START_Z = 17;
export const SLOTS = ['awning', 'sign', 'lights', 'decor'];

export const DEFAULT_LAYOUT = { x: 3.2, zmax: 15, first_row_z: 2, row_gap: 7, min_rows: 6, end_margin: 8 };

export const FONT_DISPLAY = 'Fredoka, "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
export const FONT_CHALK = 'Caveat, "Segoe Print", "Comic Sans MS", cursive';

// The street for `shopCount` stalls (two per row, at least min_rows rows).
export function streetGeometry(layout, shopCount) {
  const l = { ...DEFAULT_LAYOUT, ...(layout || {}) };
  const rows = Math.max(l.min_rows, Math.ceil(shopCount / 2));
  const zmin = l.first_row_z - (rows - 1) * l.row_gap - l.end_margin;
  const lastRowZ = l.first_row_z - (rows - 1) * l.row_gap;
  return {
    ...l,
    rows,
    zmin,
    lastRowZ,
    walkZMin: zmin - 2,
    walkZMax: l.zmax + 4,
    endZ: zmin - 5.5,
    farZ: zmin - 9,
    nearZ: 23,
    rowZ: (row) => l.first_row_z - row * l.row_gap,
    gapZs: Array.from({ length: rows + 1 }, (_, i) => l.first_row_z + l.row_gap / 2 - i * l.row_gap),
  };
}

// Two looks for the same street: bright day and a lit-up evening market.
export const THEMES = {
  day: {
    hemi: [0xe2f1ff, 0xd9cbb8, 1.45],
    sun: [0xfff2e0, 2.4],
    fill: [0xcfe4ff, 0.45],
    sky: { top: '#4f9be0', mid: '#8cc5ef', low: '#cbe6f7', horizon: '#eaf4f8', bottom: '#dcecf5' },
    sunDisc: { color: 0xfffbe8, scale: 120, pos: [80, 150, -230], opacity: 0.8 },
    cloud: { color: 0xffffff, opacity: 0.9 },
    fog: [0xdcecf5, 45, 170],
    ground: '#a7d27f',
    paver: { base: '#b8907f', tiles: ['#e8cbbb', '#dfbda9', '#ecd3c4', '#d9b5a2', '#e4c5b3'] },
    side: { base: '#b39cb0', a: '#d6c4d3', b: '#cdb9ca' },
    stallFloor: '#c2a6bd',
    planter: '#d8cdd6',
    facadeGlow: 0.2,
    archGlow: 0.2,
    bulbGlow: 0.55,
  },
  dusk: {
    hemi: [0xffd6ec, 0x50305e, 1.7],
    sun: [0xffc49a, 2.5],
    fill: [0xff8fc8, 0.8],
    sky: { top: '#2a1252', mid: '#8b2fc9', low: '#e0449a', horizon: '#fb923c', bottom: '#f0866c' },
    sunDisc: { color: 0xffd9a0, scale: 90, pos: [-30, 16, -230], opacity: 1 },
    cloud: { color: 0xffb2cf, opacity: 0.55 },
    fog: [0xf0866c, 30, 110],
    ground: '#4b2b55',
    paver: { base: '#9c7466', tiles: ['#d6b3a1', '#cba590', '#dcbcaa', '#c69e8a', '#d3ad98'] },
    side: { base: '#5e4262', a: '#7a5b7c', b: '#735574' },
    stallFloor: '#6d4d6b',
    planter: '#7a5b7c',
    facadeGlow: 0.85,
    archGlow: 0.45,
    bulbGlow: 0.9,
  },
};

// Evening look from 6:30pm to 6am on the player's own clock (Singapore sunset
// is around 7pm all year). ?time=day or ?time=dusk overrides it for demos.
export function autoTheme(date = new Date(), search = (typeof location !== 'undefined' ? location.search : '')) {
  const forced = new URLSearchParams(search).get('time');
  if (forced === 'day' || forced === 'dusk') return forced;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 18 * 60 + 30 || minutes < 6 * 60 ? 'dusk' : 'day';
}
