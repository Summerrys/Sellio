// Stands in for Firebase's web SDK (firebase/messaging) inside @capacitor-firebase/messaging
// only. That plugin is for the Android app's alerts (src/lib/pushNotifications.js, through
// its Android code); its web version imports firebase/messaging, and vite.config.js points
// that one import here. isSupported() says no, so the plugin's web version does nothing.
// Browser alerts on the website use the real SDK directly (src/lib/webPush.js).
const unavailable = () => {
  throw new Error('Push alerts are only in the Sellio Android app.');
};

export const isSupported = async () => false;
export const getMessaging = unavailable;
export const getToken = unavailable;
export const deleteToken = unavailable;
export const onMessage = unavailable;
