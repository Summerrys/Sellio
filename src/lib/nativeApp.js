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

// A place to open in a map (an address, or an area like "Tampines"). Sellio's Android app
// hands geo: links straight to the phone, which opens its Maps app (no "Open External
// Link?" box); a browser opens Google Maps in a new tab.
export function mapLinkProps(place) {
  const query = encodeURIComponent(String(place || '').trim());
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
