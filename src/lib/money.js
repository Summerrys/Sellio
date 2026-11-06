// Money on screen: S$5.50 in Singapore dollars, RM5.50 in ringgit (Alvin, 6 Nov 2026).
// `currency` is the shop's tenants.currency code; no code means Singapore dollars.
export function currencyPrefix(currency) {
  if (currency === 'MYR') return 'RM';
  if (!currency || currency === 'SGD') return 'S$';
  return `${currency} `;
}

// formatMoney(1234.5, 'SGD') -> "S$1,234.50"; formatMoney(-5, 'MYR') -> "-RM5.00".
export function formatMoney(amount, currency) {
  const n = Number(amount);
  if (amount == null || amount === '' || !Number.isFinite(n)) return '';
  const digits = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${currencyPrefix(currency)}${digits}`;
}
