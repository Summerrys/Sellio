// Sellio's Capacitor app (Android and iPhone): the native pieces a website doesn't have.
// main.jsx loads this only inside the app, as its own file; the website never downloads it.
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { handleAndroidBack } from './useBackToClose';
import { getSupabase } from './supabaseClient';
import { appPlatform } from './nativeApp';
import { SELLIO_SITE } from './accountFlow';

const SELLIO_HOST = new URL(SELLIO_SITE).hostname; // sellio.sg

let started = false;

export function startCapacitorApp() {
  if (started) return;
  started = true;
  const platform = appPlatform();

  // The native splash hands over to the page's own Sellio splash (index.html, LaunchSplash)
  // once the page has painted. If this never runs, it still goes after 3 seconds
  // (capacitor.config.json).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => {});
  }));

  // Links to Sellio's main address that open the app (sign-in, sign-up, invite and password
  // reset emails: /Auth and /Join; see AndroidManifest.xml) load the same page here, as a
  // browser would, so the page reads the link's sign-in details when it starts. Also when
  // the link started the app.
  App.addListener('appUrlOpen', ({ url }) => {
    let link;
    try { link = new URL(url); } catch { return; }
    if (link.protocol !== 'https:' || link.hostname !== SELLIO_HOST) return;
    window.location.assign(link.pathname + link.search + link.hash);
  }).catch(() => {});

  if (platform === 'android') {
    // The phone's Back: closes the top sheet or dialog, or goes back a page, as Back does in
    // Chrome on a phone (useBackToClose); on the app's first page it leaves the app.
    App.addListener('backButton', ({ canGoBack }) => {
      if (handleAndroidBack()) return;
      if (canGoBack) {
        window.history.back();
        return;
      }
      App.minimizeApp().catch(() => {});
    }).catch(() => {});

    // Signing out of Sellio also forgets the Google account picked in Android's account
    // picker, so the next Google sign-in asks which account.
    getSupabase()
      .then((supabase) => {
        supabase.auth.onAuthStateChange((event) => {
          if (event !== 'SIGNED_OUT') return;
          import('./nativeGoogle').then(({ signOutNativeGoogle }) => signOutNativeGoogle()).catch(() => {});
        });
      })
      .catch(() => {});
  }
}
