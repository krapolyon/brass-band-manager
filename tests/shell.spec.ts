import { expect, test } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';
import { logoInput } from './support/images.ts';
import { install } from './support/scenario.ts';

type Manifest = {
  display: string;
  icons: { src: string; sizes: string; type: string }[];
};

// These tests need an installed app: one that is not installed sends its
// visitor to the install. Nobody is signed in on the page.
test.describe('on an installed app', () => {
  test.beforeEach(async ({ request }) => {
    emptyDatabase();
    await install(request);
  });

  test('the app loads, reaches the API and the database, and asks who is there', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/sign-in');
    // The name of the band comes from the database.
    await expect(page.getByText('La Fanfare des Cuivres Déchaînés')).toBeVisible();
  });

  test('the tab shows the icon of the band, else its logo, else the neutral icon, before the app has loaded (#48)', async ({
    request,
  }) => {
    // What the page names, read before any script runs (Safari keeps it).
    const html = await (await request.get('/sign-in')).text();
    expect(html).toContain('<link rel="icon" href="/api/band/icon/192" type="image/png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/api/band/icon/180" />');

    // No logo: the address gives the neutral icon, a real image.
    const neutral = await request.get('/api/band/icon/192');
    expect(neutral.headers()['content-type']).toBe('image/png');
    expect(await neutral.body()).toEqual(
      await (await request.get('/appIcons/icon-192.png')).body(),
    );

    // A logo: the same address gives its icon.
    await request.put('/api/band/logo', { data: logoInput() });
    const drawn = await request.get('/api/band/icon/192');
    expect(drawn.headers()['content-type']).toBe('image/png');
    expect(await drawn.body()).not.toEqual(await neutral.body());
  });

  test('the app says so when the server does not answer', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveAttribute('data-state', 'unreachable');
  });

  test('installed on an iPhone, the app draws under a translucent status bar, on its own ground (#28)', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await expect(page.getByText('La Fanfare des Cuivres Déchaînés')).toBeVisible();
    const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content');
    // A device in light: the bar of the light scheme, its clock in black.
    expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('default');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain(
      'viewport-fit=cover',
    );
    // What shows under the status bar is the ground of the scheme in use.
    const grounds = () =>
      page.evaluate(() => [
        getComputedStyle(document.documentElement).backgroundColor,
        getComputedStyle(document.body).backgroundColor,
      ]);
    const [root, body] = await grounds();
    expect(root).toBe(body);
    const light = await meta('theme-color');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => meta('theme-color')).not.toBe(light);
    const [darkRoot, darkBody] = await grounds();
    expect(darkRoot).toBe(darkBody);
    // A device in dark: the app draws under a translucent bar.
    await page.reload();
    await expect(page.getByText('La Fanfare des Cuivres Déchaînés')).toBeVisible();
    expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
  });

  test('an address inside the app is answered by the app', async ({ page }) => {
    const response = await page.goto('/rehearsals/12');

    // No screen exists there yet: the app itself says so, with a way back.
    expect(response?.status()).toBe(200);
    await page.getByRole('link').click();
    await expect(page).toHaveURL('/sign-in');
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
