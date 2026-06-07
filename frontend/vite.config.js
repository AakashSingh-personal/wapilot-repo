import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const apiTarget = process.env.VITE_DEV_API_PROXY || 'http://localhost:3000';

/** Paths served by the Express API (dev proxy when VITE_API_URL is unset). */
const apiPaths = [
  '/auth',
  '/dashboard',
  '/webhook',
  '/scheduling',
  '/public',
  '/billing',
  '/wallet',
  '/contacts',
  '/templates',
  '/communications',
  '/media',
  '/health',
  '/customer-payments',
  '/send-message',
  '/create-payment-link',
  '/config',
  '/admin',
];

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Charts
          'charts': ['recharts'],
          // Icons
          'icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(apiPaths.map((path) => [path, apiTarget])),
  },
});
