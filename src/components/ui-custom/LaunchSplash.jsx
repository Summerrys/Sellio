import { useLayoutEffect, useSyncExternalStore } from 'react';
import { finishLaunch, getLaunchSnapshot, launchCanEnd, readLaunch, subscribeLaunch } from '@/lib/appLaunch';

// The Sellio splash while the Android app starts (see lib/appLaunch.js). The splash
// itself is the #sellio-launch-splash element in index.html, which is shown before
// the code loads; this keeps that same element up until the first screen is ready and
// then fades it out. One element from first paint to the end, so nothing flickers.
const FADE_MS = 200;
const SHOWN = 'data-sellio-launch';
const LEAVING = 'sellio-launch--leaving';

export default function LaunchSplash() {
  const launch = useSyncExternalStore(subscribeLaunch, getLaunchSnapshot, () => null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const splash = document.getElementById('sellio-launch-splash');
    if (!launch || !splash) return undefined;
    splash.classList.remove(LEAVING);
    root.setAttribute(SHOWN, '');
    const timer = setInterval(() => {
      if (!launchCanEnd(launch)) return;
      clearInterval(timer);
      splash.classList.add(LEAVING);
      finishLaunch();
      // Its own timer: the launch ending above must not cancel the fade.
      setTimeout(() => {
        if (readLaunch()) return; // a new launch started meanwhile: keep it up
        root.removeAttribute(SHOWN);
        splash.classList.remove(LEAVING);
      }, FADE_MS);
    }, 100);
    return () => clearInterval(timer);
  }, [launch]);

  return null;
}
