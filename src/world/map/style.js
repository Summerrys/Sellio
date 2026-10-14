import { metres } from './geo';

// The map's look, in Sellio's colours. Two palettes: bright day and a warm
// evening. Everything is drawn from the island's own GeoJSON; no map tiles,
// fonts or sprites are downloaded (labels are HTML, so no glyph server).

export const PALETTES = {
  day: {
    sea: '#9cd2ea', halo: '#b9e3f2', halo2: '#d9f0f7', land: '#bcdf9c', park: '#a3d585',
    district: { fnb: '#c7e2a6', popup: '#ead6cd', retail: '#e8e1f1', services: '#d7eed4' },
    water: '#7cc7e2', waterEdge: '#5fb3d1', plaza: '#ecd8cb', stone: '#f5eee6', square: '#f1dccb', street: '#e4c4b4', pad: '#f7e6f1',
    lot: '#e7dccb', lotOpen: '#efe7f4',
    avenue: '#faf5ee', avenueEdge: '#dccfbf', boulevard: '#f7ecdf', promenade: '#fffaf3',
    building: 0.95,
    sky: { 'sky-color': '#5aa3e3', 'horizon-color': '#eaf4f8', 'fog-color': '#dcecf5', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.9, 'atmosphere-blend': 0.6 },
    light: { anchor: 'viewport', color: '#fff6ea', intensity: 0.32, position: [1.3, 210, 35] },
  },
  dusk: {
    sea: '#4b4f91', halo: '#5f5c9d', halo2: '#77699f', land: '#86a174', park: '#75975f',
    district: { fnb: '#8fa87a', popup: '#d2ab9d', retail: '#c4b7d4', services: '#a9c6ab' },
    water: '#5a6cb0', waterEdge: '#4a5a99', plaza: '#d7ad9e', stone: '#e4cdc1', square: '#e0b5a0', street: '#c99686', pad: '#e8c3dc',
    lot: '#cfb3a3', lotOpen: '#cdb9d6',
    avenue: '#efdbcf', avenueEdge: '#c3a395', boulevard: '#ebcfbe', promenade: '#f6e3d6',
    building: 0.92,
    sky: { 'sky-color': '#3a1d66', 'horizon-color': '#fb923c', 'fog-color': '#e7849a', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.7 },
    light: { anchor: 'viewport', color: '#ffd2b0', intensity: 0.28, position: [1.3, 250, 25] },
  },
};

const kind = (k) => ['==', ['get', 'kind'], k];
const districtColour = (P) => ['match', ['get', 'key'], 'fnb', P.district.fnb, 'popup', P.district.popup, 'retail', P.district.retail, P.district.services];
const pathColour = (P) => ['match', ['get', 'tone'], 'boulevard', P.boulevard, 'promenade', P.promenade, P.avenue];
const plazaColour = (P) => ['match', ['get', 'tone'], 'stone', P.stone, 'square', P.square, 'street', P.street, 'pad', P.pad, P.plaza];
const lotColour = (P) => ['case', ['get', 'taken'], P.lot, P.lotOpen];
// Pixels per metre at a zoom, as a plain number for use inside expressions.
const metresAt = (z) => 512 * 2 ** z / 40075016.68557849;
const widthOf = (extra = 0) => ['interpolate', ['exponential', 2], ['zoom'], 10, ['*', ['+', ['get', 'width'], extra], metresAt(10)], 24, ['*', ['+', ['get', 'width'], extra], metresAt(24)]];

export function buildStyle(features, theme = 'day') {
  const P = PALETTES[theme] || PALETTES.day;
  return {
    version: 8,
    name: 'Sellio World',
    sources: { world: { type: 'geojson', data: features, buffer: 256, tolerance: 0.15, maxzoom: 20 } },
    sky: P.sky,
    light: P.light,
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': P.sea } },
      { id: 'halo', type: 'fill', source: 'world', filter: kind('halo'), paint: { 'fill-color': P.halo } },
      { id: 'halo2', type: 'fill', source: 'world', filter: kind('halo2'), paint: { 'fill-color': P.halo2 } },
      { id: 'land', type: 'fill', source: 'world', filter: kind('land'), paint: { 'fill-color': P.land } },
      { id: 'district', type: 'fill', source: 'world', filter: kind('district'), paint: { 'fill-color': districtColour(P) } },
      { id: 'district-edge', type: 'line', source: 'world', filter: ['all', kind('district'), ['any', ['==', ['get', 'key'], 'retail'], ['==', ['get', 'key'], 'services']]],
        paint: { 'line-color': '#b39cc8', 'line-width': metres(0.7), 'line-dasharray': [3, 2], 'line-opacity': 0.7 } },
      { id: 'park', type: 'fill', source: 'world', filter: kind('park'), paint: { 'fill-color': P.park } },
      { id: 'path-edge', type: 'line', source: 'world', filter: kind('path'), layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.avenueEdge, 'line-width': widthOf(1.1) } },
      { id: 'path', type: 'line', source: 'world', filter: kind('path'), layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pathColour(P), 'line-width': widthOf(0) } },
      { id: 'plaza', type: 'fill', source: 'world', filter: kind('plaza'), paint: { 'fill-color': plazaColour(P) } },
      { id: 'lot', type: 'fill', source: 'world', filter: kind('lot'), paint: { 'fill-color': lotColour(P) } },
      { id: 'water', type: 'fill', source: 'world', filter: kind('water'), paint: { 'fill-color': P.water, 'fill-outline-color': P.waterEdge } },
      { id: 'buildings', type: 'fill-extrusion', source: 'world', filter: kind('building'),
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': P.building, 'fill-extrusion-vertical-gradient': true } },
    ],
  };
}

export function applyPalette(map, theme) {
  const P = PALETTES[theme] || PALETTES.day;
  const set = (id, prop, v) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); };
  set('sea', 'background-color', P.sea);
  set('halo', 'fill-color', P.halo);
  set('halo2', 'fill-color', P.halo2);
  set('land', 'fill-color', P.land);
  set('district', 'fill-color', districtColour(P));
  set('park', 'fill-color', P.park);
  set('path-edge', 'line-color', P.avenueEdge);
  set('path', 'line-color', pathColour(P));
  set('plaza', 'fill-color', plazaColour(P));
  set('lot', 'fill-color', lotColour(P));
  set('water', 'fill-color', P.water);
  set('water', 'fill-outline-color', P.waterEdge);
  set('buildings', 'fill-extrusion-opacity', P.building);
  try { map.setSky(P.sky); } catch { /* not supported */ }
  try { map.setLight(P.light); } catch { /* not supported */ }
}
