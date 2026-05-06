import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
      '/send-message': 'http://localhost:3000',
      '/create-payment-link': 'http://localhost:3000',
      '/config': 'http://localhost:3000',
      '/billing': 'http://localhost:3000',
      '/customer-payments': 'http://localhost:3000',
      '/wallet': 'http://localhost:3000',
      '/contacts': 'http://localhost:3000',
      '/templates': 'http://localhost:3000',
      '/communications': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
