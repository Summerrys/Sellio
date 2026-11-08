import { useSyncExternalStore } from 'react';

// The phone's connection, as the browser (or the app's WebView) reports it: offline when
// it has no network at all. A network that is up but can't reach Sellio (a café's Wi-Fi
// sign-in page, say) still counts as online here; isNetworkError catches those requests.

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const subscribe = (listener) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

// Whether the phone is online, kept up to date.
export function useOnline() {
  return useSyncExternalStore(subscribe, () => !isOffline(), () => true);
}

// Runs callback each time the connection comes back. Returns the way to stop.
export function onReconnect(callback) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

// The app logs each change once (Android's log shows it, for the emulator check).
if (typeof window !== 'undefined' && !window.__sellioNetworkLog) {
  window.__sellioNetworkLog = true;
  subscribe(() => console.info(`Sellio network: ${isOffline() ? 'offline' : 'online'}`));
}

// The words browsers and Supabase use when a request never got an answer.
const NO_ANSWER = /failed to fetch|networkerror|network ?error|network request failed|load failed|fetch failed|err_internet_disconnected|err_network|err_name_not_resolved|err_connection|err_address_unreachable|internet connection appears to be offline|could not connect to the server|failed to send a request/i;

// Whether a request failed for want of a connection (no answer came back), rather than
// Sellio answering "no". Covers Supabase's database, sign-in, storage and functions errors.
export function isNetworkError(error, depth = 0) {
  if (!error || depth > 3) return false;
  if (['AuthRetryableFetchError', 'FunctionsFetchError'].includes(error.name)) return true;
  const text = `${error.message || ''} ${typeof error.details === 'string' ? error.details : ''}`;
  if (NO_ANSWER.test(text)) return true;
  return isNetworkError(error.cause || error.originalError || error.context, depth + 1);
}
