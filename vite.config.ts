import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The front lives in web/ and is built to static files in web/dist.
// In development, calls to /api are forwarded to the PHP container.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
