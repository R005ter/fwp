import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev`, the backend is assumed to be on localhost:5050
// (the docker-compose host mapping). API calls hit /api/* and are proxied.
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:5050';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND_URL,
      '/videos': BACKEND_URL,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
