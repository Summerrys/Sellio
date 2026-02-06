// Color theme sets with light and dark anchor colors
export const COLOR_SETS = [
  // Core themes
  { name: 'Indigo', light: '#a8c8fb', dark: '#0941a2' },
  { name: 'Forest Green', light: '#6bd68a', dark: '#1a5119' },
  { name: 'Sky Blue', light: '#7ed0ff', dark: '#005585' },
  { name: 'Purple', light: '#d9bafc', dark: '#5628a4' },
  { name: 'Pink Magenta', light: '#ffade3', dark: '#8b0356' },
  { name: 'Orange Amber', light: '#ffb57d', dark: '#763301' },
  
  // Minimalist tones
  { name: 'Sage Mint', light: '#b8d4a8', dark: '#2d5016' },
  { name: 'Lavender Mist', light: '#d4c5e8', dark: '#4a3563' },
  { name: 'Soft Peach', light: '#ffd4b3', dark: '#8b4513' },
  { name: 'Dusty Blue', light: '#a8c5d9', dark: '#2c4a5e' },
  { name: 'Stone Gray', light: '#b8bdc9', dark: '#3d4451' },
  { name: 'Moss Green', light: '#a3c4a8', dark: '#3a5a40' },
  { name: 'Warm Taupe', light: '#d4c4b3', dark: '#6d5d4b' },
  { name: 'Slate Blue', light: '#b0c4de', dark: '#3f4f6b' },
  
  // Candy & Marshmallow tones
  { name: 'Bubblegum', light: '#ffb3e0', dark: '#c7016d' },
  { name: 'Lemon Drop', light: '#ffe680', dark: '#957000' },
  { name: 'Mint Candy', light: '#8effd1', dark: '#00a86b' },
  { name: 'Cotton Candy', light: '#dbc4ff', dark: '#6b5b95' },
  { name: 'Vanilla Cream', light: '#f5e6d3', dark: '#8b7355' },
  { name: 'Strawberry', light: '#ffccdb', dark: '#c41e3a' },
  { name: 'Pistachio', light: '#d4e8c1', dark: '#5a7247' },
  { name: 'Blueberry', light: '#c8d5f0', dark: '#4a5a8a' },
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
  const dark = hexToRgb(darkHex);
  
  if (!light || !dark) return {};

  const shades = {};
  
  // Generate shades 50-900
  const stops = [
    { key: '50', lightWeight: 0.95, darkWeight: 0.05 },
    { key: '100', lightWeight: 0.85, darkWeight: 0.15 },
    { key: '200', lightWeight: 0.7, darkWeight: 0.3 },
    { key: '300', lightWeight: 0.55, darkWeight: 0.45 },
    { key: '400', lightWeight: 0.4, darkWeight: 0.6 },
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
export function generateThemeVariables(darkHex, lightHex) {
  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);
  const shades = generateShades(lightHex, darkHex);

  return {
    '--color-primary': `${dark.r} ${dark.g} ${dark.b}`,
    '--color-primary-light': `${light.r} ${light.g} ${light.b}`,
    ...Object.entries(shades).reduce((acc, [key, value]) => {
      acc[`--color-primary-${key}`] = value;
      return acc;
    }, {}),
  };
}