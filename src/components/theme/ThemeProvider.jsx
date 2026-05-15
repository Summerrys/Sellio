import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/functions';
import { COLOR_SETS, generateThemeVariables } from './themeUtils';

const ThemeContext = createContext({});

export function ThemeProvider({ children, tenantId }) {
  const queryClient = useQueryClient();
  const [previewTheme, setPreviewTheme] = useState(null);

  // Fetch theme config via backend function (bypasses RLS)
  const { data: themeConfig } = useQuery({
    queryKey: ['themeConfig', tenantId],
    queryFn: async () => {
      const res = await invokeFunction('getThemeConfig', { tenant_id: tenantId });
      return res.data?.theme || null;
    },
    enabled: !!tenantId,
  });

  // Save theme mutation via backend function
  const saveThemeMutation = useMutation({
    mutationFn: async (colorSetName) => {
      const colorSet = COLOR_SETS.find(s => s.name === colorSetName);
      if (!colorSet) return;
      return invokeFunction('saveThemeConfig', {
        tenant_id: tenantId,
        color_set_name: colorSetName,
        primary_color: colorSet.dark,
        accent_color: colorSet.light,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themeConfig'] });
      setPreviewTheme(null);
    },
  });

  // Apply theme to DOM — use primary_color/accent_color directly from DB record
  useEffect(() => {
    if (previewTheme) {
      const colorSet = COLOR_SETS.find(s => s.name === previewTheme);
      if (colorSet) {
        const variables = generateThemeVariables(colorSet.dark, colorSet.light);
        Object.entries(variables).forEach(([key, value]) => {
          document.documentElement.style.setProperty(key, value);
        });
      }
      return;
    }
    if (themeConfig?.primary_color && themeConfig?.accent_color) {
      const variables = generateThemeVariables(themeConfig.primary_color, themeConfig.accent_color);
      Object.entries(variables).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
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