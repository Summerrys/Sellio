import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// The normal client build, plus a small server bundle (see package.json "build")
// that prerenders Sellio's public marketing/legal routes.
// @capacitor-firebase/messaging's web version imports Firebase's web SDK. Sellio's website
// uses that SDK itself for browser alerts (src/lib/webPush.js), but the plugin is for the
// Android app only, so its web version gets the stub instead and stays inert.
const pluginWebStub = {
  name: 'sellio-firebase-plugin-web-stub',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === 'firebase/messaging' && importer && /[\\/]@capacitor-firebase[\\/]messaging[\\/]/.test(importer)) {
      return path.resolve(__dirname, './src/lib/firebaseMessagingWebStub.js');
    }
    return null;
  },
};

export default defineConfig(() => ({
  logLevel: 'error',
  plugins: [
    pluginWebStub,
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
