import React, { useState, useEffect, useRef } from 'react';
import { Phone, Lock, User, Mail, ChevronDown, Check } from 'lucide-react';
import { getSupabase } from '../lib/supabaseClient';
import { toast, Toaster } from 'sonner';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';

const COUNTRY_CODES = [
  { code: '+65', flag: '🇸🇬', name: 'SG', placeholder: '91234567', validate: (p) => /^[89]\d{7}$/.test(p), hint: '8 digits, starting with 8 or 9' },
  { code: '+60', flag: '🇲🇾', name: 'MY', placeholder: '112345678', validate: (p) => /^1\d{8,9}$/.test(p), hint: '9–10 digits, starting with 1' },
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  const googleClientIdRef = useRef(null);
  const nonceRef = useRef(null);

  // Load Google Identity Services and fetch client ID
  useEffect(() => {
    const loadGoogleConfig = async () => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);

      try {
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || window.GOOGLE_CLIENT_ID;
        if (!clientId) {
          // Fallback: fetch from function
          const res = await base44.functions.invoke('getSupabaseConfig', {});
          const id = res.data?.googleClientId || res?.googleClientId;
          if (id) {
            googleClientIdRef.current = id;
            setGoogleReady(true);
          } else {
            console.error('No Google Client ID found');
          }
        } else {
          googleClientIdRef.current = clientId;
          setGoogleReady(true);
        }
      } catch (err) {
        console.error('Failed to load Google config:', err);
        // Try hardcoded value as last resort
        const hardcodedId = '390618701573-0n3emgl2e2v8redsf2d5dl28fikknl1h.apps.googleusercontent.com';
        if (hardcodedId) {
          googleClientIdRef.current = hardcodedId;
          setGoogleReady(true);
        }
      }
    };

    loadGoogleConfig();

    return () => {
      try {
        const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (script) document.body.removeChild(script);
      } catch (e) {
        // Script already removed
      }
    };
  }, []);

  const handleGoogleSignIn = async () => {
    if (!googleClientIdRef.current) {
      toast.error('Google Sign-In is not configured. Please contact support.');
      return;
    }

    setGoogleLoading(true);

    // Wait for google script to load if not ready yet
    let attempts = 0;
    while (!window.google && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.google) {
      toast.error('Google Sign-In failed to load. Please try again.');
      setGoogleLoading(false);
      return;
    }

    try {
      // Generate nonce for security
      const nonce = Math.random().toString(36).substring(2);
      nonceRef.current = nonce;
      
      // Initialize Google Sign-In with nonce
      window.google.accounts.id.initialize({
        client_id: googleClientIdRef.current,
        callback: handleCredentialResponse,
        nonce: nonce,
      });

      // Try to show One Tap UI
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback to click-to-sign-in button
          showGoogleSignInButton();
        }
      });
    } catch (err) {
      console.error('Google Sign-In error:', err);
      toast.error('Google Sign-In failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const showGoogleSignInButton = () => {
    const container = document.querySelector('[data-google-button]');
    if (container && window.google) {
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        width: '100%',
      });
    }
  };

  const handleCredentialResponse = async (response) => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
        nonce: nonceRef.current,
      });

      if (error) throw error;
      const user = data.session.user;

      // Check if this email is already registered as a phone/password user
      const { data: phoneUser } = await supabase
        .from('app_users')
        .select('id, auth_provider')
        .eq('email', user.email)
        .neq('auth_provider', 'google')
        .limit(1);
      
      if (phoneUser && phoneUser.length > 0) {
        toast.error('This email is already registered with a phone/password account. Please log in using your phone number.');
        setGoogleLoading(false);
        return;
      }

      const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '').replace('T', ' ').substring(0, 23);
      
      // Upsert into app_users to track Google users and last login
      const { data: existingAppUser } = await supabase
        .from('app_users')
        .select('id, created_at')
        .eq('email', user.email)
        .limit(1);
      
      if (existingAppUser && existingAppUser.length > 0) {
        await supabase.from('app_users').update({ last_login_at: now }).eq('id', existingAppUser[0].id);
      } else {
        await supabase.from('app_users').insert({
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          auth_provider: 'google',
          role: 'admin',
          is_active: true,
          onboarding_completed: false,
          last_login_at: now,
        });
      }

      const appUser = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        avatar_url: user.user_metadata?.avatar_url,
        provider: 'google',
        onboarding_completed: false,
        last_login_at: now,
      };
      
      const { data: existing } = await supabase.from('tenant_users').select('*').eq('email', user.email).single();
      if (existing) {
        appUser.onboarding_completed = true;
        appUser.role = existing.role;
        appUser.tenant_id = existing.tenant_id;
      }
      
      localStorage.setItem('app_user', JSON.stringify(appUser));
      window.location.href = appUser.onboarding_completed ? '/Dashboard' : '/Onboarding';
    } catch (err) {
      console.error('Auth error:', err);
      toast.error(err.message || 'Sign-in failed');
      setGoogleLoading(false);
    }
  };

  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = formData.phone.replace(/^0+/, '');
    if (!selectedCountry.validate(cleanPhone)) {
      toast.error(`Invalid phone number for ${selectedCountry.name}. Expected: ${selectedCountry.hint}`);
      return;
    }
    setLoading(true);
    try {
      const fullPhone = selectedCountry.code + formData.phone.replace(/^0+/, '');
      
      const payload = isLogin
        ? { action: 'login', phone: fullPhone, password: formData.password }
        : { action: 'signup', phone: fullPhone, password: formData.password, full_name: formData.full_name, email: formData.email };

      const response = await base44.functions.invoke('authProxy', payload);
      const data = response.data;
      console.log('Auth response:', data);

      if (data && data.success) {
        localStorage.setItem('app_user', JSON.stringify(data.user));
        toast.custom((t) => (
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-900">{isLogin ? 'Welcome back!' : 'Account created!'}</p>
              <p className="text-xs text-green-700">You're all set. Redirecting now...</p>
            </div>
          </div>
        ));
        setTimeout(() => {
          window.location.href = createPageUrl(data.user?.onboarding_completed ? 'Dashboard' : 'Onboarding');
        }, 500);
      } else if (data && data.error) {
        toast.error(data.error);
      } else if (data && data.message) {
        toast.error(data.message);
      } else {
       toast.error('Login failed. Please check your credentials.');
      }
      } catch (error) {
      console.error('Auth error:', error);
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'An unexpected error occurred';
      console.error('Error details:', error?.response?.data);
      toast.error(errorMsg);
      } finally {
      setLoading(false);
      }
      };

  return (
    <>
      <style>{`
        .orange-scroll::-webkit-scrollbar { width: 4px; }
        .orange-scroll::-webkit-scrollbar-track { background: transparent; }
        .orange-scroll::-webkit-scrollbar-thumb { background: #fe7824; border-radius: 4px; }
      `}</style>
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}
        onClick={() => setShowCountryDropdown(false)}
      >
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center mb-3">
                <img src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png" alt="Sellio" className="h-28 w-auto object-contain" />
              </div>
              <p className="text-xl font-semibold text-slate-800 mb-0.5">Welcome!</p>
              <p className="text-sm text-slate-500">Let's get you started</p>
            </div>

            {/* Tab Toggle */}
            <div className="flex rounded-xl p-1 mb-6" style={{ background: '#fde8d8' }}>
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  !isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name - Sign Up only */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </div>
                </div>
              )}

              {/* Email - Sign Up only */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </div>
                </div>
              )}

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                <div className="flex gap-2">
                  {/* Country code picker */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                      className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <span>{selectedCountry.flag}</span>
                      <span className="text-slate-700">{selectedCountry.code}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                    {showCountryDropdown && (
                      <div className="orange-scroll absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto min-w-[130px]">
                        {COUNTRY_CODES.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => { setSelectedCountry(c); setShowCountryDropdown(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left"
                          >
                            <span>{c.flag}</span>
                            <span className="text-slate-600">{c.name}</span>
                            <span className="text-slate-400 ml-auto">{c.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Phone input */}
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      placeholder={selectedCountry.placeholder}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
                style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
              >
                {loading ? 'Please wait...' : isLogin ? 'Login' : 'Sign Up'}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">or continue with</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || !googleReady}
              className="w-full flex items-center justify-center gap-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {googleLoading ? 'Redirecting...' : googleReady ? 'Sign in with Google' : 'Loading...'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}