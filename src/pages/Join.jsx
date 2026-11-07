import React, { useEffect, useRef, useState } from 'react';
import { Mail, User, Phone, Lock, ChevronDown, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { isNativeApp } from '@/lib/nativeApp';
import { useBackToClose } from '@/lib/useBackToClose';
import { getSupabase } from '@/lib/supabaseClient';
import { useAppUser } from '@/lib/AppUserContext';
import { completeAuthNavigation } from '@/lib/authNavigation';
import { noteSignInWelcome } from '@/lib/signInWelcome';
import { googleSignInAvailable, startGoogleSignIn } from '@/lib/googleSignIn';
import { clearMobileAuth, isNativeAndroid } from '@/lib/mobileOAuth';
import AppLoader from '@/components/ui-custom/AppLoader';
import GoogleBrowserHint from '@/components/auth/GoogleBrowserHint';
import ClosedAccount from '@/components/auth/ClosedAccount';
import { callClosedAccount, closedAccountMessage } from '@/lib/closedAccount';
import {
  PHONE_COUNTRIES, JOIN_LINK_TYPES, accountErrorMessage, appBaseUrl, emailResendWait, fullPhone, isClosedLoginError,
  isEmail, isExpiredLinkError, isStaffLoginEmail, nextStepFor, readEmailLink,
} from '@/lib/accountFlow';

const LOGO_URL = '/branding/sellio-logo.webp';
const BUTTON_STYLE = { background: 'linear-gradient(to bottom, #ffaa6e, #fe7824, #e86a1a)' };
const INPUT_CLASS = 'w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400';
const RESEND_SECONDS = 60;
// Each new verification email replaces the one before, and Gmail groups them (same sender and
// subject) into one conversation, so an older link is easy to tap by mistake (Alvin's test,
// 6 Nov 2026).
const LINK_GONE = 'This link no longer works: it has expired, or a newer verification email replaced it. Open the newest email from Sellio, or send a new one below.';

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function Notice({ tone = 'amber', children }) {
  const styles = tone === 'red'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-amber-50 border-amber-200 text-amber-800';
  return (
    <div className={`flex items-start gap-2 p-3 border rounded-xl mb-4 ${styles}`} role="alert">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
}

// Create a Sellio account: verify the email (a link in a "verify your email" email) or use
// Google, then name, phone and password. Afterwards the account page lets them open a free
// shop or choose a business plan (Alvin, 5 Nov 2026: "verify my email", not a magic link).
// An email that already has an account is signed in by the same link. One whose account is
// closed (its deletion is pending) gets the closed-account screen instead: Keep my account
// (open again and carry on) or Start again (deleted, then sign up afresh).
export default function Join() {
  const { setAppUser } = useAppUser();
  const [stage, setStage] = useState('loading'); // loading | start | sent | finish | staff | closed
  // Phone / browser Back from "check your email" returns to the email form, like
  // "Use a different email".
  useBackToClose(stage === 'sent', () => { setStage('start'); setNotice(''); });
  const [closedAccount, setClosedAccount] = useState(null); // { proof, closed, email }
  const leaveClosedAccount = () => { setClosedAccount(null); setStage('start'); };
  useBackToClose(stage === 'closed', leaveClosedAccount);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [accountEmail, setAccountEmail] = useState('');
  const [country, setCountry] = useState(PHONE_COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const supabase = await getSupabase();
        const link = readEmailLink(window.location.search, window.location.hash);
        if (link.error) {
          window.history.replaceState(window.history.state, '', window.location.pathname);
          if (link.errorCode === 'user_banned') {
            // A link that went through Supabase first (older emails) to a closed account:
            // Supabase only says the login is locked. A new link opens the closed screen.
            setNotice('This account is closed. To keep it, or to delete it and start again, send a new verification email and open its link.');
          } else {
            setNotice(link.errorCode === 'otp_expired' || /expired|invalid/i.test(link.errorDescription || '')
              ? LINK_GONE
              : (link.errorDescription || 'That verification link didn’t work. Send a new verification email.'));
          }
          setStage('start');
          return;
        }
        if (link.tokenHash) {
          let type = JOIN_LINK_TYPES.includes(link.type) ? link.type : 'magiclink';
          let { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type });
          // A sign-in link marked as a sign-up one or the other way round (an email template
          // with the other file pasted in): 'email' takes either kind.
          if (isExpiredLinkError(error) && type !== 'email') {
            const retry = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: 'email' });
            if (!isExpiredLinkError(retry.error)) {
              error = retry.error;
              type = 'email';
            }
          }
          window.history.replaceState(window.history.state, '', window.location.pathname);
          // A closed account: Supabase refused the link without using it up, so the same link
          // proves who it is to the closed-account screen.
          if (isClosedLoginError(error)) {
            await openClosedAccount({ emailTokenHash: link.tokenHash, emailLinkType: type });
            return;
          }
          if (error) {
            setNotice(/Failed to fetch|NetworkError|Load failed/i.test(String(error.message || ''))
              ? accountErrorMessage(error)
              : LINK_GONE);
            setStage('start');
            return;
          }
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setStage('start');
          return;
        }
        // Just signed in by the email's link (not just already signed in): welcome them back.
        await continueSignedIn(supabase, { welcome: Boolean(link.tokenHash) });
      } catch (err) {
        setNotice(accountErrorMessage(err));
        setStage('start');
      }
    })();
  }, []);

  const openClosedAccount = async (proof) => {
    const reply = await callClosedAccount({ action: 'status', ...proof });
    if (reply?.ok && reply.closed) {
      const accountEmail = typeof reply.email === 'string' ? reply.email : '';
      if (accountEmail) setEmail(accountEmail);
      setClosedAccount({ proof, closed: reply.closed, email: accountEmail });
      setStage('closed');
      return;
    }
    // 'invalid' is phone sign-in's answer, from a closed-account server older than email links:
    // for a link it means the link didn't work.
    const refusal = reply?.code === 'invalid' ? { code: 'link_invalid' } : reply;
    setNotice(reply ? closedAccountMessage(refusal) : 'Can’t reach Sellio. Check your connection and try again.');
    setStage('start');
  };

  // Keep my account is done: the account is open again, and the same link (Supabase didn't use
  // it up while the account was closed) now signs them in.
  const continueAfterRestore = async () => {
    const proof = closedAccount?.proof;
    setClosedAccount(null);
    setStage('loading');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.verifyOtp({ token_hash: proof?.emailTokenHash, type: proof?.emailLinkType || 'magiclink' });
      if (error) {
        setNotice('Your account is open again. Send a new verification email to sign in.');
        setStage('start');
        return;
      }
      await continueSignedIn(supabase, { welcome: true });
    } catch (err) {
      setNotice(accountErrorMessage(err));
      setStage('start');
    }
  };

  // Start again is done: the same email signs up afresh (a new account, then a new shop).
  const signUpAgain = () => {
    const address = closedAccount?.email || '';
    setClosedAccount(null);
    setNotice('');
    setStage('start');
    if (address) sendLink(null, address);
  };

  const rememberProfile = async (supabase, userEmail) => {
    const { data: rows } = await supabase
      .from('app_users')
      .select('id, email, full_name, role, onboarding_completed, tenant_id, phone')
      .eq('email', userEmail)
      .limit(1);
    if (rows?.[0]) setAppUser(rows[0]);
  };

  // Signed in (link, Google or password): send them where they belong. welcome: they've just
  // signed in to an existing account, so the page this opens says "Welcome back!"
  // (components/auth/SignInWelcome.jsx; a message here would go with this page).
  const continueSignedIn = async (supabase, { welcome = false } = {}) => {
    const { data: status, error } = await supabase.rpc('my_account_status');
    if (error) throw error;
    const next = nextStepFor(status);
    setAccountEmail(status.email);
    if (next === 'dashboard') {
      await rememberProfile(supabase, status.email);
      if (welcome) noteSignInWelcome('Welcome back!');
      completeAuthNavigation('/Dashboard');
      return;
    }
    if (next === 'account') {
      // Not a new account that's here for its business invite: that one isn't back.
      if (welcome && status.setup_done) noteSignInWelcome('Welcome back!');
      completeAuthNavigation('/Account');
      return;
    }
    if (next === 'staff') {
      setStage('staff');
      return;
    }
    // Finishing the account needs a session that proved the email (link or Google).
    if (!status.email_proven) {
      setEmail(status.email);
      setNotice('To finish your account, verify your email: we’ll send you a verification email.');
      setStage('start');
      return;
    }
    const profile = status.profile || {};
    const match = PHONE_COUNTRIES.find((c) => profile.phone?.startsWith(c.code));
    if (match) setCountry(match);
    setForm((f) => ({
      ...f,
      full_name: profile.full_name && profile.full_name !== status.email ? profile.full_name : f.full_name,
      phone: match ? profile.phone.slice(match.code.length) : f.phone,
    }));
    setStage('finish');
  };

  const sendLink = async (e, to) => {
    e?.preventDefault();
    const address = (typeof to === 'string' ? to : email).trim().toLowerCase();
    if (!isEmail(address)) { toast.error('Please enter a valid email address.'); return; }
    if (isStaffLoginEmail(address)) { toast.error('That’s a staff login. Staff sign in with their phone number on the login page.'); return; }
    setSending(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${appBaseUrl(window.location)}/Join`, shouldCreateUser: true },
      });
      if (error) throw error;
      setEmail(address);
      setNotice('');
      setCooldown(RESEND_SECONDS);
      setStage('sent');
    } catch (err) {
      // This address was emailed less than a minute ago, and that email's link is the one that
      // works: say so and count down, rather than an error that invites more tries.
      const wait = emailResendWait(err);
      if (wait !== null) {
        setEmail(address);
        setNotice('No new email was sent: one went to this address less than a minute ago. Open the newest email from Sellio.');
        setCooldown(Math.max(1, wait));
        setStage('sent');
        return;
      }
      toast.error(accountErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!googleLoading || !isNativeAndroid()) return;
    let wasHidden = document.visibilityState === 'hidden';
    const resume = () => {
      if (document.visibilityState === 'hidden') wasHidden = true;
      else if (wasHidden) setGoogleLoading(false);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [googleLoading]);

  const continueWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      // Preserve the existing free-account onboarding after the Google return.
      const started = await startGoogleSignIn({
        redirectTo: `${appBaseUrl(window.location)}/Auth?join=1`,
      });
      if (started?.cancelled) setGoogleLoading(false); // Google's picker closed in the app
    } catch (err) {
      toast.error(accountErrorMessage(err));
      setGoogleLoading(false);
    }
  };

  const finishAccount = async (e) => {
    e.preventDefault();
    const name = form.full_name.trim();
    const phone = fullPhone(country, form.phone);
    if (!name) { toast.error('Please enter your name.'); return; }
    if (!phone) { toast.error(`Please enter a valid ${country.name} mobile number (${country.hint}).`); return; }
    if (form.password.length < 6) { toast.error('Please choose a password of at least 6 characters.'); return; }
    if (form.password !== form.confirm) { toast.error('The passwords don’t match.'); return; }
    setSaving(true);
    try {
      const supabase = await getSupabase();
      // Setting the password also signs out every other session of this account.
      const { error: passwordError } = await supabase.auth.updateUser({ password: form.password });
      if (passwordError && passwordError.code !== 'same_password') throw passwordError;
      const { error } = await supabase.rpc('complete_account_setup', { p_full_name: name, p_phone: phone });
      if (error) throw error;
      await rememberProfile(supabase, accountEmail);
      completeAuthNavigation('/Account');
    } catch (err) {
      toast.error(accountErrorMessage(err));
      setSaving(false);
    }
  };

  const signOut = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: 'local' }); // this device only
    window.location.replace('/Auth');
  };

  if (stage === 'loading') return <AppLoader visible={true} />;

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at top left, #faeee6 0%, #fdf6f2 30%, #ffffff 60%, #fdf4f0 100%)' }}
      onClick={() => setShowCountries(false)}
    >
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            {/* In the app the logo opens Explore without reloading the app (websites keep
                the home link). */}
            {isNativeApp() ? (
              <Link to="/explore" className="inline-flex items-center justify-center mb-3" aria-label="Sellio home">
                <img src={LOGO_URL} alt="Sellio" className="h-20 w-auto object-contain" />
              </Link>
            ) : (
              <a href="/" className="inline-flex items-center justify-center mb-3" aria-label="Sellio home">
                <img src={LOGO_URL} alt="Sellio" className="h-20 w-auto object-contain" />
              </a>
            )}
            {stage === 'start' && (<>
              <h1 className="text-xl font-semibold text-slate-800 mb-1">Create your Sellio account</h1>
              <p className="text-sm text-slate-500">Free to start. Sell from home, or run your business on Sellio.</p>
            </>)}
            {stage === 'sent' && (<>
              <h1 className="text-xl font-semibold text-slate-800 mb-1">Check your email</h1>
              <p className="text-sm text-slate-500">We sent a verification email to <span className="font-medium text-slate-700 break-all">{email}</span>.</p>
            </>)}
            {stage === 'finish' && (<>
              <h1 className="text-xl font-semibold text-slate-800 mb-1">Set up your account</h1>
              <p className="text-sm text-slate-500 break-all">{accountEmail}</p>
            </>)}
            {stage === 'staff' && (<>
              <h1 className="text-xl font-semibold text-slate-800 mb-1">This is a staff login</h1>
              <p className="text-sm text-slate-500">Staff logins belong to a store. Ask the store owner if you can’t get in.</p>
            </>)}
          </div>

          {stage === 'closed' && closedAccount && (
            <ClosedAccount
              proof={closedAccount.proof}
              closed={closedAccount.closed}
              email={closedAccount.email}
              onBack={leaveClosedAccount}
              onStartOver={signUpAgain}
              onRestored={continueAfterRestore}
            />
          )}

          {notice && stage !== 'closed' && <Notice>{notice}</Notice>}

          {stage === 'start' && (
            <>
              <form onSubmit={sendLink} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="join-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input id="join-email" type="email" autoComplete="email" placeholder="you@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} aria-describedby="join-email-hint" />
                  </div>
                  <p id="join-email-hint" className="mt-1.5 text-xs text-slate-400">We’ll email you a link to verify it’s yours.</p>
                </div>
                <button type="submit" disabled={sending || !email.trim()}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70" style={BUTTON_STYLE}>
                  {sending ? 'Sending…' : 'Send verification email'}
                </button>
              </form>
              {googleSignInAvailable() && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400 font-medium">or</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <button type="button" onClick={continueWithGoogle} disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70">
                    {googleLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <GoogleIcon />}
                    {googleLoading ? 'Redirecting…' : 'Continue with Google'}
                  </button>
                  <GoogleBrowserHint />
                </>
              )}
              {googleLoading && isNativeAndroid() && (
                <button type="button" className="w-full min-h-11 mt-2 text-sm text-orange-700 underline"
                  onClick={() => { clearMobileAuth(window.localStorage); setGoogleLoading(false); }}>
                  Cancel Google sign-in
                </button>
              )}
              <p className="mt-5 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <a href="/Auth" className="font-semibold text-orange-500 hover:text-orange-600">Log in</a>
              </p>
            </>
          )}

          {stage === 'sent' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                  <Check className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-xs text-slate-500 text-center leading-relaxed">
                  Tap <span className="font-semibold text-slate-700">Verify my email</span> in the newest email from Sellio, on this device, to continue.
                  It can take a minute to arrive; check your spam folder too.
                </p>
              </div>
              <button type="button" onClick={sendLink} disabled={sending || cooldown > 0}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60">
                {cooldown > 0 ? `Resend in ${cooldown}s` : (sending ? 'Sending…' : 'Resend verification email')}
              </button>
              <button type="button" onClick={() => { setStage('start'); setNotice(''); }}
                className="w-full text-xs text-orange-500 hover:text-orange-600 font-medium bg-transparent border-none cursor-pointer">
                Use a different email
              </button>
            </div>
          )}

          {stage === 'finish' && (
            <form onSubmit={finishAccount} className="space-y-4" noValidate>
              <div>
                <label htmlFor="join-name" className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="join-name" type="text" autoComplete="name" placeholder="Jane Tan" maxLength={80} value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={INPUT_CLASS} />
                </div>
              </div>
              <div>
                <label htmlFor="join-phone" className="block text-sm font-medium text-slate-700 mb-1">Mobile number</label>
                <div className="flex gap-2">
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => setShowCountries(!showCountries)} aria-label="Country code"
                      className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:bg-slate-50 transition-colors whitespace-nowrap">
                      <span>{country.flag}</span>
                      <span className="text-slate-700">{country.code}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                    {showCountries && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[130px]">
                        {PHONE_COUNTRIES.map((c) => (
                          <button key={c.code} type="button" onClick={() => { setCountry(c); setShowCountries(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left">
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
                    <input id="join-phone" type="tel" autoComplete="tel-national" placeholder={country.placeholder} value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT_CLASS} />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="join-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="join-password" type="password" autoComplete="new-password" placeholder="At least 6 characters" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} className={INPUT_CLASS} />
                </div>
              </div>
              <div>
                <label htmlFor="join-confirm" className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="join-confirm" type="password" autoComplete="new-password" placeholder="Type it again" value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={INPUT_CLASS} />
                </div>
              </div>
              <p className="text-xs text-slate-400">You’ll log in with this mobile number and password.</p>
              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-70" style={BUTTON_STYLE}>
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </form>
          )}

          {stage === 'staff' && (
            <button type="button" onClick={signOut}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              Sign out
            </button>
          )}

          {stage !== 'closed' && <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            By continuing, you agree to Sellio’s<br />
            <a href="/terms" className="font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2">Terms and Conditions</a>
            {' '}and{' '}
            <a href="/privacy" className="font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2">Privacy Policy</a>.
          </p>}
        </div>
      </div>
    </div>
  );
}
