// How each stall item looks. Prices, names, rarity and level locks come from
// the server catalogue (app.world_cosmetics); this file only knows how to draw
// an item code. A code the app does not know yet falls back to the starter
// look, so a new server item never breaks an older app.

export const DEFAULT_STYLE = { awning: 'sunset', sign: 'wood', lights: 'none', decor: 'none' };

export const LOOKS = {
  awning: {
    sunset: { kind: 'stripes', colors: ['#fb923c', '#fff4ea'] },
    mint: { kind: 'stripes', colors: ['#2fbf95', '#f2fff9'] },
    scallop: { kind: 'stripes', colors: ['#e0449a', '#ffe9f4'], scallop: true },
    pagoda: { kind: 'pagoda' },
    glow: { kind: 'glow' },
  },
  sign: { wood: {}, chalk: {}, neon: {}, gold: {} },
  lights: { none: {}, bulbs: {}, fairy: {}, lanterns: {} },
  decor: { none: {}, plants: {}, bunting: {}, balloons: {} },
};

export function safeStyle(style) {
  const out = { ...DEFAULT_STYLE };
  for (const slot of Object.keys(DEFAULT_STYLE)) {
    const code = style?.[slot];
    if (code && LOOKS[slot][code]) out[slot] = code;
  }
  return out;
}

export const RARITY = {
  starter: { label: 'Starter', color: '#6e5a7e' },
  common: { label: 'Common', color: '#13865f' },
  rare: { label: 'Rare', color: '#2f6fd6' },
  epic: { label: 'Epic', color: '#8b2fc9' },
};

export const SLOT_LABELS = { awning: 'Awning', sign: 'Signboard', lights: 'Lights', decor: 'Decor' };

// Goods on the counter. A shop's set is picked from its kind and id, so each
// stall looks different but stays the same every visit.
export const GOODS = {
  bakes: [['disc', '#c98543'], ['loaf', '#a8642c'], ['jar', '#f2d7a6'], ['disc', '#d99a52'], ['loaf', '#b8733a']],
  kueh: [['block', '#2fae86'], ['ball', '#3fb37f'], ['block', '#e2558a'], ['ball', '#3fb37f'], ['block', '#f2c14b']],
  rice: [['pyramid', '#3c8d4a'], ['bowl', '#d2412f'], ['pyramid', '#4aa35a'], ['tub', '#c8321f'], ['pyramid', '#3c8d4a']],
  bao: [['steamer'], ['ball', '#fbf3e6'], ['steamer'], ['ball', '#fbf3e6'], ['ball', '#f4d9b0']],
  drinks: [['bottle', '#3b2318'], ['cup', '#d9b28c'], ['bottle', '#4a2c1d'], ['cup', '#efe1cf'], ['bottle', '#3b2318']],
  dumplings: [['steamer'], ['ball', '#f6ecd9'], ['tub', '#c8321f'], ['steamer'], ['ball', '#f6ecd9']],
  bread: [['loaf', '#9b5f2c'], ['ball', '#b5763c'], ['loaf', '#7c4a24'], ['disc', '#c98543'], ['loaf', '#a8642c']],
  jars: [['jar', '#c8321f'], ['jar', '#e0562f'], ['jar', '#8f1f14'], ['jar', '#e8742f'], ['jar', '#c8321f']],
  matcha: [['cup', '#79b04a'], ['cake', '#8cbf5a'], ['cup', '#a26a3c'], ['cup', '#79b04a'], ['block', '#5c9d3a']],
  puffs: [['puff', '#e2a24c'], ['puff', '#d9913a'], ['puff', '#e8b25e'], ['puff', '#d9913a'], ['puff', '#e2a24c']],
  kaya: [['jar', '#6fa83c'], ['toast', '#e3b56c'], ['jar', '#b5763c'], ['toast', '#e3b56c'], ['jar', '#6fa83c']],
  cake: [['cake', '#8fcf6b'], ['block', '#7cc36b'], ['cake', '#a6d98a'], ['block', '#e8c27a'], ['cake', '#8fcf6b']],
  gifts: [['box', '#e0449a'], ['candle', '#f6e7cf'], ['bag', '#e8d5b5'], ['box', '#8b2fc9'], ['candle', '#f4c7d6']],
  crafts: [['bag', '#cfe3d4'], ['jar', '#f3c14b'], ['box', '#2fbf95'], ['bag', '#f2d7a6'], ['candle', '#d7c4ef']],
};
const FOOD_SETS = ['bakes', 'kueh', 'rice', 'bao', 'drinks', 'dumplings', 'bread', 'jars', 'matcha', 'puffs', 'kaya', 'cake'];
const SHOP_SETS = ['gifts', 'crafts'];

export function goodsFor(shop, hash) {
  if (shop.goods && GOODS[shop.goods]) return GOODS[shop.goods];
  const sets = /kitchen|bakery|caf|brew|food/i.test(shop.kind || '') ? FOOD_SETS : SHOP_SETS;
  return GOODS[sets[hash % sets.length]];
}
