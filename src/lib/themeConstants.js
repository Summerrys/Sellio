// Default theme colors - Blue to Purple gradient
export const DEFAULT_COLORS = {
  primary: '#3b82f6',
  secondary: '#9333ea',
  accent: '#c084fc',
};

// Get theme colors from formData or use defaults
export const getThemeColors = (formData) => {
  return {
    primary: formData?.customPrimary || DEFAULT_COLORS.primary,
    secondary: formData?.customSecondary || DEFAULT_COLORS.secondary,
    accent: DEFAULT_COLORS.accent,
  };
};

// Get CSS variable colors for pre-configured themes
export const getThemeCSSColors = (formData) => {
  if (formData?.theme) {
    return {
      primary: 'rgb(var(--color-primary))',
      secondary: 'rgb(var(--color-secondary))',
      accent: DEFAULT_COLORS.accent,
    };
  }
  return getThemeColors(formData);
};