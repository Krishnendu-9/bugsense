import http from 'node:http';
import { expect, test } from '@playwright/test';

// The seeded demo accounts (server/scripts/seed.js).
const ADMIN = { email: 'admin@bugsense.dev', password: 'password123' };

const signIn = async (page, { email, password }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
};

test('signs in and reaches the overview and the seeded bugs', async ({ page }) => {
  const scriptErrors = [];
  // A Content Security Policy violation shows up as a console error.
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) scriptErrors.push(msg.text());
  });

  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await page.goto('/bugs');
  await expect(page.getByRole('heading', { name: 'Bugs', level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  // The theme script ran before the app: the page has a palette.
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);

  expect(scriptErrors).toEqual([]);
});

test('turns a wrong password away with a message', async ({ page }) => {
  await signIn(page, { ...ADMIN, password: 'not-the-password' });
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

// A third-party app embedding the SDK, on its own origin. It is served from a
// real loopback port rather than page.route(): Chrome's local network access
// check treats a page with no network address as public and blocks it from
// loading the SDK off this machine's stack.
const serveShopPage = async (html) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
};

// Letters only: the v2 fingerprint replaces anything holding a digit, and a
// marker it erased would let a second run merge into the first run's bug.
const runMarker = () =>
  `smoke-run ${Array.from({ length: 12 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;

test('files a crash reported by the embedded SDK and lists it under Bugs', async ({ page, baseURL }) => {
  const marker = runMarker();
  // Only needed when the stack sets TELEMETRY_INGEST_KEY; CI's does not.
  const key = process.env.TELEMETRY_INGEST_KEY ? ` data-key="${process.env.TELEMETRY_INGEST_KEY}"` : '';
  const shop = await serveShopPage(`<!doctype html>
    <title>Smoke Shop</title>
    <script src="${baseURL}/sdk/bugsense.js" crossorigin="anonymous"
      data-api-url="${baseURL}" data-project="Smoke Shop"${key}></script>
    <button id="pay">Pay now</button>
    <script>
      document.getElementById('pay').addEventListener('click', () => {
        throw new Error('Checkout total failed for ${marker}');
      });
    </script>`);

  try {
    await page.goto(`${shop.origin}/checkout`);
    const report = page.waitForResponse((res) => res.url() === `${baseURL}/api/telemetry/report` && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Pay now' }).click();
    // The SDK's own request, through nginx; 'created' means this run's crash is
    // a new bug, not a repeat counted onto an old one.
    expect(await (await report).json()).toMatchObject({ success: true, status: 'created' });
  } finally {
    shop.close();
  }

  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await page.goto('/bugs');
  // The list's own search, not the top bar's box of the same name.
  await page.getByRole('group', { name: 'Filter bugs' }).getByLabel('Search bugs').fill(marker);
  await expect(page).toHaveURL(/[?&]search=smoke-run/);

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: new RegExp(marker) }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell', { name: 'SDK', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: 'Smoke Shop', exact: true })).toBeVisible();
});

test('serves the dashboard with its security headers', async ({ request }) => {
  const res = await request.get('/');
  expect(res.ok()).toBeTruthy();
  const csp = res.headers()['content-security-policy'] || '';
  // Scripts from this origin only, never inline: injected markup cannot run.
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  expect(scriptSrc).toBe("script-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
});
