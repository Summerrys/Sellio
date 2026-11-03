// Stands in for Firebase's web SDK (firebase/messaging), which Sellio doesn't use: push
// alerts are in the Android app only (src/lib/pushNotifications.js, through
// @capacitor-firebase/messaging's Android code). That plugin's web version imports
// firebase/messaging, and vite.config.js points the import here instead of adding the SDK
// to the build. isSupported() says no, so the web version does nothing.
const unavailable = () => {
  throw new Error('Push alerts are only in the Sellio Android app.');
};

export const isSupported = async () => false;
export const getMessaging = unavailable;
export const getToken = unavailable;
export const deleteToken = unavailable;
export const onMessage = unavailable;
