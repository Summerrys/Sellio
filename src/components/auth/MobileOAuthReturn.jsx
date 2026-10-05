import { useEffect, useState } from 'react';
import { getSupabase, getMobileOAuthClient } from '@/lib/supabaseClient';
import {
  buildAndroidReturnIntent, buildMobileReturnUrl, completeMobileGoogleAuth,
  isNativeAndroid, parseMobileOAuthCallback, readPendingMobileAuth,
} from '@/lib/mobileOAuth';

export default function MobileOAuthReturn() {
  const [result] = useState(() => {
    try { return { callback: parseMobileOAuthCallback(window.location.href) }; }
    catch (error) { return { error: error.message }; }
  });
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState(result.error || '');
  const callback = result.callback;

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.appendChild(meta);
    let alive = true;
    let timer;
    let checks = 0;
    const check = async () => {
      if (!callback) {
        setStatus('error');
        window.history.replaceState(window.history.state, '', '/Auth');
        return;
      }
      const pending = readPendingMobileAuth(window.localStorage);
      // Storage binds the return to this WebView even if bridge injection is late.
      if (pending?.attempt === callback.attempt && pending.origin === callback.origin) {
        try {
          const destination = await completeMobileGoogleAuth({
            browser: window, callback,
            oauthClient: getMobileOAuthClient(), getAppClient: getSupabase,
          });
          if (alive) window.location.replace(destination);
        } catch (failure) {
          if (alive) { setError(failure.message); setStatus('error'); }
        }
        return;
      }
      if (isNativeAndroid()) {
        setError('This sign-in expired or was started in another app window. Please start again.');
        setStatus('error');
        window.history.replaceState(window.history.state, '', '/Auth');
        return;
      }
      // Give wrappers that inject their bridge after React mounts time to identify.
      if (++checks < 10) { timer = window.setTimeout(check, 100); return; }
      setStatus('browser');
    };
    check();
    return () => { alive = false; window.clearTimeout(timer); meta.remove(); };
  }, [callback]);

  const failed = new URLSearchParams(window.location.search).get('app_link_failed') === '1';
  return (
    <main className="min-h-[100dvh] bg-white flex items-center justify-center p-6" data-pull-refresh-block>
      <div className="w-full max-w-sm text-center">
        <img src="https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png"
          alt="Sellio" className="w-24 h-24 object-contain mx-auto mb-8" />
        <h1 className="text-2xl font-semibold text-slate-900">
          {status === 'checking' ? 'Finishing sign-in…' : status === 'error' ? 'Sign-in could not finish' : 'Return to Sellio'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {status === 'checking' ? 'Please wait while Sellio completes your Google sign-in.' :
            status === 'error' ? error :
            callback?.error ? 'Return to the app to try Google sign-in again.' :
            'Continue in the Sellio app to finish signing in.'}
        </p>
        {status === 'browser' && callback && (
          <>
            <a href={buildAndroidReturnIntent(callback)} rel="noreferrer"
              className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white">
              Return to Sellio
            </a>
            <a href={buildMobileReturnUrl(callback).href} rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center text-orange-700 underline">
              Open with app link
            </a>
            {failed && <p className="mt-4 text-sm text-slate-600">
              Android could not open this link in Sellio. Enable “Open supported links” in Sellio’s app settings,
              then try again. If it still fails, this app version needs an update.
            </p>}
          </>
        )}
        {status === 'error' && <a href="/Auth" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white">
          Back to sign-in
        </a>}
      </div>
    </main>
  );
}
