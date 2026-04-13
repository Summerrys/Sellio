import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { COLOR_SETS, generateThemeVariables } from './themeUtils';

const ThemeContext = createContext({});

export function ThemeProvider({ children, tenantId }) {
  const queryClient = useQueryClient();
  const [previewTheme, setPreviewTheme] = useState(null);

  // Fetch theme config from DB
  const { data: themeConfig } = useQuery({
    queryKey: ['themeConfig', tenantId],
    queryFn: async () => {
      if (tenantId === 'superadmin') {
        const configs = await db.entities.ThemeConfig.filter({ tenant_id: 'superadmin' });
        return configs[0] || null;
      }
      const configs = await db.entities.ThemeConfig.filter({ tenant_id: tenantId });
      return configs[0] || null;
    },
    enabled: !!tenantId,
  });

  // Save theme mutation
  const saveThemeMutation = useMutation({
    mutationFn: async (colorSetName) => {
      const colorSet = COLOR_SETS.find(s => s.name === colorSetName);
      if (!colorSet) return;

      if (themeConfig?.id) {
        return db.entities.ThemeConfig.update(themeConfig.id, {
          color_set_name: colorSetName,
          primary_color: colorSet.dark,
          accent_color: colorSet.light,
        });
      } else {
        return db.entities.ThemeConfig.create({
          tenant_id: tenantId,
          color_set_name: colorSetName,
          primary_color: colorSet.dark,
          accent_color: colorSet.light,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themeConfig'] });
      setPreviewTheme(null);
    },
  });

  // Apply theme to DOM
  useEffect(() => {
    let variables;
    const root = document.documentElement;

    // If we have custom colors from the theme config, use them
    if (themeConfig?.primary_color && themeConfig?.accent_color) {
      variables = generateThemeVariables(themeConfig.primary_color, themeConfig.accent_color);
    } else {
      // Otherwise fall back to preset color sets
      const activeTheme = previewTheme || themeConfig?.color_set_name || 'Indigo';
      const colorSet = COLOR_SETS.find(s => s.name === activeTheme);
      if (!colorSet) return;
      variables = generateThemeVariables(colorSet.dark, colorSet.light);
    }

    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [previewTheme, themeConfig]);

  const value = {
    currentTheme: themeConfig?.color_set_name || 'Indigo',
    setTheme: (colorSetName) => saveThemeMutation.mutate(colorSetName),
    previewTheme: (colorSetName) => setPreviewTheme(colorSetName),
    clearPreview: () => setPreviewTheme(null),
    isPreview: !!previewTheme,
    isSaving: saveThemeMutation.isPending,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}