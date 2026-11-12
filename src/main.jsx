import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/ui-custom/AppErrorBoundary'
import '@/index.css'
import { removeAppReloadParam } from '@/lib/appUpdates'
import { installEdgeSwipeBack } from '@/lib/edgeSwipeBack'
import { isCapacitorApp } from '@/lib/nativeApp'
import { startAdsMeasurement } from '@/lib/adsPixel'

removeAppReloadParam()

// ChatGPT ads on the website (index.html's OpenAI Pixel; the apps have none): the cookie choice,
// and trial_started when a free trial from the website comes back from Stripe.
startAdsMeasurement()

// Product and shop photos (class "sellio-photo") fade in once they've loaded (index.css).
// A data attribute rather than a class, so React re-rendering the class never hides one.
const markPhoto = (event) => {
  const img = event.target
  if (img instanceof HTMLImageElement && img.classList.contains('sellio-photo')) img.dataset.loaded = '1'
}
document.addEventListener('load', markPhoto, true)
document.addEventListener('error', markPhoto, true)

// iPhone / iPad from the Home Screen: swipe back from the left edge (iOS has none there).
installEdgeSwipeBack()

// Sellio's Capacitor app (Android and iPhone): Back, links that open the app, the splash and
// Google sign-out. Loaded only inside the app, as its own file.
if (isCapacitorApp()) {
  import('@/lib/capacitorApp')
    .then(({ startCapacitorApp }) => startCapacitorApp())
    .catch((error) => console.error('Sellio app start failed:', error))
}

// Register our minimal PWA service worker (required for install prompts on Chrome/Android).
// It intentionally does no caching — see public/sw.js. Sellio's app has no use for one.
if ('serviceWorker' in navigator && !isCapacitorApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Public routes include a build-time prerender for non-JavaScript crawlers. On the
// website's start page it stays on screen until the landing page has loaded
// (LandingPage removes it); everywhere else it goes now.
if (window.location.pathname !== '/') document.getElementById('sellio-prerender')?.remove()

// A screen that fails to load or crashes shows a Reload screen, never a blank app.
ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><App /></AppErrorBoundary>
)