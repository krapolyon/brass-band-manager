import { expect, test } from '@playwright/test';

test('the app loads and reaches the API and the database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveAttribute('data-state', 'ready');
});

test('the app says so when the server does not answer', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveAttribute('data-state', 'unreachable');
});

test('an address inside the app opens the app', async ({ page }) => {
  const response = await page.goto('/songs/12');

  expect(response.status()).toBe(200);
  await expect(page.getByRole('status')).toBeVisible();
});

test('the app can be installed: its manifest and icons are served', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');

  const manifest = await (await request.get(href)).json();
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
