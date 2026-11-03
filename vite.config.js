import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// The normal client build, plus a small server bundle (see package.json "build")
// that prerenders Sellio's public marketing/legal routes.
export default defineConfig(() => ({
  logLevel: 'error',
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // @capacitor-firebase/messaging's web version imports Firebase's web SDK, which
      // Sellio doesn't use (push alerts are in the Android app only): see the stub.
      "firebase/messaging": path.resolve(__dirname, "./src/lib/firebaseMessagingWebStub.js"),
    },
  },
}));
