import { loadExtraFonts } from './extraFonts';
import { N_ } from './appText';

export const STOREFRONT_TYPOGRAPHY_PERSONALITIES = [
  {
    value: 'Inter',
    label: N_('Clean & Modern'),
    fontName: 'Inter',
    description: N_('Crisp and versatile'),
    stack: 'Inter, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
  {
    value: 'Nunito',
    label: N_('Warm & Friendly'),
    fontName: 'Nunito',
    description: N_('Soft and approachable'),
    stack: 'Nunito, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
  {
    value: 'Georgia',
    label: N_('Elegant & Premium'),
    fontName: 'Georgia',
    description: N_('Refined and editorial'),
    stack: 'Georgia, "Noto Serif SC", "Songti SC", serif',
  },
  {
    value: 'Poppins',
    label: N_('Bold & Expressive'),
    fontName: 'Poppins',
    description: N_('Confident and energetic'),
    stack: 'Poppins, "Noto Sans SC", "Noto Sans", system-ui, sans-serif',
  },
];

export const STOREFRONT_TYPOGRAPHY_SCALES = [
  { value: 'compact', label: N_('Compact'), description: N_('More on screen'), multiplier: 0.92 },
  { value: 'balanced', label: N_('Balanced'), description: N_('Recommended'), multiplier: 1 },
  { value: 'large', label: N_('Large'), description: N_('Easier to read'), multiplier: 1.1 },
];

export function getStorefrontTypographyPersonality(value) {
  return STOREFRONT_TYPOGRAPHY_PERSONALITIES.find(option => option.value === value)
    || STOREFRONT_TYPOGRAPHY_PERSONALITIES[0];
}

export function getStorefrontFontStack(value) {
  loadExtraFonts(); // once per page; storefront fonts aren't loaded up front
  return getStorefrontTypographyPersonality(value).stack;
}

export function getStorefrontTypographyScale(value) {
  return STOREFRONT_TYPOGRAPHY_SCALES.find(option => option.value === value)?.multiplier || 1;
}
