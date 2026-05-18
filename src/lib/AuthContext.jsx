import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getSupabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError] = useState(null);

  useEffect(() => {
    // Auth is managed via AppUserContext + Supabase session
    setIsLoadingAuth(false);
  }, []);

  const logout = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    localStorage.removeItem('app_user');
    window.location.href = '/Auth';
  };

  const navigateToLogin = () => {
    window.location.href = '/Auth';
  };

  return (
    <AuthContext.Provider value={{
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      logout,
      navigateToLogin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};