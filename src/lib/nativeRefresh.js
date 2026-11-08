// The Android app's own pull to refresh (Alvin, 8 Nov 2026): Android's refresh circle around the
// web view (SellioRefreshLayout and SellioRefreshPlugin in the Android project). PullToRefresh
// uses it when the app has it: at each touch it tells the app whether that finger may start a
// pull (only the page knows its windows, text boxes, maps and scrolled lists), the app says when
// a pull was let go, and the page says when its refresh is done. The website, the iPhone app and
// Android builds from before it keep the page's own pull.
export const NATIVE_REFRESH = 'SellioRefresh';

// The app lists its plugins for the page before any of the page's code runs.
export function hasNativeRefresh(browser = typeof window !== 'undefined' ? window : undefined) {
  try {
    const headers = browser?.Capacitor?.PluginHeaders;
    return Array.isArray(headers) && headers.some((header) => header?.name === NATIVE_REFRESH);
  } catch {
    return false;
  }
}

// Capacitor's own code loads only in the app, so the website doesn't download it. Resolves to
// { plugin }, not the plugin itself: Capacitor's plugin object answers to any name as one of the
// app's methods, `then` included, so a promise would take it for a promise and never settle.
let loading = null;
export function loadNativeRefresh() {
  loading ||= import('@capacitor/core').then(({ registerPlugin }) => ({ plugin: registerPlugin(NATIVE_REFRESH) }));
  return loading;
}
