import { expect, test } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';
import { install } from './support/scenario.ts';

type Manifest = {
  display: string;
  icons: { src: string; sizes: string; type: string }[];
};

// The home screen is still a placeholder. These tests need an installed app:
// one that is not installed sends its visitor to the install.
test.describe('on an installed app', () => {
  test.beforeEach(async ({ request }) => {
    emptyDatabase();
    await install(request);
  });

  test('the app loads and reaches the API and the database', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveAttribute('data-state', 'ready');
  });

  test('the app says so when the server does not answer', async ({ page }) => {
    await page.route('**/api/install*', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveAttribute('data-state', 'unreachable');
  });

  test('an address inside the app is answered by the app', async ({ page }) => {
    const response = await page.goto('/songs/12');

    // No screen exists there yet: the app itself says so, with a way back.
    expect(response?.status()).toBe(200);
    await page.getByRole('link').click();
    await expect(page.getByRole('status')).toBeVisible();
  });
});

test('the app can be installed: its manifest and icons are served', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');

  expect(href).not.toBeNull();
  const manifest: Manifest = await (await request.get(href as string)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe(icon.type);
  }
});

test('the API answers an unknown address with a JSON 404', async ({ request }) => {
  const response = await request.get('/api/nothingHere');

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'notFound' });
});

test('the API refuses a method an address does not accept', async ({ request }) => {
  const response = await request.post('/api/health');

  expect(response.status()).toBe(405);
  expect(await response.json()).toEqual({ error: 'methodNotAllowed' });
});

test('API answers are never cached and never reveal the server', async ({ request }) => {
  const headers = (await request.get('/api/health')).headers();

  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});
