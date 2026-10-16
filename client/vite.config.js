import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:5000';

// React itself changes rarely, so it gets its own long-cached chunk. Heavy
// page-specific libraries (Recharts, Quill, Fabric) are deliberately not
// forced into named chunks: routes are lazy-loaded, so they already land in
// chunks fetched only by the pages that use them. Grouping them manually made
// the entry chunk import small shared modules from those groups, which pulled
// the whole chart and editor bundles into the first page load.
const VENDOR_CHUNKS = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/],
];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
      reporter: ['text-summary', 'text'],
    },
  },
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
