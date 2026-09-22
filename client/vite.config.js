import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:5000';

// Split the heavy, rarely-changing libraries out of the app bundle so they
// cache independently of application code.
const VENDOR_CHUNKS = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/],
  ['charts', /[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/],
  ['editor', /[\\/]node_modules[\\/](react-quill-new|quill|parchment)[\\/]/],
];

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0];
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // The embeddable SDK is served by Express from server/public/sdk.
      // Without this, Vite's SPA fallback returns index.html and the
      // <script> tag on /sdk-demo fails to parse as JavaScript. Matched as
      // /sdk/ only: a bare '/sdk' prefix would also proxy the /sdk-demo page.
      '^/sdk/': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Needed when VITE_API_URL is relative (/api): sockets then connect to
      // the dev server's own origin.
      '/socket.io': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
