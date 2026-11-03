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
    },
  },
}));
