// Default gradient fallback (blue-to-purple) — not a selectable palette
export const DEFAULT_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)';
export const DEFAULT_PRIMARY = '#3b82f6';
export const DEFAULT_ACCENT = '#9333ea';

// Color theme sets with light and dark anchor colors (no Default entry)
export const COLOR_SETS = [
  { name: 'Ocean Blue',    dark: '#0369A1', light: '#E0F2FE' },
  { name: 'Forest Green',  dark: '#15803D', light: '#DCFCE7' },
  { name: 'Sunset Orange', dark: '#EA580C', light: '#FFEDD5' },
  { name: 'Royal Purple',  dark: '#7E22CE', light: '#F3E8FF' },
  { name: 'Berry Red',     dark: '#DC2626', light: '#FEE2E2' },
  { name: 'Teal Breeze',   dark: '#0891B2', light: '#CFFAFE' },
  { name: 'Indigo Sky',    dark: '#4F46E5', light: '#E0E7FF' },
  { name: 'Rose Garden',   dark: '#BE185D', light: '#FFE4E6' },
];

// Convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

// Generate intermediate shades between light and dark
function generateShades(lightHex, darkHex) {
  const light = hexToRgb(lightHex);
  const dark  = hexToRgb(darkHex);
  if (!light || !dark) return {};

  const shades = {};
  const stops = [
    { key: '50',  lightWeight: 0.95, darkWeight: 0.05 },
    { key: '100', lightWeight: 0.85, darkWeight: 0.15 },
    { key: '200', lightWeight: 0.70, darkWeight: 0.30 },
    { key: '300', lightWeight: 0.55, darkWeight: 0.45 },
    { key: '400', lightWeight: 0.40, darkWeight: 0.60 },
    { key: '500', lightWeight: 0.25, darkWeight: 0.75 },
    { key: '600', lightWeight: 0.15, darkWeight: 0.85 },
    { key: '700', lightWeight: 0.08, darkWeight: 0.92 },
    { key: '800', lightWeight: 0.04, darkWeight: 0.96 },
    { key: '900', lightWeight: 0.01, darkWeight: 0.99 },
  ];

  stops.forEach(({ key, lightWeight, darkWeight }) => {
    const r = Math.round(light.r * lightWeight + dark.r * darkWeight);
    const g = Math.round(light.g * lightWeight + dark.g * darkWeight);
    const b = Math.round(light.b * lightWeight + dark.b * darkWeight);
    shades[key] = `${r} ${g} ${b}`;
  });

  return shades;
}

// Generate CSS variables for a theme
// isDefault → --color-primary-gradient = the blue-purple gradient string
// palette   → --color-primary-gradient = "none" (use solid dark color)
export function generateThemeVariables(darkHex, lightHex) {
  const isDefault = darkHex === DEFAULT_PRIMARY && lightHex === DEFAULT_ACCENT;
  const dark   = hexToRgb(darkHex);
  const light  = hexToRgb(lightHex);
  const shades = generateShades(lightHex, darkHex);

  return {
    '--color-primary':          `${dark.r} ${dark.g} ${dark.b}`,
    '--color-primary-light':    `${light.r} ${light.g} ${light.b}`,
    // Consumers: use var(--color-primary-gradient) for buttons/CTAs.
    // If it equals "none", fall back to rgb(var(--color-primary)).
    '--color-primary-gradient': isDefault ? DEFAULT_GRADIENT : `rgb(${dark.r} ${dark.g} ${dark.b})`,
    ...Object.entries(shades).reduce((acc, [key, value]) => {
      acc[`--color-primary-${key}`] = value;
      return acc;
    }, {}),
  };
}