import React from 'react'
import ReactDOM, { hydrateRoot } from 'react-dom/client'
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

const rootElement = document.getElementById('root')
const app = <App />

if (rootElement?.hasChildNodes()) {
  hydrateRoot(rootElement, app)
} else {
  ReactDOM.createRoot(rootElement).render(app)
}