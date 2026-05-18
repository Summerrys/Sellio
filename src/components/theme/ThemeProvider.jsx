import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { COLOR_SETS, DEFAULT_PRIMARY, DEFAULT_ACCENT, generateThemeVariables } from './themeUtils';

const ThemeContext = createContext({});

export function ThemeProvider({ children, tenantId }) {
  const queryClient = useQueryClient();
  const [previewTheme, setPreviewTheme] = useState(null);

  // Fetch theme config directly from Supabase
  const { data: themeConfig } = useQuery({
    queryKey: ['themeConfig', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('theme_configs')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!tenantId,
  });

  // Resolve a colorSet by name (falls back to DEFAULT_PALETTE)
  const resolveColorSet = (colorSetName) =>
    COLOR_SETS.find(s => s.name === colorSetName) || { dark: DEFAULT_PRIMARY, light: DEFAULT_ACCENT };

  // Apply a colorSet to the DOM immediately
  const applyColorSet = (colorSet) => {
    const variables = generateThemeVariables(colorSet.dark, colorSet.light);
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  };

  // Save theme mutation directly to Supabase
  const saveThemeMutation = useMutation({
    mutationFn: async (colorSetName) => {
      const colorSet = resolveColorSet(colorSetName);
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('theme_configs')
        .upsert({
          tenant_id: tenantId,
          color_set_name: colorSetName || null,
          primary_color: colorSet.dark,
          accent_color: colorSet.light,
        }, { onConflict: 'tenant_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themeConfig'] });
      setPreviewTheme(null);
    },
  });

  // Apply theme to DOM
  useEffect(() => {
    if (previewTheme) {
      applyColorSet(resolveColorSet(previewTheme));
      return;
    }
    // Use saved theme if available, otherwise apply default gradient colors
    const dark = themeConfig?.primary_color || DEFAULT_PRIMARY;
    const light = themeConfig?.accent_color || DEFAULT_ACCENT;
    applyColorSet({ dark, light });
  }, [previewTheme, themeConfig]);

  const value = {
    currentTheme: themeConfig?.color_set_name || null,
    // Immediately save + apply — no separate Apply button needed
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