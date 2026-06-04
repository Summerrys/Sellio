import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { generateThemeVariables } from '@/components/theme/themeUtils';

// Session helpers — cookies only
export const cookieUtils = {
  set: (user) => {
    const val = JSON.stringify(user);
    document.cookie = `app_session=${encodeURIComponent(val)}; path=/; max-age=604800; SameSite=Lax`;
  },
  get: () => {
    const match = document.cookie.match(/(?:^|;\s*)app_session=([^;]+)/);
    if (match) {
      try { const parsed = JSON.parse(decodeURIComponent(match[1])); if (parsed?.id) return parsed; } catch {}
    }
    return null;
  },
  clear: () => {
    document.cookie = 'app_session=; path=/; max-age=0';
  },
};

const AppUserContext = createContext(null);

async function loadAndApplyTheme(tenantId) {
  if (!tenantId) return;
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('theme_configs')
    .select('primary_color, accent_color')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const primary = data?.primary_color || '#3b82f6';
  const accent = data?.accent_color || '#9333ea';

  const variables = generateThemeVariables(primary, accent);
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function AppUserProvider({ children }) {
  const [appUser, setAppUserState] = useState(() => cookieUtils.get());

  // Apply theme on initial load if user is already in session
  useEffect(() => {
    const user = cookieUtils.get();
    if (user?.tenant_id) {
      loadAndApplyTheme(user.tenant_id);
    }
  }, []);

  const setAppUser = (user) => {
    if (user) {
      cookieUtils.set(user);
      if (user.tenant_id) {
        loadAndApplyTheme(user.tenant_id);
      }
    } else {
      cookieUtils.clear();
    }
    setAppUserState(user);
  };

  const updateAppUser = (updates) => {
    const updated = { ...appUser, ...updates };
    cookieUtils.set(updated);
    setAppUserState(updated);
  };

  const clearAppUser = () => {
    cookieUtils.clear();
    // Also clear any legacy localStorage keys that may persist old sessions
    localStorage.removeItem('app_user');
    localStorage.removeItem('app_session');
    setAppUserState(null);
  };

  return (
    <AppUserContext.Provider value={{ appUser, setAppUser, updateAppUser, clearAppUser }}>
      {children}
    </AppUserContext.Provider>
  );
}

export function useAppUser() {
  return useContext(AppUserContext);
}

export default AppUserContext;