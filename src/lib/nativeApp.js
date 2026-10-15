// Base44's Android wrapper exposes one of these bridges to the page.
export function isNativeApp(browser = typeof window !== 'undefined' ? window : undefined) {
  return !!browser && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
}
