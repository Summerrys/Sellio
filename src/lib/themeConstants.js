// Default theme colors - Orange tones matching Auth page
export const DEFAULT_COLORS = {
  primary: '#e86a1a',
  secondary: '#fe7824',
  accent: '#ffaa6e',
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