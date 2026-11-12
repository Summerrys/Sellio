// Money on screen: S$5.50 in Singapore dollars, RM5.50 in ringgit (Alvin, 6 Nov 2026), and
// Rp38.000 in rupiah (Indonesia, 12 Nov 2026): no decimals and a dot between thousands, the way
// Indonesians write it. `currency` is the shop's tenants.currency code; no code means Singapore
// dollars.
const WHOLE_UNITS = new Set(['IDR']);

export function currencyPrefix(currency) {
  if (currency === 'MYR') return 'RM';
  if (currency === 'IDR') return 'Rp';
  if (!currency || currency === 'SGD') return 'S$';
  return `${currency} `;
}

// Decimal places a currency's amounts are shown and rounded to: none for rupiah, else 2.
export function currencyDecimals(currency) {
  return WHOLE_UNITS.has(currency) ? 0 : 2;
}

// An amount rounded to what the currency shows: whole rupiah, or cents.
export function roundMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** currencyDecimals(currency);
  return Math.round((n + Math.sign(n) * Number.EPSILON) * factor) / factor;
}

// 1234567 -> "1.234.567" (rupiah: a dot between thousands).
function rupiahDigits(whole) {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// formatMoney(1234.5, 'SGD') -> "S$1,234.50"; formatMoney(-5, 'MYR') -> "-RM5.00";
// formatMoney(38000, 'IDR') -> "Rp38.000".
export function formatMoney(amount, currency) {
  const n = Number(amount);
  if (amount == null || amount === '' || !Number.isFinite(n)) return '';
  if (WHOLE_UNITS.has(currency)) {
    const whole = Math.round(Math.abs(n));
    return `${n < 0 && whole > 0 ? '-' : ''}${currencyPrefix(currency)}${rupiahDigits(whole)}`;
  }
  const digits = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${currencyPrefix(currency)}${digits}`;
}
