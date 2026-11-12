// Indonesia's plan prices (Alvin, 12 Nov 2026): S$18, S$35 and S$56 a month on their own Stripe
// Payment Links, still in SGD; Stripe's Adaptive Pricing shows and charges Indonesian owners
// Rupiah. An Indonesian shop (its country, or rupiah as its currency) or a visitor whose phone or
// computer is in Indonesia (its time zone, then its language) gets them, with about what they
// come to in rupiah. Rupiah on screen: Rp38.000, no decimals.
// Run from the app root (no install needed): node verification/indonesia-plans.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const app = process.cwd();
let passes = 0;
const passed = (name) => { passes += 1; console.log('ok - ' + name); };

const temporary = await mkdtemp(path.join(app, '.indonesia-plans-verification-'));
let plans; let money; let countries;
try {
  const load = async (relative) => {
    const outfile = path.join(temporary, relative.replace(/[^a-z0-9]/gi, '_') + '.mjs');
    await build({ entryPoints: [path.join(app, relative)], outfile, bundle: true, format: 'esm', platform: 'node', alias: { '@': path.join(app, 'src') }, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  plans = await load('src/lib/plans.js');
  money = await load('src/lib/money.js');
  countries = await load('src/lib/countries.js');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

// Rupiah on screen.
const { formatMoney, currencyPrefix, currencyDecimals, roundMoney } = money;
assert.equal(formatMoney(38000, 'IDR'), 'Rp38.000');
assert.equal(formatMoney(1234567, 'IDR'), 'Rp1.234.567');
assert.equal(formatMoney(999, 'IDR'), 'Rp999');
assert.equal(formatMoney(0, 'IDR'), 'Rp0');
assert.equal(formatMoney(-5000, 'IDR'), '-Rp5.000');
assert.equal(formatMoney(999.6, 'IDR'), 'Rp1.000', 'whole rupiah');
assert.equal(formatMoney(-0.4, 'IDR'), 'Rp0', 'no minus on nothing');
assert.equal(formatMoney('15000', 'IDR'), 'Rp15.000');
assert.equal(formatMoney('', 'IDR'), '');
assert.equal(formatMoney(null, 'IDR'), '');
assert.equal(currencyPrefix('IDR'), 'Rp');
assert.equal(currencyDecimals('IDR'), 0);
assert.equal(currencyDecimals('SGD'), 2);
assert.equal(currencyDecimals('MYR'), 2);
assert.equal(roundMoney(15499.5, 'IDR'), 15500);
assert.equal(roundMoney(1.005, 'SGD'), 1.01);
assert.equal(roundMoney(2.345, 'MYR'), 2.35);
// Singapore and Malaysia as before.
assert.equal(formatMoney(1234.5, 'SGD'), 'S$1,234.50');
assert.equal(formatMoney(-5, 'MYR'), '-RM5.00');
assert.equal(formatMoney(5.5), 'S$5.50');
passed('rupiah show as Rp38.000 (no decimals, a dot between thousands); S$ and RM as before');

// The prices.
const { BUSINESS_PLANS, INDONESIA_PLANS, plansFor, planRegionFor, approxRupiah, rupiahNote, shopCheckoutLink, INDONESIA_PAYMENT_NOTE } = plans;
assert.deepEqual(INDONESIA_PLANS.map((p) => [p.key, p.name, p.monthly, p.yearly]), [
  ['starter', 'Starter', 18, 180],
  ['growth', 'Growth', 35, 350],
  ['pro', 'Professional', 56, 560],
]);
assert.deepEqual(BUSINESS_PLANS.map((p) => [p.key, p.monthly, p.yearly]), [['starter', 39, 390], ['growth', 79, 790], ['pro', 119, 1190]], 'the rest unchanged');
for (const [index, plan] of INDONESIA_PLANS.entries()) {
  assert.deepEqual(plan.features, BUSINESS_PLANS[index].features, `${plan.key}: the same plan, the same features`);
}
const SETS = ['links', 'noTrialLinks', 'shopLinks', 'shopTrialLinks'];
const linksOf = (list) => list.flatMap((plan) => SETS.flatMap((set) => [plan[set].monthly, plan[set].yearly]));
const indonesia = linksOf(INDONESIA_PLANS);
const rest = linksOf(BUSINESS_PLANS);
assert.equal(indonesia.length, 24);
assert.equal(new Set(indonesia).size, 24, 'a link of its own for each plan, billing and set');
for (const link of indonesia) {
  assert.match(link, /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/);
  assert.equal(rest.includes(link), false, `${link} is Indonesia's only`);
}
passed("Indonesia: S$18, S$35 and S$56 a month (a year at 10 months), each on 24 links of its own; the rest's unchanged");

assert.equal(planRegionFor({ country: 'Indonesia', currency: 'IDR' }), 'ID');
assert.equal(planRegionFor({ country: 'Indonesia' }), 'ID');
assert.equal(planRegionFor({ country: 'Singapore', currency: 'IDR' }), 'ID', 'rupiah as its currency');
assert.equal(planRegionFor({ country: 'Singapore', currency: 'SGD' }), 'SG');
assert.equal(planRegionFor({ country: 'Malaysia', currency: 'MYR' }), 'SG', 'Malaysia pays the SGD prices, as before');
assert.equal(planRegionFor({ country: null }), 'SG');
assert.equal(planRegionFor(null), 'SG');
assert.equal(plansFor('ID'), INDONESIA_PLANS);
assert.equal(plansFor('SG'), BUSINESS_PLANS);
assert.equal(plansFor(undefined), BUSINESS_PLANS);
passed("an Indonesian shop (its country, or rupiah) gets Indonesia's prices; Singapore and Malaysia the rest's");

assert.deepEqual([18, 35, 56, 180, 350, 560].map(approxRupiah), [255000, 496000, 793000, 2549000, 4957000, 7931000]);
assert.equal(rupiahNote(18), 'about Rp255.000, charged in Rupiah');
assert.equal(rupiahNote(560), 'about Rp7.931.000, charged in Rupiah');
assert.match(INDONESIA_PAYMENT_NOTE, /^Paid by card, in Rupiah: Stripe converts at the day's rate and adds a 2–4% conversion fee\. Prices are before PPN \(VAT\)\.$/);
passed('about what they come to in rupiah, to the nearest Rp1.000 (Rp255.000, Rp496.000, Rp793.000), and how they are paid');

const id = INDONESIA_PLANS.find((p) => p.key === 'growth');
const sg = BUSINESS_PLANS.find((p) => p.key === 'growth');
assert.equal(shopCheckoutLink('growth', { region: 'ID' }), id.shopLinks.monthly);
assert.equal(shopCheckoutLink('growth', { region: 'ID', yearly: true, trial: true }), id.shopTrialLinks.yearly);
assert.equal(shopCheckoutLink('growth', { region: 'ID', tenantId: 'shop-9', email: 'a@b.id' }), `${id.shopLinks.monthly}?client_reference_id=shop-9&prefilled_email=a%40b.id`);
assert.equal(shopCheckoutLink('growth', {}), sg.shopLinks.monthly, 'no region: the rest');
assert.equal(shopCheckoutLink('growth', { region: 'SG', trial: true }), sg.shopTrialLinks.monthly);
assert.equal(shopCheckoutLink('nope', { region: 'ID' }), '');
passed("a shop's checkout uses its region's links, with its id and the owner's email");

// Where a visitor is: the phone or computer's time zone first, then its language.
const { visitorCountry, countryNamed, COUNTRIES } = countries;
for (const zone of ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura']) {
  assert.equal(visitorCountry({ zone, languages: ['en-US'] }), 'Indonesia', zone);
}
assert.equal(visitorCountry({ zone: 'Asia/Singapore', languages: ['id-ID'] }), 'Singapore', 'the time zone first');
assert.equal(visitorCountry({ zone: 'Asia/Kuala_Lumpur', languages: [] }), 'Malaysia');
assert.equal(visitorCountry({ zone: 'Asia/Kuching', languages: [] }), 'Malaysia');
assert.equal(visitorCountry({ zone: 'Europe/London', languages: ['id-ID', 'en'] }), 'Indonesia', 'else Bahasa Indonesia');
assert.equal(visitorCountry({ zone: 'Europe/London', languages: ['in_ID'] }), 'Indonesia', "older Android's code for it");
assert.equal(visitorCountry({ zone: 'Europe/London', languages: ['en-GB', 'ms-MY'] }), null);
assert.equal(visitorCountry({ zone: '', languages: ['ind'] }), null, 'not a language code it knows');
assert.equal(visitorCountry({ zone: 'America/New_York', languages: [] }), null);
assert.deepEqual(COUNTRIES.map((c) => [c.name, c.currency, c.dial, c.timezone, c.qr]), [
  ['Singapore', 'SGD', '65', 'Asia/Singapore', 'PayNow'],
  ['Malaysia', 'MYR', '60', 'Asia/Kuala_Lumpur', 'DuitNow'],
  ['Indonesia', 'IDR', '62', 'Asia/Jakarta', 'QRIS'],
]);
assert.equal(countryNamed('Indonesia').code, 'ID');
assert.equal(countryNamed('Atlantis'), null);
passed("a visitor's country: Indonesian time zones, else Bahasa Indonesia; the three countries' settings");

console.log(passes + ' indonesia-plans checks passed');
