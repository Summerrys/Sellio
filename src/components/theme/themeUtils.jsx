// Default gradient fallback (blue-to-purple) — not a selectable palette. Stores that
// haven't chosen a theme, and visitors who aren't signed in, see this.
export const DEFAULT_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)';
export const DEFAULT_PRIMARY = '#3b82f6';
export const DEFAULT_ACCENT = '#9333ea';
// A short-lived purple default (16 Oct 2026) was saved for stores that switched their
// theme off then; those rows mean "no theme" too.
const PURPLE_DEFAULT = { primary: '#8b2fc9', accent: '#f3e8ff' };

// The colours a saved theme_configs row stands for: its palette when one is named,
// its own colours when they were custom, otherwise the default.
export function resolveSavedTheme(row) {
  const named = row?.color_set_name && COLOR_SETS.find((s) => s.name === row.color_set_name);
  if (named) return { dark: named.dark, light: named.light };
  const primary = String(row?.primary_color || '').toLowerCase();
  const accent = String(row?.accent_color || '').toLowerCase();
  if (!primary || (primary === PURPLE_DEFAULT.primary && accent === PURPLE_DEFAULT.accent)) {
    return { dark: DEFAULT_PRIMARY, light: DEFAULT_ACCENT };
  }
  return { dark: row.primary_color, light: row.accent_color || DEFAULT_ACCENT };
}

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

// "H S% L%" for shadcn's hsl(var(--primary)) variables.
function hexToHslTriplet(hex) {
  const c = hexToRgb(hex);
  if (!c) return null;
  const r = c.r / 255; const g = c.g / 255; const b = c.b / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0; let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
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

  // For default theme, generate shades from blue → light blue
  // instead of blue → purple (which produces muddy/saturated tints)
  const shadeLight = isDefault ? '#EFF6FF' : lightHex;
  const shades = generateShades(shadeLight, darkHex);
  // Only a chosen theme recolours the standard buttons; without one they stay as before.
  const primaryHsl = isDefault ? '' : hexToHslTriplet(darkHex);

  return {
    '--color-primary':          `${dark.r} ${dark.g} ${dark.b}`,
    '--color-primary-light':    `${light.r} ${light.g} ${light.b}`,
    // Consumers: use var(--color-primary-gradient) for buttons/CTAs.
    // If it equals "none", fall back to rgb(var(--color-primary)).
    '--color-primary-gradient': isDefault ? DEFAULT_GRADIENT : `rgb(${dark.r} ${dark.g} ${dark.b})`,
    // shadcn components (Button, Switch, Checkbox, Progress…) read --primary, so a
    // chosen theme reaches every standard button. '' removes the override (no theme).
    '--primary': primaryHsl,
    '--primary-foreground': primaryHsl ? '0 0% 100%' : '',
    '--ring': primaryHsl,
    ...Object.entries(shades).reduce((acc, [key, value]) => {
      acc[`--color-primary-${key}`] = value;
      return acc;
    }, {}),
  };
}