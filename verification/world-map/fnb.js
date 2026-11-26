// Example F&B merchants for verification/world-map.browser.mjs and standalone previews. Never used
// by the live app, which shows only real, live Sellio merchants.
const RAW = [
  ['cafetelier', 'Cafetelier', 'Café & patisserie', '#8b2fc9', 'Specialty coffee and French pastries, baked every morning.', [['Butter croissant', 4.2], ['Iced Spanish latte', 6.5], ['Pistachio cruffin', 6.8]]],
  ['kopi-lab', 'Kopi Lab', 'Kopitiam café', '#a86b3c', 'Nanyang kopi roasted in-house, kaya toast and soft-boiled eggs.', [['Kopi C kosong', 2.2], ['Kaya butter toast set', 5.5], ['Teh tarik', 2.4]]],
  ['noodle-house', 'Ah Hock Noodle House', 'Noodle bar', '#c8323c', 'Hand-pulled noodles in a 12-hour pork bone broth.', [['Signature ramen', 14.9], ['Dry mee pok', 8.5], ['Gyoza (6)', 7]]],
  ['green-bowl', 'The Green Bowl', 'Salads & grain bowls', '#1f9e78', 'Big, bright bowls with seasonal greens and house dressings.', [['Miso salmon bowl', 15.9], ['Tahini chickpea bowl', 12.5], ['Cold-pressed juice', 7]]],
  ['bakehaus', 'Bakehaus', 'Bakery', '#e6a321', 'Sourdough, cinnamon knots and cakes by the slice.', [['Country sourdough', 11], ['Cinnamon knot', 4.8], ['Burnt cheesecake slice', 7.2]]],
  ['spice-route', 'Spice Route', 'Indian kitchen', '#d97a1e', 'Biryani, tandoor breads and slow-cooked curries.', [['Chicken dum biryani', 13.9], ['Garlic naan', 3.5], ['Mango lassi', 5]]],
  ['matcha-mori', 'Matcha Mori', 'Tea house', '#4f8f2f', 'Stone-ground matcha from Uji, whisked to order.', [['Usucha matcha', 7.5], ['Matcha soft serve', 5.8], ['Hojicha latte', 6.8]]],
  ['taco-amigo', 'Taco Amigo', 'Mexican street food', '#e0449a', 'Corn tortillas pressed fresh, salsas made daily.', [['Al pastor tacos (3)', 13.5], ['Elote cup', 5.5], ['Horchata', 5]]],
];

export const DEMO_FNB = RAW.map(([id, name, kind, tint, tagline, menu], i) => ({
  tenant_id: `demo-fnb-${id}`, slug: `demo-${id}`, name, kind, tint, tagline, currency: 'SGD', logo_url: null, banner_url: null,
  headline: i === 0 ? '20% off Today’s Picks' : null,
  hours_today: { open: i === 2 ? '11:00' : '08:00', close: i === 2 ? '22:00' : '21:00', closed: false },
  open_now: true,
  menu: menu.map(([n, p]) => ({ name: n, price: p, image_url: null })),
}));
