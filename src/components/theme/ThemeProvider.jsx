import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
        // SuperAdmin theme stored separately
        const configs = await base44.entities.ThemeConfig.filter({ tenant_id: 'superadmin' });
        return configs[0] || null;
      }
      const configs = await base44.entities.ThemeConfig.filter({ tenant_id: tenantId });
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
        return base44.entities.ThemeConfig.update(themeConfig.id, {
          color_set_name: colorSetName,
          primary_color: colorSet.dark,
          accent_color: colorSet.light,
        });
      } else {
        return base44.entities.ThemeConfig.create({
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
    const activeTheme = previewTheme || themeConfig?.color_set_name || 'Indigo';
    const colorSet = COLOR_SETS.find(s => s.name === activeTheme);
    if (!colorSet) return;

    const variables = generateThemeVariables(colorSet.dark, colorSet.light);
    const root = document.documentElement;

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