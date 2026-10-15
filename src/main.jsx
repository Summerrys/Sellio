import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { removeAppReloadParam } from '@/lib/appUpdates'

removeAppReloadParam()

// Register our minimal PWA service worker (required for install prompts on Chrome/Android).
// It intentionally does no caching — see public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Public routes include a build-time prerender for non-JavaScript crawlers. On the
// website's start page it stays on screen until the landing page has loaded
// (LandingPage removes it); everywhere else it goes now.
if (window.location.pathname !== '/') document.getElementById('sellio-prerender')?.remove()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)