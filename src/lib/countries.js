// Sellio's countries (Alvin, 12 Nov 2026: Indonesia joins Singapore and Malaysia). A shop's
// country (tenants.country, the name below) decides its currency, phone code, time zone and the
// name of its payment QR, so no screen has to name Singapore or Malaysia for everyone.
export const COUNTRIES = [
  { name: 'Singapore', code: 'SG', currency: 'SGD', dial: '65', timezone: 'Asia/Singapore', qr: 'PayNow' },
  { name: 'Malaysia', code: 'MY', currency: 'MYR', dial: '60', timezone: 'Asia/Kuala_Lumpur', qr: 'DuitNow' },
  { name: 'Indonesia', code: 'ID', currency: 'IDR', dial: '62', timezone: 'Asia/Jakarta', qr: 'QRIS' },
];

export function countryNamed(name) {
  return COUNTRIES.find((country) => country.name === name) || null;
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
