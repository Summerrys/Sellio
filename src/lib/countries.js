// Sellio's countries (Alvin, 12 Nov 2026: Indonesia joins Singapore and Malaysia). A shop's
// country (tenants.country, the name below) decides its currency, phone code, time zone, tax
// preset and the name of its payment QR, so no screen has to name Singapore or Malaysia for
// everyone. Singapore and Malaysia are as before.
//
// zones: the time zones a shop in the country can pick (Settings); the database keeps a shop's
// time zone to one of its country's (tenants trigger), Singapore time for Singapore and Malaysia.
// taxPresets: one tap to fill the tax rate (Indonesia: none by default; PBJT is the regional
// food-and-drink tax, at most 10%; PPN is VAT, for VAT-registered sellers).
// phone: the mobile number rule, without the country code or a leading 0.
export const COUNTRIES = [
  {
    name: 'Singapore', code: 'SG', currency: 'SGD', dial: '65', timezone: 'Asia/Singapore', qr: 'PayNow',
    zones: [{ zone: 'Asia/Singapore', label: 'Singapore time (UTC+8)' }],
    tax: { name: 'GST', rate: 9 },
    taxPresets: [],
    phone: { placeholder: '91234567', pattern: /^[89]\d{7}$/, hint: '8 digits, starting with 8 or 9', example: '+65 9123 4567' },
  },
  {
    name: 'Malaysia', code: 'MY', currency: 'MYR', dial: '60', timezone: 'Asia/Kuala_Lumpur', qr: 'DuitNow',
    zones: [{ zone: 'Asia/Kuala_Lumpur', label: 'Malaysia time (UTC+8)' }],
    tax: { name: 'SST', rate: 6 },
    taxPresets: [],
    phone: { placeholder: '112345678', pattern: /^1\d{8,9}$/, hint: '9–10 digits, starting with 1', example: '+60 12 345 6789' },
  },
  {
    name: 'Indonesia', code: 'ID', currency: 'IDR', dial: '62', timezone: 'Asia/Jakarta', qr: 'QRIS',
    zones: [
      { zone: 'Asia/Jakarta', label: 'WIB, Western Indonesia (UTC+7)' },
      { zone: 'Asia/Makassar', label: 'WITA, Central Indonesia (UTC+8)' },
      { zone: 'Asia/Jayapura', label: 'WIT, Eastern Indonesia (UTC+9)' },
    ],
    tax: { name: 'Tax', rate: 0 },
    taxPresets: [
      { label: 'No tax', rate: 0 },
      { label: 'PBJT 10%', rate: 10 },
      { label: 'PPN 11%', rate: 11 },
    ],
    phone: { placeholder: '81234567890', pattern: /^8[1-9]\d{7,10}$/, hint: '9–12 digits, starting with 8', example: '+62 812 3456 7890' },
  },
];

export function countryNamed(name) {
  return COUNTRIES.find((country) => country.name === name) || null;
}

// The country whose currency this is (SGD -> Singapore …), or null.
export function countryForCurrency(currency) {
  return COUNTRIES.find((country) => country.currency === currency) || null;
}

// A shop's country: its own, else the one its currency belongs to, else Singapore.
export function shopCountry(shop) {
  return countryNamed(shop?.country) || countryForCurrency(shop?.currency) || COUNTRIES[0];
}

// The name of a shop's payment QR in its country: PayNow, DuitNow or QRIS.
export function paymentQrName(shop) {
  return shopCountry(shop).qr;
}

// What a shop's tax is called at a rate: GST, SST, or in Indonesia PBJT (10%) or PPN (11%);
// "Tax" otherwise.
export function taxNameFor(shop, rate) {
  const country = shopCountry(shop);
  const n = Number(rate) || 0;
  if (n > 0 && country.tax.rate > 0) return country.tax.name;
  const preset = country.taxPresets.find((p) => p.rate === n && n > 0);
  return preset ? preset.label.split(' ')[0] : 'Tax';
}

// The phone or computer's time zone, when it's in one of Sellio's countries.
const ZONES = {
  'Asia/Singapore': 'Singapore',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Kuching': 'Malaysia',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Pontianak': 'Indonesia',
  'Asia/Makassar': 'Indonesia',
  'Asia/Jayapura': 'Indonesia',
};

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function deviceLanguages() {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return [...(nav?.languages || []), nav?.language].filter(Boolean);
}

// The country a visitor's phone or computer is set to, when it's one of Sellio's: its time zone
// first (a phone sets it from the network it's on), then its language (Bahasa Indonesia, which
// older Android reports as "in"). null when neither says. For a visitor with no shop: a shop's
// own country always comes first.
export function visitorCountry({ zone = deviceZone(), languages = deviceLanguages() } = {}) {
  if (ZONES[zone]) return ZONES[zone];
  if (languages.some((language) => /^(id|in)(-|_|$)/i.test(language))) return 'Indonesia';
  return null;
}
