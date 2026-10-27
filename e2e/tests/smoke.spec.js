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

test('serves the dashboard with its security headers', async ({ request }) => {
  const res = await request.get('/');
  expect(res.ok()).toBeTruthy();
  const csp = res.headers()['content-security-policy'] || '';
  // Scripts from this origin only, never inline: injected markup cannot run.
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  expect(scriptSrc).toBe("script-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
});
