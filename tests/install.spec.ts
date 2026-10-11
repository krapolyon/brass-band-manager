import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';
import { install, installInput } from './support/scenario.ts';

// The screens of the install, in a browser. What the API accepts and refuses
// is tested in tests/api/install.spec.ts.
//
// Elements are found by what they are (the field of the key, the button that
// sends the form), never by their French text.

test.beforeEach(() => emptyDatabase());

const keyField = (page: Page) => page.locator('input[name="installKey"]');
const start = (page: Page) => page.locator('button[type="submit"]');

test('an app that was never installed opens on the install', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/install');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(keyField(page)).toBeVisible();
});

test('starting without the install key says that it is missing', async ({ page }) => {
  await page.goto('/install');
  await start(page).click();

  await expect(keyField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/install');

  // Typing clears the error.
  await keyField(page).fill('a');
  await expect(keyField(page)).not.toHaveAttribute('aria-invalid', 'true');
});

test('a wrong install key is refused before the first step', async ({ page }) => {
  await page.goto('/install');
  await keyField(page).fill('not-the-right-key');
  await start(page).click();

  // While the key is checked, the button cannot be pressed again.
  await expect(start(page)).toBeDisabled();
  await expect(keyField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(start(page)).toBeEnabled();
  await expect(page).toHaveURL('/install');
});

test('the right install key opens the first step', async ({ page }) => {
  await page.goto('/install');
  await keyField(page).fill(installInput().installKey);
  await keyField(page).press('Enter');

  await expect(page).toHaveURL('/install/band');
});

test('the install key is hidden, and the eye shows it', async ({ page }) => {
  await page.goto('/install');
  await keyField(page).fill('some-key');
  await expect(keyField(page)).toHaveAttribute('type', 'password');

  const eye = page.locator('.TextField button');
  await eye.click();
  await expect(keyField(page)).toHaveAttribute('type', 'text');
  await expect(eye).toHaveAttribute('aria-pressed', 'true');

  await eye.click();
  await expect(keyField(page)).toHaveAttribute('type', 'password');
});

test('the language panel opens, lists the languages and closes', async ({ page }) => {
  await page.goto('/install');
  const panel = page.getByRole('dialog');
  await expect(panel).toBeHidden();

  await page.locator('.ScreenTop-navigation button').click();
  await expect(panel).toBeVisible();
  // French is the only language shipped, and it is the current one.
  await expect(panel.locator('[aria-current="true"]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('the install address of an installed app says so and asks for no key', async ({
  page,
  request,
}) => {
  await install(request);
  await page.goto('/install');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(keyField(page)).toHaveCount(0);
});

test('the welcome screen says so when the server does not answer', async ({ page }) => {
  await page.route('**/api/install*', (route) => route.abort());
  await page.goto('/install');

  await expect(page.getByRole('alert')).toBeVisible();
});

test('at the largest text size, nothing spills out of the screen', async ({ page }) => {
  await page.goto('/install');
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = '200';
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The field and the button are still there to be used.
  await keyField(page).scrollIntoViewIfNeeded();
  await expect(start(page)).toBeEnabled();
});

test('the typefaces are served by the app, and nothing is asked of another site', async ({
  page,
  baseURL,
}) => {
  const elsewhere: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL as string)) elsewhere.push(request.url());
  });
  await page.goto('/install');
  await page.evaluate(() => document.fonts.ready);

  expect(elsewhere).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('800 40px "Bricolage Grotesque"'))).toBe(
    true,
  );
  expect(await page.evaluate(() => document.fonts.check('400 17px "Instrument Sans"'))).toBe(true);
});
