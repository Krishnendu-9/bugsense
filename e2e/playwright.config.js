import { defineConfig, devices } from '@playwright/test';

// Runs against a stack that is already up (CI: `docker compose up`, then
// `npm run seed`). BASE_URL points it elsewhere, e.g. the Vite dev server.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
