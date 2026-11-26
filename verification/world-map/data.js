// Example stalls for verification/world-map.browser.mjs and standalone previews. Never used by
// the live app, which shows only real, live Sellio shops.
const RAW = [
  ['mine', 'Sunny Side Bakes', 'Home bakery', 'Punggol', [true, true], '#f07f2a', 'bakes', null,
    'Small-batch cookies and loaves, baked to order on weekends.', [['Brown butter cookies (6)', 12], ['Banana walnut loaf', 16], ['Earl Grey madeleines (8)', 14]]],
  ['kueh', 'Kueh by Mei', 'Home kitchen', 'Toa Payoh', [true, false], '#1f9e78', 'kueh', { awning: 'mint', sign: 'chalk', lights: 'lanterns', decor: 'plants' },
    "Nyonya kueh from her grandmother's recipes, made fresh every Saturday.", [['Kueh salat (4 pcs)', 6.5], ['Ondeh-ondeh (10 pcs)', 7], ['Kueh lapis box', 12]]],
  ['nasi', "Farah's Nasi Lemak", 'Home kitchen', 'Bedok', [false, true], '#e0449a', 'rice', { awning: 'scallop', sign: 'wood', lights: 'bulbs', decor: 'bunting' },
    'Coconut rice, a crispy chicken wing and sambal with real heat.', [['Nasi lemak with chicken wing', 7.5], ['Sambal tub (250 g)', 6], ['Otah (2 pcs)', 4]]],
  ['bao', 'Little Bao House', 'Home kitchen', 'Jurong West', [true, false], '#e6a321', 'bao', { awning: 'sunset', sign: 'gold', lights: 'lanterns', decor: 'none' },
    'Fluffy bao steamed in small batches, sold warm or frozen.', [['Char siew bao (4)', 6.8], ['Lotus paste bao (4)', 6], ['Kong bak bao (2)', 8.5]]],
  ['brew', 'Cold Brew Club', 'Home brewer', 'Clementi', [false, true], '#4b3a8c', 'drinks', { awning: 'mint', sign: 'neon', lights: 'fairy', decor: 'none' },
    'Slow-steeped for 18 hours and bottled the same morning.', [['Classic cold brew (1 L)', 18], ['Oat latte bottle', 6.5], ['Gula melaka latte', 7]]],
  ['dumpling', 'Mama Lim Dumplings', 'Home kitchen', 'Ang Mo Kio', [true, true], '#c8323c', 'dumplings', { awning: 'pagoda', sign: 'gold', lights: 'lanterns', decor: 'plants' },
    'Hand-folded dumplings, frozen in packs of 20 for your freezer.', [['Pork & chive dumplings (20)', 14], ['Chilli oil wontons (12)', 9], ['Potstickers (30)', 22]]],
  ['sourdough', 'Sourdough Sundays', 'Home bakery', 'Bukit Timah', [true, false], '#a86b3c', 'bread', { awning: 'sunset', sign: 'chalk', lights: 'bulbs', decor: 'plants' },
    'Naturally leavened loaves, out of the oven every Sunday morning.', [['Country loaf', 12], ['Seeded rye', 14], ['Cinnamon knots (4)', 10]]],
  ['sambal', 'Sambal Studio', 'Home kitchen', 'Yishun', [false, true], '#d2412f', 'jars', { awning: 'scallop', sign: 'neon', lights: 'bulbs', decor: 'balloons' },
    'Small-batch sambal in four heat levels, from mild to dangerous.', [['Sambal belacan (200 g)', 9], ['Sambal ikan bilis (200 g)', 10], ['Chilli crisp (200 g)', 11]]],
  ['matcha', 'Matcha Moments', 'Home café', 'Tampines', [false, true], '#4f8f2f', 'matcha', { awning: 'glow', sign: 'neon', lights: 'fairy', decor: 'balloons' },
    'Ceremonial-grade matcha drinks and bakes, whisked to order.', [['Matcha latte', 6.8], ['Matcha basque cheesecake', 7.5], ['Hojicha latte', 6.8]]],
  ['curry', 'Curry Puff Corner', 'Home kitchen', 'Geylang', [true, false], '#d97a1e', 'puffs', { awning: 'mint', sign: 'wood', lights: 'none', decor: 'bunting' },
    'Spiral-crust curry puffs, fried fresh every afternoon.', [['Chicken curry puff', 1.8], ['Sardine puff', 1.8], ['Box of 10', 16]]],
  ['kaya', 'Kaya & Co.', 'Home kitchen', 'Serangoon', [false, true], '#5f9a2f', 'kaya', { awning: 'sunset', sign: 'gold', lights: 'fairy', decor: 'plants' },
    'Slow-stirred kaya, cooked for three hours over a low flame.', [['Pandan kaya (250 g)', 8.5], ['Kaya toast set', 5.5], ['Gula melaka kaya (250 g)', 9]]],
  ['cake', 'Pandan Cake Lab', 'Home bakery', 'Woodlands', [true, false], '#57a84a', 'cake', { awning: 'glow', sign: 'chalk', lights: 'bulbs', decor: 'bunting' },
    'Tall, bouncy pandan chiffon cakes, baked in the morning.', [['Pandan chiffon (whole)', 18], ['Ondeh-ondeh cake slice', 6.5], ['Pandan gula melaka roll', 14]]],
];

export const DEMO_SHOPS = RAW.map(([id, name, kind, area, [collection, delivery], tint, goods, style, tagline, menu]) => ({
  tenant_id: `demo-${id}`, slug: `demo-${id}`, name, kind, area, collection, delivery, tint, goods, tagline,
  currency: 'SGD', logo_url: null,
  style: style || { awning: 'sunset', sign: 'wood', lights: 'none', decor: 'none' },
  menu: menu.map(([n, p]) => ({ name: n, price: p, image_url: null })),
  mine: id === 'mine',
}));

export const DEMO_MY_SHOP = 'demo-mine';
