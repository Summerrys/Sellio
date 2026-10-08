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

// Public routes include a build-time prerender for non-JavaScript crawlers.
document.getElementById('sellio-prerender')?.remove()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)