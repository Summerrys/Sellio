export const STOREFRONT_TYPOGRAPHY_PERSONALITIES = [
  {
    value: 'Inter',
    label: 'Clean & Modern',
    fontName: 'Inter',
    description: 'Crisp and versatile',
    stack: 'Inter, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
  {
    value: 'Nunito',
    label: 'Warm & Friendly',
    fontName: 'Nunito',
    description: 'Soft and approachable',
    stack: 'Nunito, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
  {
    value: 'Georgia',
    label: 'Elegant & Premium',
    fontName: 'Georgia',
    description: 'Refined and editorial',
    stack: 'Georgia, "Noto Serif SC", "Songti SC", serif',
  },
  {
    value: 'Poppins',
    label: 'Bold & Expressive',
    fontName: 'Poppins',
    description: 'Confident and energetic',
    stack: 'Poppins, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
];

export const STOREFRONT_TYPOGRAPHY_SCALES = [
  { value: 'compact', label: 'Compact', description: 'More on screen', multiplier: 0.92 },
  { value: 'balanced', label: 'Balanced', description: 'Recommended', multiplier: 1 },
  { value: 'large', label: 'Large', description: 'Easier to read', multiplier: 1.1 },
];

export function getStorefrontTypographyPersonality(value) {
  return STOREFRONT_TYPOGRAPHY_PERSONALITIES.find(option => option.value === value)
    || STOREFRONT_TYPOGRAPHY_PERSONALITIES[0];
}

export function getStorefrontFontStack(value) {
  return getStorefrontTypographyPersonality(value).stack;
}

export function getStorefrontTypographyScale(value) {
  return STOREFRONT_TYPOGRAPHY_SCALES.find(option => option.value === value)?.multiplier || 1;
}
