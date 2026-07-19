import React, { useState, useEffect } from 'react';
import { Phone, Lock, User, Mail, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { getSupabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { useAppUser } from '@/lib/AppUserContext';
import AuthPricingModal from '@/components/auth/AuthPricingModal';
import AppLoader from '@/components/ui-custom/AppLoader';

const BYPASS_EMAILS = ['alvin.leeyq@gmail.com', 'alvin_y_q_lee@ite.edu.sg'];

const COUNTRY_CODES = [
  { code: '+65', flag: '🇸🇬', name: 'SG', placeholder: '91234567', validate: (p) => /^[89]\d{7}$/.test(p), hint: '8 digits, starting with 8 or 9' },
  { code: '+60', flag: '🇲🇾', name: 'MY', placeholder: '112345678', validate: (p) => /^1\d{8,9}$/.test(p), hint: '9–10 digits, starting with 1' },
];

const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getBaseUrl = () => {
  const host = window.location.hostname;
  if (host === 'localhost' || host.includes('base44.app') || host.includes('base44.com')) {
    return window.location.origin;
  }
  return 'https://sellio.apptelier.sg';
};

export default function Auth() {
  const { setAppUser } = useAppUser();
  // Read token from URL on mount
  const urlToken = new URLSearchParams(window.location.search).get('token');

  const [isLogin, setIsLogin] = useState(!urlToken); // default to signup tab if token present
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [googleGateError, setGoogleGateError] = useState('');
  const [googleSignupError, setGoogleSignupError] = useState('');

  // Auth check — true while we verify whether the user is already logged in
  const [authChecking, setAuthChecking] = useState(true);

  // Signup gate state
  const [signupMode, setSignupMode] = useState(null); // null | 'allowed' | 'pricing_wall' | 'invalid_token'
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  const [showPricingModal, setShowPricingModal] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=phone, 2=otp, 3=new password, 4=email sent
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotCountry, setForgotCountry] = useState(COUNTRY_CODES[0]);
  const [forgotStaffEmail, setForgotStaffEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotUserEmail, setForgotUserEmail] = useState('');
  const [forgotUserTenantId, setForgotUserTenantId] = useState('');
  const [forgotPlan, setForgotPlan] = useState('');
  const [forgotFullPhone, setForgotFullPhone] = useState('');
  const [showForgotCountryDropdown, setShowForgotCountryDropdown] = useState(false);

  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', password: '' });

  // On mount: check if user is already authenticated and has completed onboarding.
  // If so, redirect immediately — do NOT run invite-token validation at all.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = await getSupabase();
        // If this is a password recovery redirect, skip auto-redirect entirely
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('type') === 'recovery') {
          setAuthChecking(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: rows } = await supabase
            .from('app_users')
            .select('id, email, full_name, role, phone, onboarding_completed, tenant_id')
            .eq('email', session.user.email)
            .limit(1);
          const appUserRow = rows?.[0];
          if (appUserRow?.onboarding_completed === true && appUserRow?.tenant_id) {
            // Auto-restore session for ANY active tenant member — owner or staff —
            // as long as their Supabase session is still valid. Previously only
            // owners were auto-redirected here; staff were forced to log in with
            // phone+password every time the app was reopened, even with a fully
            // valid session underneath. Staying logged in until explicit logout
            // should apply to every role, not just owners.
            const { data: tuRows } = await supabase
              .from('tenant_users')
              .select('is_owner')
              .eq('tenant_id', appUserRow.tenant_id)
              .eq('user_email', session.user.email)
              .eq('status', 'active')
              .limit(1);
            const isActiveMember = !!tuRows?.[0];
            console.log('[Auth] session recovery for', session.user.email, '→ activeMember:', isActiveMember);
            if (isActiveMember) {
              setAppUser(appUserRow);
              window.location.href = '/Dashboard';
              return;
            }
          }
        }
      } catch {
        // silently fall through to normal auth flow
      }
      setAuthChecking(false);
    };
    checkAuth();
  }, []);

  // On mount: if token in URL, auto-evaluate signup access (pre-fills email too)
  useEffect(() => {
    if (authChecking) return; // wait until auth check completes
    if (urlToken) {
      evaluateSignupAccess();
    }
  }, [authChecking]);

  // When switching to signup tab, evaluate gate
  useEffect(() => {
    if (authChecking) return;
    if (isLogin) return; // login is always allowed — no check needed
    // Avoid double-run on mount when token is present (already called above)
    if (urlToken && signupMode !== null) return;
    evaluateSignupAccess();
  }, [isLogin, authChecking]);

  const evaluateSignupAccess = async () => {
    if (urlToken) {
      setCheckingToken(true);
      let invite = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!invite && attempts < maxAttempts) {
        attempts++;
        try {
          const supabase = await getSupabase();
          const { data, error: fetchError } = await supabase
            .from('merchant_invites')
            .select('email, phone, full_name, currency, expires_at, status')
            .eq('token', urlToken)
            .maybeSingle();

          console.log(`[invite lookup attempt ${attempts}]`, { data, fetchError });

          if (data && data.status === 'pending' && (!data.expires_at || new Date(data.expires_at) > new Date())) {
            invite = data;
          } else if (attempts < maxAttempts) {
            console.log(`Invite not found or not ready, retrying (${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch {
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (invite) {
        setInviteEmail(invite.email || '');
        setInviteName(invite.full_name || '');
        setFormData(prev => ({
          ...prev,
          email: invite.email || '',
          full_name: invite.full_name || '',
        }));
        // Phone pre-fill
        if (invite.phone) {
          let phoneNumber = invite.phone;
          let detectedCountry = COUNTRY_CODES[0];
          if (invite.phone.startsWith('+60')) {
            detectedCountry = COUNTRY_CODES.find(c => c.code === '+60');
            phoneNumber = invite.phone.replace('+60', '');
          } else if (invite.phone.startsWith('+65')) {
            detectedCountry = COUNTRY_CODES.find(c => c.code === '+65');
            phoneNumber = invite.phone.replace('+65', '');
          }
          setSelectedCountry(detectedCountry);
          setFormData(prev => ({ ...prev, phone: phoneNumber }));
        }
        setSignupMode('allowed');
      } else {
        setSignupMode('invalid_token');
      }
      setCheckingToken(false);
    } else {
      setSignupMode('pricing_wall');
    }
  };

  // Google OAuth callback
  useEffect(() => {
    const hash = window.location.hash;

    // Don't process hash as Google OAuth if this is a password recovery redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('type') === 'recovery') return;

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

        // Token gate: check if this is a brand-new Supabase auth user
        const createdAt = user.created_at ? new Date(user.created_at) : null;
        const isNewAuthUser = createdAt && (Date.now() - createdAt.getTime()) < 60 * 1000;
        const tokenInUrl = new URLSearchParams(window.location.search).get('token');
        const isBypass = BYPASS_EMAILS.includes((user.email || '').toLowerCase());

        if (isNewAuthUser && !tokenInUrl && !isBypass) {
          const unauthorizedEmail = user.email;
          await supabase.auth.signOut();
          await fetch('https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/deleteUnauthorizedUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: unauthorizedEmail }),
          });
          setGoogleLoading(false);
          window.history.replaceState(null, '', window.location.pathname);
          setGoogleGateError('true');
          return;
        }

        // Token-gated Google signup: verify the Google email matches the invite email
        if (isNewAuthUser && tokenInUrl && !isBypass) {
          const { data: invite } = await supabase
            .from('merchant_invites')
            .select('email')
            .eq('token', tokenInUrl)
            .eq('status', 'pending')
            .single();
          const inviteEmailForCheck = invite?.email?.toLowerCase();
          if (inviteEmailForCheck && user.email?.toLowerCase() !== inviteEmailForCheck) {
            await supabase.auth.signOut();
            await fetch('https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/deleteUnauthorizedUser', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email }),
            });
            setGoogleLoading(false);
            window.history.replaceState(null, '', `${window.location.pathname}?token=${tokenInUrl}`);
            setGoogleSignupError(`Please sign up with the email address used during payment (${invite.email})`);
            return;
          }
        }

        const { data: existingAppUser } = await supabase
          .from('app_users')
          .select('id, created_date, onboarding_completed, tenant_id, role, phone')
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

          // Sync phone from merchant_invites if available
          if (tokenInUrl) {
            const { data: inviteData } = await supabase
              .from('merchant_invites')
              .select('phone')
              .eq('token', tokenInUrl)
              .maybeSingle();

            if (inviteData?.phone) {
              await supabase
                .from('app_users')
                .update({ phone: inviteData.phone })
                .eq('email', user.email);
              console.log('✓ Phone synced from merchant_invites:', inviteData.phone);
            }
          }

          const { data: fetchedUser, error: fetchError } = await supabase
            .from('app_users')
            .select('id, created_date, onboarding_completed, tenant_id, role, phone')
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
          phone: existingRow?.phone || null,
          created_date: existingRow?.created_date || now,
          last_login_at: now,
        };
        setAppUser(appUser);

        // Mark merchant invite as registered
        if (tokenInUrl) {
          await supabase
            .from('merchant_invites')
            .update({ status: 'registered', updated_date: new Date().toISOString() })
            .eq('token', tokenInUrl)
            .eq('status', 'pending');
        }

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
    setGoogleGateError('');
    setGoogleLoading(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${getBaseUrl()}/Auth` },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err.message || 'Google Sign-In failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const handleForgotStart = async () => {
    if (!forgotPhone.trim()) return;
    setForgotLoading(true);
    try {
      const supabase = await getSupabase();
      const cleanPhone = forgotPhone.replace(/^0+/, '');
      const fullPhone = forgotCountry.code + cleanPhone;
      setForgotFullPhone(fullPhone);

      const { data: rows } = await supabase
        .from('app_users')
        .select('id, email, tenant_id')
        .eq('phone', fullPhone)
        .limit(1);

      const appUserRow = rows?.[0];
      if (!appUserRow) {
        toast.error('No account found for this phone number.');
        setForgotLoading(false);
        return;
      }

      setForgotUserEmail(appUserRow.email || '');
      setForgotUserTenantId(appUserRow.tenant_id || '');

      if (appUserRow.tenant_id) {
        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('tier')
          .eq('tenant_id', appUserRow.tenant_id)
          .limit(1);
        setForgotPlan(subRows?.[0]?.tier || 'starter');
      }

      const isRealEmail = appUserRow.email && !appUserRow.email.endsWith('@sellio.app');

      if (isRealEmail) {
        // FIX: previously awaited resetPasswordForEmail before advancing the UI, so the
        // user sat on a loading spinner for however long that network round-trip took.
        // The call itself doesn't return anything the UI needs (Supabase's reset-email
        // response is generic either way), so show the confirmation screen immediately
        // and let the actual send happen in the background.
        setForgotStep(4);
        supabase.auth.resetPasswordForEmail(appUserRow.email, {
          redirectTo: `${getBaseUrl()}/Auth?type=recovery`,
        }).catch(err => console.warn('resetPasswordForEmail warning:', err.message));
      } else {
        // No real email on file yet — collect one before we can send a reset link
        setForgotStep(2);
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotCollectEmail = async () => {
    const email = forgotStaffEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    // FIX: this used to await the full round trip — the updateStaffEmailForReset edge
    // function (several sequential Admin API calls, ~6s observed) plus a second
    // resetPasswordForEmail call — before showing anything, so the button just sat on
    // "Sending..." the whole time. Show the confirmation screen right away instead and
    // do the actual work in the background; if it turns out the email's already taken
    // (the one real failure case here), quietly roll back to this screen with a toast
    // explaining why, rather than blocking everyone's happy path on that lookup.
    setForgotStep(4);
    (async () => {
      try {
        const supabase = await getSupabase();
        const res = await fetch('https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/updateStaffEmailForReset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: forgotFullPhone, newEmail: email }),
        });
        const result = await res.json();
        if (!res.ok || result.error) throw new Error(result.error || 'Failed to update email');

        // Fire-and-forget — same as the other branch, nothing in the UI depends on this
        // call's own completion.
        supabase.auth.resetPasswordForEmail(result.email, {
          redirectTo: `${getBaseUrl()}/Auth?type=recovery`,
        }).catch(err => console.warn('resetPasswordForEmail warning:', err.message));
      } catch (err) {
        toast.error(err.message || 'Something went wrong. Please try again.');
        setForgotStep(2); // roll back so they can fix the email and retry
      }
    })();
  };

  const handleForgotSetPassword = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      // Reached here via the Supabase recovery email link — a session already exists.
      // This applies to both owners and staff now, since staff also go through the
      // same resetPasswordForEmail flow after providing a valid email.
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password: forgotNewPassword });
      if (error) throw error;
      const newHash = await hashPassword(forgotNewPassword);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        await supabase.from('app_users').update({ password_hash: newHash }).eq('email', session.user.email);
      }
      await supabase.auth.signOut();

      toast.success('Password updated successfully!');
      setTimeout(() => { window.location.href = `${getBaseUrl()}/Auth`; }, 800);
    } catch (err) {
      toast.error(err.message || 'Failed to update password.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleSignupError('');
    setGoogleLoading(true);
    try {
      const supabase = await getSupabase();
      const redirectTo = urlToken
        ? `${getBaseUrl()}/Auth?token=${urlToken}`
        : `${getBaseUrl()}/Auth`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          ...(inviteEmail ? { queryParams: { login_hint: inviteEmail } } : {}),
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err.message || 'Google Sign-Up failed. Please try again.');
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
          .select('id, email, full_name, role, onboarding_completed, tenant_id, password_hash, phone')
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

        // If tenant_id is missing from app_users, look it up from tenant_users
        let tenantId = appUserRow.tenant_id;
        if (!tenantId) {
          const { data: tuRows } = await supabase
            .from('tenant_users')
            .select('tenant_id')
            .eq('user_email', appUserRow.email)
            .eq('status', 'active')
            .limit(1);
          tenantId = tuRows?.[0]?.tenant_id || null;
        }

        const userForCookie = { ...appUserRow, tenant_id: tenantId };
        setAppUser(userForCookie);
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
          .select('id, email, full_name, role, onboarding_completed, tenant_id, phone')
          .eq('phone', fullPhone)
          .limit(1);

        const appUserRow = rows?.[0];
        setAppUser(appUserRow || { email: authEmail, full_name: formData.full_name, role: 'admin', onboarding_completed: false });

        // Mark merchant invite as registered
        if (urlToken) {
          await supabase
            .from('merchant_invites')
            .update({ status: 'registered', updated_date: new Date().toISOString() })
            .eq('token', urlToken)
            .eq('status', 'pending');
        }

        showSuccess('Account created!');
        setTimeout(() => { window.location.href = createPageUrl('Onboarding'); }, 500);
      }
    } catch (error) {
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') === 'recovery') {
      setForgotMode(true);
      setForgotStep(3);
    }
  }, []);

  // Determine if we should show the pricing wall (signup tab, no token, not bypass)
  const showPricingWall = !isLogin && signupMode === 'pricing_wall';
  const showInvalidToken = !isLogin && signupMode === 'invalid_token';
  // Show the form if: login tab, OR (signup tab AND allowed), OR (signup tab AND bypass email typed)
  const showForm = isLogin || signupMode === 'allowed' || (signupMode === 'pricing_wall' && BYPASS_EMAILS.includes(formData.email.trim().toLowerCase()));

  if (authChecking) {
    return <AppLoader visible={true} />;
  }

  return (
    <>
      <style>{`
        .orange-scroll::-webkit-scrollbar { width: 4px; }
        .orange-scroll::-webkit-scrollbar-track { background: transparent; }
        .orange-scroll::-webkit-scrollbar-thumb { background: #fe7824; border-radius: 4px; }
      `}</style>
      <div
        className="h-[100dvh] w-full flex flex-col items-center justify-center p-4 overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}
        onClick={() => setShowCountryDropdown(false)}
      >
        {/* Auth card — always visible */}
        <div className="w-full max-w-sm sm:max-w-md max-h-full overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {forgotMode ? (
              <div>
                {/* Back button + title */}
                <div className="flex items-center gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(false); setForgotStep(1); setForgotPhone(''); setForgotStaffEmail(''); setForgotNewPassword(''); setForgotConfirmPassword(''); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors border-none cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                  </button>
                  <div>
                    <p className="text-base font-semibold text-slate-800">
                      {forgotStep === 1 && 'Reset Password'}
                      {forgotStep === 2 && 'Confirm Your Email'}
                      {forgotStep === 3 && 'New Password'}
                      {forgotStep === 4 && 'Check Your Email'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {forgotStep === 1 && 'Enter your registered phone number'}
                      {forgotStep === 2 && 'We need a valid email to send your reset link'}
                      {forgotStep === 3 && 'Choose a new password'}
                      {forgotStep === 4 && 'Reset link sent'}
                    </p>
                  </div>
                </div>

                {/* Step 1 — Phone entry */}
                {forgotStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                      <div className="flex gap-2">
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setShowForgotCountryDropdown(!showForgotCountryDropdown)}
                            className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            <span>{forgotCountry.flag}</span>
                            <span className="text-slate-700">{forgotCountry.code}</span>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                          </button>
                          {showForgotCountryDropdown && (
                            <div className="orange-scroll absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto min-w-[130px]">
                              {COUNTRY_CODES.map((c) => (
                                <button
                                  key={c.code}
                                  type="button"
                                  onClick={() => { setForgotCountry(c); setShowForgotCountryDropdown(false); }}
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
                            placeholder={forgotCountry.placeholder}
                            value={forgotPhone}
                            onChange={(e) => setForgotPhone(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForgotStart}
                      disabled={forgotLoading || !forgotPhone.trim()}
                      className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
                      style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                    >
                      {forgotLoading ? 'Please wait...' : 'Continue'}
                    </button>
                  </div>
                )}

                {/* Step 2 — Collect a real email for accounts still on the placeholder address */}
                {forgotStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">We don't have a valid email on file for this account yet. Enter one below to receive your password reset link.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          placeholder="you@example.com"
                          value={forgotStaffEmail}
                          onChange={(e) => setForgotStaffEmail(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForgotCollectEmail}
                      disabled={forgotLoading || !forgotStaffEmail.trim()}
                      className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
                      style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                    >
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </div>
                )}

                {/* Step 3 — New password */}
                {forgotStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          placeholder="Min. 6 characters"
                          value={forgotNewPassword}
                          onChange={(e) => setForgotNewPassword(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          placeholder="Re-enter password"
                          value={forgotConfirmPassword}
                          onChange={(e) => setForgotConfirmPassword(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForgotSetPassword}
                      disabled={forgotLoading || !forgotNewPassword || !forgotConfirmPassword}
                      className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70"
                      style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                    >
                      {forgotLoading ? 'Saving...' : 'Set New Password'}
                    </button>
                  </div>
                )}

                {/* Step 4 — Email sent confirmation */}
                {forgotStep === 4 && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center py-4 gap-3">
                      <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                        <Check className="w-7 h-7 text-green-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 text-center">Reset link sent!</p>
                      <p className="text-xs text-slate-500 text-center leading-relaxed">
                        Check your email inbox and click the reset link. It may take a minute to arrive.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Need further help?</p>
                      <a
                        href="mailto:hello@apptelier.sg"
                        className="flex items-center gap-2 text-xs text-slate-600 hover:text-orange-500 transition-colors mb-2"
                      >
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        hello@apptelier.sg
                      </a>
                      {forgotPlan === 'pro' && (
                        <a
                          href={`https://wa.me/6565805411?text=Hi%2C%20I%20need%20help%20resetting%20my%20Sellio%20password.%20My%20registered%20phone%20is%3A%20${encodeURIComponent(forgotFullPhone)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-medium text-green-700 hover:text-green-800 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.564 4.14 1.548 5.874L0 24l6.336-1.524A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.214-3.732.898.934-3.617-.235-.372A9.818 9.818 0 1112 21.818z"/></svg>
                          WhatsApp Priority Support
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(false); setForgotStep(1); }}
                      className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                      Back to Login
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <>
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
                  onClick={() => { setSignupMode('pricing_wall'); setShowPricingModal(true); }}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                >
                  View Plans
                </button>
              </div>
            )}

            {/* Token checking — matches the bouncing-dots style used everywhere else */}
            {checkingToken && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <style>{`
                  @keyframes sellio-bounce-inline { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
                  .sellio-dot-inline-1 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 0ms; background: #fb923c; }
                  .sellio-dot-inline-2 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 200ms; background: #e0449a; }
                  .sellio-dot-inline-3 { animation: sellio-bounce-inline 1.2s ease-in-out infinite 400ms; background: #8b2fc9; }
                `}</style>
                <div style={{ display: 'flex', gap: 7 }}>
                  <span className="sellio-dot-inline-1" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                  <span className="sellio-dot-inline-2" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                  <span className="sellio-dot-inline-3" style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                </div>
                <p className="text-sm text-slate-500">Verifying your payment...</p>
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
                        readOnly={signupMode === 'allowed' && !!inviteName}
                        required
                        className={`w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 ${signupMode === 'allowed' && !!inviteName ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    {signupMode === 'allowed' && !!inviteName && (
                      <p className="text-xs text-slate-400 mt-1">Name pre-filled from your registration.</p>
                    )}
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

                {isLogin && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotStep(1); }}
                      className="text-xs text-orange-500 hover:text-orange-600 font-medium bg-transparent border-none cursor-pointer p-0"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

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

            {/* Google signup option — shown on signup tab when token is valid */}
            {!isLogin && signupMode === 'allowed' && !checkingToken && (
              <>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">or sign up with</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignUp}
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
                  {googleLoading ? 'Redirecting...' : 'Sign up with Google'}
                </button>
                {googleSignupError && (
                  <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{googleSignupError}</p>
                  </div>
                )}
              </>
            )}

            {/* Pricing wall teaser in card */}
            {showPricingWall && !checkingToken && (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500 mb-4">
                  Choose a plan below to start your free trial and get your registration link.
                </p>
                <button
                  onClick={() => setShowPricingModal(true)}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' }}
                >
                  View Plans ↓
                </button>
              </div>
            )}

            {/* Divider + Google — login tab always, signup tab only when no token (pricing wall) */}
            {!checkingToken && (isLogin || showPricingWall) && (
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

                {googleGateError && (
                  <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Account creation requires a valid plan.{' '}
                      <span onClick={() => setShowPricingModal(true)} style={{ fontWeight: 600, color: '#d97706', textDecoration: 'underline', cursor: 'pointer' }}>Get started here.</span>
                    </p>
                  </div>
                )}
              </>
            )}
            </>
            )}
          </div>
        </div>

      </div>

      {showPricingModal && <AuthPricingModal onClose={() => setShowPricingModal(false)} />}
    </>
  );
}