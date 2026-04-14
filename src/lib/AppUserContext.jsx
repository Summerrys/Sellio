import React, { createContext, useContext, useState, useEffect } from 'react';

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

export function AppUserProvider({ children }) {
  const [appUser, setAppUserState] = useState(() => cookieUtils.get());

  const setAppUser = (user) => {
    if (user) {
      cookieUtils.set(user);
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