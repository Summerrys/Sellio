// Base44's Android wrapper exposes one of these bridges to the page.
export function isNativeApp(browser = typeof window !== 'undefined' ? window : undefined) {
  return !!browser && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
}

// A link to another app or website (WhatsApp, say). A browser opens it in a new tab. In
// Sellio's Android app the page goes to it in place, the way Google sign-in does: the app
// takes any address outside Sellio, asks "Open External Link?" and hands it to the phone,
// which opens WhatsApp. (The app's web view has no tabs; this is the route Google sign-in
// already shows works there.)
export function outsideLinkProps(href) {
  return isNativeApp() ? { href } : { href, target: '_blank', rel: 'noopener noreferrer' };
}

export function openOutside(href) {
  if (isNativeApp()) window.location.href = href;
  else window.open(href, '_blank');
}
