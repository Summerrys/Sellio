import React, { useState, useEffect, useRef } from 'react';
import { Phone, Lock, User, Mail, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { getSupabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { useAppUser } from '@/lib/AppUserContext';

const BYPASS_EMAILS = ['alvin.leeyq@gmail.com', 'alvin_y_q_lee@ite.edu.sg'];

const COUNTRY_CODES = [
  { code: '+65', flag: '🇸🇬', name: 'SG', placeholder: '91234567', validate: (p) => /^[89]\d{7}$/.test(p), hint: '8 digits, starting with 8 or 9' },
  { code: '+60', flag: '🇲🇾', name: 'MY', placeholder: '112345678', validate: (p) => /^1\d{8,9}$/.test(p), hint: '9–10 digits, starting with 1' },
];

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 79,
    yearly: 790,
    description: 'Perfect for small businesses just getting started',
    features: ['10 products', 'Up to 100 orders/month', '3 staff accounts', '5 tables & QR codes', '1 branch', 'Basic reports'],
    links: {
      monthly: 'https://buy.stripe.com/00wdRbdyV1kn8qfebK7bW02',
      yearly: 'https://buy.stripe.com/fZu5kF1Qd8MP0XN3x67bW03',
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 139,
    yearly: 1390,
    description: 'For growing businesses with higher demands',
    badge: 'Most Popular',
    features: ['50 products', 'Up to 1,000 orders/month', '5 staff accounts', 'Up to 3 branches', 'Advanced reports', 'Custom editable roles'],
    links: {
      monthly: 'https://buy.stripe.com/6oUaEZ52pbZ135V7Nm7bW04',
      yearly: 'https://buy.stripe.com/8x23cxcuR9QTgWL7Nm7bW05',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 199,
    yearly: 1990,
    description: 'Enterprise-grade solution for maximum scalability',
    features: ['Unlimited products', 'Unlimited orders', 'Unlimited staff', 'Up to 10 branches', 'Custom reports', 'Unlimited roles'],
    links: {
      monthly: 'https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06',
      yearly: 'https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07',
    },
  },
];

const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Pricing wall shown when no token and not in bypass list
function SignupPricingWall({ pricingRef }) {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-12 flex flex-col items-center" ref={pricingRef}>
      <img src="https://assets.apptelier.sg/sellio/Logo_Sellio.png" alt="Sellio" className="h-16 w-auto object-contain mb-8" />

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-2">
        Choose a plan to get started
      </h1>
      <p className="text-slate-500 text-center max-w-md mb-6 text-sm leading-relaxed">
        Start your 3-day free trial. No charge until trial ends.
      </p>

      {/* Toggle */}
      <div className="flex items-center gap-3 mb-10">
        <span className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(v => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-slate-800' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
        <span className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-400'}`}>Annual</span>
        {annual && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">2 months free</span>}
      </div>

      {/* Cards */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isGrowth = plan.key === 'growth';
          const price = annual ? plan.yearly : plan.monthly;
          const saving = plan.monthly * 12 - plan.yearly;
          const link = annual ? plan.links.yearly : plan.links.monthly;

          return (
            <div
              key={plan.key}
              className={`relative bg-white rounded-2xl flex flex-col ${isGrowth ? 'shadow-xl ring-2 ring-purple-400 ring-offset-2' : 'shadow-sm border border-slate-200'}`}
            >
              {isGrowth && (
                <div className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-purple-500 to-indigo-500" />
              )}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-bold text-slate-900">{plan.name}</h2>
                  {plan.badge && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{plan.badge}</span>
                  )}
                </div>
                <div className="mt-3 mb-1">
                  <span className="text-3xl font-extrabold text-slate-900">SGD {price}</span>
                  <span className="text-sm text-slate-400 ml-1">/{annual ? 'year' : 'month'}</span>
                </div>
                {annual && <p className="text-xs text-green-600 font-medium mb-2">Save SGD {saving}</p>}
                <p className="text-xs text-slate-500 mb-5">{plan.description}</p>
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={link} target="_blank" rel="noopener noreferrer" className="block">
                  <button
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors text-white"
                    style={isGrowth
                      ? { background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }
                      : { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }
                    }
                  >
                    Start Free Trial
                  </button>
                </a>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-slate-400 text-center max-w-sm">
        After completing payment, check your email for your registration link.
      </p>
    </div>
  );
}

export default function Auth() {
  const { setAppUser } = useAppUser();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);

  // Signup gate state
  const [signupMode, setSignupMode] = useState(null); // null | 'allowed' | 'pricing_wall' | 'invalid_token'
  const [inviteEmail, setInviteEmail] = useState('');

  const pricingRef = useRef(null);

  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', password: '' });

  // Read token from URL on mount
  const urlToken = new URLSearchParams(window.location.search).get('token');

  // When switching to signup tab, evaluate gate
  useEffect(() => {
    if (isLogin) return; // login is always allowed — no check needed
    evaluateSignupAccess();
  }, [isLogin]);

  const evaluateSignupAccess = async () => {
    // Bypass: if the email field already has a bypass email, allow freely
    // But at this point we don't know the email yet — check token/URL
    if (urlToken) {
      setCheckingToken(true);
      try {
        const supabase = await getSupabase();
        const { data: invite } = await supabase
          .from('merchant_invites')
          .select('*')
          .eq('token', urlToken)
          .eq('status', 'pending')
          .single();

        if (invite && invite.expires_at && new Date(invite.expires_at) > new Date()) {
          setInviteEmail(invite.email || '');
          setFormData(prev => ({ ...prev, email: invite.email || '' }));
          setSignupMode('allowed');
        } else {
          setSignupMode('invalid_token');
        }
      } catch {
        setSignupMode('invalid_token');
      } finally {
        setCheckingToken(false);
      }
    } else {
      // No token — show pricing wall (bypass emails are checked at submit time)
      setSignupMode('pricing_wall');
    }
  };

  // Google OAuth callback
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      toast.error(params.get('error_description') || 'Google Sign-In failed');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (!hash.includes('access_token')) return;

    setGoogleLoading(true);
    const processSession = async () => {
      try {
        const supabase = await getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) throw error || new Error('No session found');

        const user = session.user;
        const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '').replace('T', ' ').substring(0, 23);

        const { data: existingAppUser } = await supabase
          .from('app_users')
          .select('id, created_date, onboarding_completed, tenant_id, role')
          .eq('email', user.email)
          .limit(1);

        let existingRow = existingAppUser?.[0] || null;
        let appUsersRowId = existingRow?.id;

        if (existingRow) {
          await supabase.from('app_users').update({ last_login_at: now }).eq('id', appUsersRowId);
        } else {
          const { error: insertError } = await supabase.from('app_users').insert({
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
            auth_provider: 'google',
            role: 'admin',
            is_active: true,
            onboarding_completed: false,
            last_login_at: now,
          });
          if (insertError) throw insertError;
          const { data: fetchedUser, error: fetchError } = await supabase
            .from('app_users')
            .select('id, created_date, onboarding_completed, tenant_id, role')
            .eq('email', user.email)
            .single();
          if (fetchError) throw fetchError;
          existingRow = fetchedUser;
          appUsersRowId = fetchedUser?.id;
        }

        if (!appUsersRowId) throw new Error('Failed to create or find user record.');

        const appUser = {
          id: appUsersRowId,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
          avatar_url: user.user_metadata?.avatar_url,
          provider: 'google',
          role: existingRow?.role || 'admin',
          onboarding_completed: existingRow?.onboarding_completed || false,
          tenant_id: existingRow?.tenant_id || null,
          created_date: existingRow?.created_date || now,
          last_login_at: now,
        };
        setAppUser(appUser);
        window.location.href = appUser.onboarding_completed ? '/Dashboard' : '/Onboarding';
      } catch (err) {
        toast.error(err.message || 'Google Sign-In failed');
        setGoogleLoading(false);
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    processSession();
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://sellio.apptelier.sg/Auth' },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err.message || 'Google Sign-In failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const showSuccess = (message) => {
    toast.custom(() => (
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-lg">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-900">{message}</p>
          <p className="text-xs text-green-700">You're all set. Redirecting now...</p>
        </div>
      </div>
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = await getSupabase();
      const cleanPhone = formData.phone.replace(/^0+/, '');
      const fullPhone = selectedCountry.code + cleanPhone;

      if (isLogin) {
        const { data: rows, error: lookupError } = await supabase
          .from('app_users')
          .select('id, email, full_name, role, onboarding_completed, tenant_id, password_hash')
          .eq('phone', fullPhone)
          .limit(1);

        if (lookupError) throw lookupError;
        const appUserRow = rows?.[0];
        if (!appUserRow) throw new Error('No account found for this phone number. Please sign up first.');

        const passwordHash = await hashPassword(formData.password);
        if (appUserRow.password_hash && passwordHash !== appUserRow.password_hash) {
          throw new Error('Invalid phone number or password');
        }

        const { error } = await supabase.auth.signInWithPassword({ email: appUserRow.email, password: formData.password });
        if (error) throw error;

        setAppUser(appUserRow);
        showSuccess('Welcome back!');
        setTimeout(() => {
          window.location.href = createPageUrl(appUserRow.onboarding_completed ? 'Dashboard' : 'Onboarding');
        }, 500);

      } else {
        // SIGNUP: check bypass list
        const emailToUse = formData.email.trim();
        const isBypass = BYPASS_EMAILS.includes(emailToUse.toLowerCase());

        if (!isBypass && signupMode !== 'allowed') {
          toast.error('Please purchase a plan to register.');
          setLoading(false);
          return;
        }

        if (!selectedCountry.validate(cleanPhone)) {
          toast.error(`Invalid phone number for ${selectedCountry.name}. Expected: ${selectedCountry.hint}`);
          setLoading(false);
          return;
        }

        const authEmail = emailToUse || `${fullPhone.replace('+', '')}@sellio.app`;

        const { error: signUpError } = await supabase.auth.signUp({ email: authEmail, password: formData.password });
        if (signUpError) throw signUpError;

        const passwordHash = await hashPassword(formData.password);
        const { error: insertError } = await supabase.from('app_users').insert({
          email: authEmail,
          full_name: formData.full_name,
          phone: fullPhone,
          password_hash: passwordHash,
          auth_provider: 'phone',
          onboarding_completed: false,
          is_active: true,
          role: 'admin',
        });
        if (insertError) throw insertError;

        const { data: rows } = await supabase
          .from('app_users')
          .select('id, email, full_name, role, onboarding_completed, tenant_id')
          .eq('phone', fullPhone)
          .limit(1);

        const appUserRow = rows?.[0];
        setAppUser(appUserRow || { email: authEmail, full_name: formData.full_name, role: 'admin', onboarding_completed: false });

        showSuccess('Account created!');
        setTimeout(() => { window.location.href = createPageUrl('Onboarding'); }, 500);
      }
    } catch (error) {
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Determine if we should show the pricing wall (signup tab, no token, not bypass)
  const showPricingWall = !isLogin && signupMode === 'pricing_wall';
  const showInvalidToken = !isLogin && signupMode === 'invalid_token';
  // Show the form if: login tab, OR (signup tab AND allowed), OR (signup tab AND bypass email typed)
  const showForm = isLogin || signupMode === 'allowed' || (signupMode === 'pricing_wall' && BYPASS_EMAILS.includes(formData.email.trim().toLowerCase()));

  return (
    <>
      <style>{`
        .orange-scroll::-webkit-scrollbar { width: 4px; }
        .orange-scroll::-webkit-scrollbar-track { background: transparent; }
        .orange-scroll::-webkit-scrollbar-thumb { background: #fe7824; border-radius: 4px; }
      `}</style>
      <div
        className="min-h-screen flex flex-col items-center justify-start p-4 pt-8"
        style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}
        onClick={() => setShowCountryDropdown(false)}
      >
        {/* Auth card — always visible */}
        <div className="w-full max-w-sm mb-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center mb-3">
                <img src="https://assets.apptelier.sg/sellio/Logo_Sellio.png" alt="Sellio" className="h-28 w-auto object-contain" />
              </div>
              <p className="text-xl font-semibold text-slate-800 mb-0.5">Welcome!</p>
              <p className="text-sm text-slate-500">Let's get you started</p>
            </div>

            {/* Tab Toggle */}
            <div className="flex rounded-xl p-1 mb-6" style={{ background: '#fde8d8' }}>
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Sign Up
              </button>
            </div>

            {/* Invalid token message */}
            {showInvalidToken && (
              <div className="mb-4">
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    This invite link is invalid or has expired. Please purchase a plan to get started.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSignupMode('pricing_wall');
                    setTimeout(() => pricingRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                  }}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                >
                  View Plans
                </button>
              </div>
            )}

            {/* Token checking spinner */}
            {checkingToken && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Main form — shown for login always, or signup when allowed */}
            {showForm && !checkingToken && (
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <div className="flex gap-2">
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

                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Email {signupMode === 'allowed' && inviteEmail ? '' : <span className="text-slate-400 font-normal">(optional)</span>}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        readOnly={signupMode === 'allowed' && !!inviteEmail}
                        className={`w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 ${signupMode === 'allowed' && inviteEmail ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    {signupMode === 'allowed' && inviteEmail && (
                      <p className="text-xs text-slate-400 mt-1">Email pre-filled from your invite.</p>
                    )}
                  </div>
                )}

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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
                  style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                >
                  {loading ? 'Please wait...' : isLogin ? 'Login' : 'Sign Up'}
                </button>
              </form>
            )}

            {/* Pricing wall teaser in card */}
            {showPricingWall && !checkingToken && (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500 mb-4">
                  Choose a plan below to start your free trial and get your registration link.
                </p>
                <button
                  onClick={() => pricingRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                >
                  View Plans ↓
                </button>
              </div>
            )}

            {/* Divider + Google — always shown */}
            {!checkingToken && (
              <>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">or continue with</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
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
                  {googleLoading ? 'Redirecting...' : 'Sign in with Google'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pricing wall — shown below the card when no token */}
        {showPricingWall && <SignupPricingWall pricingRef={pricingRef} />}
      </div>
    </>
  );
}