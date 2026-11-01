import { isNativeApp } from './nativeApp';

// Captures the browser's native `beforeinstallprompt` event as early as possible
// (module load time, i.e. app start) so it's available whenever we later decide to
// show our own custom install UI. The native event can only be triggered once and
// is lost if not captured immediately when it fires.

let deferredEvent = null;
let installed = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e;
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredEvent = null;
  });
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true // iOS Safari
  );
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // An iPad's Safari says it's a Mac; a Mac has no touch screen.
  return (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)) && !window.MSStream;
}

// An Android web view: Sellio's Android app, or another app's built-in browser (WhatsApp,
// Instagram…), where a web app can't be installed.
export function isAndroidWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) && /; wv\)/.test(ua);
}

export function canShowInstallPrompt() {
  // The Android app is already installed: no web-app install prompt there.
  if (isStandalone() || installed || isNativeApp() || isAndroidWebView()) return false;
  // Always offer it in a regular browser tab (not the installed app; offerInstall also
  // asks the browser whether Sellio is installed already, and then offers to open it). If the native
  // beforeinstallprompt event has fired, Install triggers it directly; otherwise (not
  // fired yet, Chrome heuristics not met, or iOS Safari which never fires it at all)
  // Install shows the "Add to Home Screen" steps.
  return true;
}

export async function promptInstall() {
  if (!deferredEvent) return { outcome: 'unavailable' };
  const result = await deferredEvent.prompt();
  deferredEvent = null;
  return result; // { outcome: 'accepted' | 'dismissed' }
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

// Chrome on an iPhone or iPad (it adds to the home screen from its own Share icon).
export function isChromeOnIOS() {
  if (typeof navigator === 'undefined') return false;
  return isIOS() && /CriOS/.test(navigator.userAgent || '');
}

export function hasNativePrompt() {
  return !!deferredEvent;
}

// Whether Sellio is already installed from this site, asked from a browser tab: Chrome on
// Android, and Chrome or Edge 140+ on a computer, answer it (manifest.json lists Sellio under
// related_applications for this); Safari can't. No answer within a moment counts as no.
export async function installedHere() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.getInstalledRelatedApps !== 'function') return false;
    const apps = await Promise.race([
      navigator.getInstalledRelatedApps(),
      new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);
    return Array.isArray(apps) && apps.some((app) => app?.platform === 'webapp');
  } catch {
    return false;
  }
}

// "Install Sellio" is offered once per browser session, as a banner at the top of the screen
// (InstallBanner, shown by Layout). When the browser can't remember that, it isn't offered
// at all, rather than on every page.
const SEEN_KEY = 'sellio_install_prompt_login_shown';
export const OFFER_INSTALL_EVENT = 'sellio:offer-install';
export function installPromptSeen() {
  try { return !!sessionStorage.getItem(SEEN_KEY); } catch { return true; }
}
export function markInstallPromptSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}
// Offers it now, unless it was offered this session or can't be installed here. When the
// browser says Sellio is installed already, the banner offers "Open in app" instead
// (event detail { open: true }). Resolves to whether it was offered.
export async function offerInstall() {
  if (installPromptSeen() || !canShowInstallPrompt()) return false;
  const open = await installedHere();
  if (installPromptSeen()) return false; // offered meanwhile
  markInstallPromptSeen();
  window.dispatchEvent(new CustomEvent(OFFER_INSTALL_EVENT, { detail: { open } }));
  return true;
}

// The link that opens this page in the installed Sellio app, from a browser tab. On Android,
// an Android link to this address: Chrome hands it to the installed Sellio app (if Chrome
// keeps it instead, this page simply loads again). On a computer, a link that opens a new
// tab: Chrome (139 and later) opens it in the installed app instead.
export function openInAppLink(where = window.location) {
  const page = `${where.pathname}${where.search}`;
  if (isAndroid()) {
    const scheme = where.protocol.replace(':', '');
    const fallback = encodeURIComponent(`${where.origin}${page}`);
    return { href: `intent://${where.host}${page}#Intent;scheme=${scheme};S.browser_fallback_url=${fallback};end` };
  }
  return { href: `${where.origin}${page}${where.hash}`, target: '_blank', rel: 'noopener' };
}
