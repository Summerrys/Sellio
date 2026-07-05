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
  // Always show something when accessed via a regular browser tab (not the
  // installed app). If the native beforeinstallprompt event has already fired,
  // clicking Install triggers it directly. Otherwise (event hasn't fired yet,
  // Chrome heuristics not met, or iOS Safari which never fires it at all) the
  // modal falls back to manual "Add to Home Screen" instructions at click time.
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

export function hasNativePrompt() {
  return !!deferredEvent;
}
