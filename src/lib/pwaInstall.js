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
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

export function canShowInstallPrompt() {
  if (isStandalone() || installed) return false;
  // Android/desktop Chrome: only show if the browser actually fired the event.
  // iOS Safari never fires beforeinstallprompt, but "Add to Home Screen" is still
  // possible manually — we show instructions instead of a native prompt there.
  return !!deferredEvent || isIOS();
}

export async function promptInstall() {
  if (!deferredEvent) return { outcome: 'unavailable' };
  const result = await deferredEvent.prompt();
  deferredEvent = null;
  return result; // { outcome: 'accepted' | 'dismissed' }
}

export function hasNativePrompt() {
  return !!deferredEvent;
}
