const currentWindow = () => (typeof window !== 'undefined' ? window : undefined);

// Sellio's own app (Capacitor), on Android and iOS. It carries its own copy of the website
// and runs it at https://localhost (Android) or capacitor://localhost (iOS).
export function isCapacitorApp(browser = currentWindow()) {
  try {
    return !!browser && browser.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// 'android' or 'ios' inside Sellio's app; '' anywhere else.
export function appPlatform(browser = currentWindow()) {
  if (!isCapacitorApp(browser)) return '';
  try {
    const platform = browser.Capacitor.getPlatform?.();
    return platform === 'android' || platform === 'ios' ? platform : '';
  } catch {
    return '';
  }
}

// Base44's Android wrapper (the old app, which loads the website from selliosg.base44.app)
// exposes one of these bridges to the page.
export function isBase44Shell(browser = currentWindow()) {
  return !!browser && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
}

// Any Sellio app: the Capacitor app or Base44's old one. A browser, or Sellio added to a home
// screen, is not an app.
export function isNativeApp(browser = currentWindow()) {
  return isCapacitorApp(browser) || isBase44Shell(browser);
}

// Google Play and Apple require their own billing for subscriptions sold in an app, so the
// apps don't sell Sellio's plans: they show the plan and PLANS_ON_WEBSITE instead.
export function sellsPlans(browser = currentWindow()) {
  return !isNativeApp(browser);
}
export const PLANS_ON_WEBSITE = 'Plans are managed on the Sellio website';

// A link to another app or website (WhatsApp, say). A browser opens it in a new tab. In
// Sellio's apps the page goes to it in place: the app hands any address outside Sellio to
// the phone, which opens WhatsApp or the browser (Base44's old app asks "Open External
// Link?" first). An app's web view has no tabs.
export function outsideLinkProps(href) {
  return isNativeApp() ? { href } : { href, target: '_blank', rel: 'noopener noreferrer' };
}

export function openOutside(href) {
  if (isNativeApp()) window.location.href = href;
  else window.open(href, '_blank');
}

// A place to open in a map (an address, or an area like "Tampines"). Sellio's Android app
// hands geo: links straight to the phone, which opens its Maps app (no "Open External
// Link?" box); the iPhone app opens Apple Maps' address, which iOS gives to the Maps app; a
// browser opens Google Maps in a new tab.
export function mapLinkProps(place) {
  const query = encodeURIComponent(String(place || '').trim());
  if (appPlatform() === 'ios') return { href: `https://maps.apple.com/?q=${query}` };
  return isNativeApp()
    ? { href: `geo:0,0?q=${query}` }
    : { href: `https://www.google.com/maps/search/?api=1&query=${query}`, target: '_blank', rel: 'noopener noreferrer' };
}

// An address as a map should look it up: the shop's country is added when the address
// doesn't name it already, so "Blk 9 Sample Road" isn't found in another country.
export function placeWithCountry(address, country) {
  const place = String(address || '').trim();
  const land = String(country || '').trim();
  if (!place || !land || place.toLowerCase().includes(land.toLowerCase())) return place;
  return `${place}, ${land}`;
}
