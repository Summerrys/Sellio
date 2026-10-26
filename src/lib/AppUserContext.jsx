import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { generateThemeVariables, resolveSavedTheme } from '@/components/theme/themeUtils';

// The app's own record of who is signed in on this device. It lasts 400 days (the longest
// browsers allow) and is renewed each time the app opens while the person is still
// signed in to Supabase, so people stay signed in until they sign out.
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

// Session helpers — cookies only
export const cookieUtils = {
  set: (user) => {
    const val = JSON.stringify(user);
    document.cookie = `app_session=${encodeURIComponent(val)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
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

const PROFILE_FIELDS = 'id, email, full_name, role, onboarding_completed, tenant_id, phone';

// Keeps the record above in step with the Supabase session (which lasts until sign-out):
//   renew   — same person still signed in: keep the record and push its expiry out again
//   restore — signed in but the record is missing or belongs to someone else: rebuild it
//   clear   — Supabase says nobody is signed in on this device: drop the record
//   keep    — couldn't check (offline, error): change nothing
export async function syncAppUserWithSession(supabase, current) {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { action: 'keep' };
  const email = data?.session?.user?.email?.toLowerCase();
  if (!email) return current ? { action: 'clear' } : { action: 'keep' };
  if (current && String(current.email || '').toLowerCase() === email) return { action: 'renew', user: current };

  // Row-level security only returns the signed-in person's own profile.
  const { data: rows, error: profileError } = await supabase.from('app_users').select(PROFILE_FIELDS).limit(1);
  const row = rows?.[0];
  if (profileError || !row || String(row.email || '').toLowerCase() !== email) return { action: 'keep' };
  let tenantId = row.tenant_id;
  if (!tenantId) {
    const { data: memberships } = await supabase.from('tenant_users')
      .select('tenant_id').eq('user_email', row.email).eq('status', 'active').limit(1);
    tenantId = memberships?.[0]?.tenant_id || null;
  }
  return { action: 'restore', user: { ...row, tenant_id: tenantId } };
}

async function loadAndApplyTheme(tenantId) {
  if (!tenantId) return;
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('theme_configs')
    .select('color_set_name, primary_color, accent_color')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { dark, light } = resolveSavedTheme(data);
  const variables = generateThemeVariables(dark, light);
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

  // Each time the app opens: stay signed in for as long as Supabase's session lasts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const result = await syncAppUserWithSession(supabase, cookieUtils.get());
        if (cancelled) return;
        if (result.action === 'renew') {
          cookieUtils.set(result.user);
        } else if (result.action === 'restore') {
          cookieUtils.set(result.user);
          setAppUserState(result.user);
          if (result.user.tenant_id) loadAndApplyTheme(result.user.tenant_id);
        } else if (result.action === 'clear') {
          cookieUtils.clear();
          setAppUserState(null);
        }
      } catch { /* keep things as they are; the next app open tries again */ }
    })();
    return () => { cancelled = true; };
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