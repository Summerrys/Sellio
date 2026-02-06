// Color theme sets with primary (dark) and light anchor colors
export const COLOR_SETS = [
  // Core themes
  { name: 'Indigo', light: '#0941a2', dark: '#a8c8fb' },
  { name: 'Forest Green', light: '#1a5119', dark: '#6bd68a' },
  { name: 'Sky Blue', light: '#005585', dark: '#7ed0ff' },
  { name: 'Purple', light: '#5628a4', dark: '#d9bafc' },
  { name: 'Pink Magenta', light: '#8b0356', dark: '#ffade3' },
  { name: 'Orange Amber', light: '#763301', dark: '#ffb57d' },
  
  // Minimalist tones
  { name: 'Sage Mint', light: '#2d5016', dark: '#b8d4a8' },
  { name: 'Lavender Mist', light: '#4a3563', dark: '#d4c5e8' },
  { name: 'Soft Peach', light: '#8b4513', dark: '#ffd4b3' },
  { name: 'Dusty Blue', light: '#2c4a5e', dark: '#a8c5d9' },
  { name: 'Stone Gray', light: '#3d4451', dark: '#b8bdc9' },
  { name: 'Moss Green', light: '#3a5a40', dark: '#a3c4a8' },
  { name: 'Warm Taupe', light: '#6d5d4b', dark: '#d4c4b3' },
  { name: 'Slate Blue', light: '#3f4f6b', dark: '#b0c4de' },
  
  // Candy & Marshmallow tones
  { name: 'Bubblegum', light: '#c7016d', dark: '#ffb3e0' },
  { name: 'Lemon Drop', light: '#957000', dark: '#ffe680' },
  { name: 'Mint Candy', light: '#00a86b', dark: '#8effd1' },
  { name: 'Cotton Candy', light: '#6b5b95', dark: '#dbc4ff' },
  { name: 'Vanilla Cream', light: '#8b7355', dark: '#f5e6d3' },
  { name: 'Strawberry', light: '#c41e3a', dark: '#ffccdb' },
  { name: 'Pistachio', light: '#5a7247', dark: '#d4e8c1' },
  { name: 'Blueberry', light: '#4a5a8a', dark: '#c8d5f0' },
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