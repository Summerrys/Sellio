// Keep completed authentication out of the Android WebView's Back history.
// Returning to Auth while signed in otherwise immediately opens Dashboard again.
export function completeAuthNavigation(destination, browser = window) {
  const nativeAndroid = /Android/i.test(browser.navigator.userAgent) && (
    typeof browser.ReactNativeWebView?.postMessage === 'function' ||
    typeof browser.__hybrid_bridge?.sendMessage === 'function'
  );
  if (nativeAndroid) browser.location.replace(destination);
  else browser.location.assign(destination);
}
