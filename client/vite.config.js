import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing libraries out of the app bundle so
        // they cache independently of application code.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          editor: ['react-quill'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // The embeddable SDK is served by Express from server/public/sdk.
      // Without this, Vite's SPA fallback returns index.html and the
      // <script> tag on /sdk-demo fails to parse as JavaScript.
      '/sdk': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
