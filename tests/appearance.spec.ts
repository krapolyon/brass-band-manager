import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';

// The scheme and the accessibility options, as the root element carries them
// (web/src/appearance.ts, web/src/styles/tokens.css). Seen on the welcome
// screen of the install, the first screen that exists without a member.
// Rules: model/members.md, "Accessibility options".

test.beforeEach(() => emptyDatabase());

// The value of a custom property of the root element.
const variable = (page: Page, name: string) =>
  page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );
const fontSize = (element: Element) => getComputedStyle(element).fontSize;

test.describe('a device set to light', () => {
  test.use({ colorScheme: 'light' });

  test('gets the light scheme without choosing anything', async ({ page }) => {
    await page.goto('/install');

    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
    expect(await page.locator('body').evaluate((body) => getComputedStyle(body).color)).toBe(
      'rgb(20, 26, 38)',
    );
  });
});

test.describe('a device that asks for more contrast', () => {
  test.use({ contrast: 'more', colorScheme: 'dark' });

  test('gets the high contrast mode: opaque glass, and no halo', async ({ page }) => {
    await page.goto('/install');
    const root = page.locator('html');

    await expect(root).toHaveAttribute('data-contrast', 'more');
    // Glass is a plain colour, and the fields of the halo are the ground.
    expect(await variable(page, '--glass')).toBe(await variable(page, '--neutral800'));
    expect(await variable(page, '--haloAccent')).toBe(await variable(page, '--ground'));
  });
});

test('at a text size of 200 %, text grows, page titles and spacing do not', async ({ page }) => {
  await page.goto('/install');
  const title = page.locator('h1');
  const lead = page.locator('h1 + p');
  const button = page.getByRole('button').last();
  const before = {
    title: await title.evaluate(fontSize),
    lead: await lead.evaluate(fontSize),
    space: await variable(page, '--spaceMd'),
    root: await page.locator('html').evaluate(fontSize),
  };
  expect(before).toEqual({ title: '40px', lead: '17px', space: '1rem', root: '16px' });

  await page.evaluate(() => {
    document.documentElement.dataset.textSize = '200';
  });

  expect(await title.evaluate(fontSize)).toBe('40px');
  expect(await lead.evaluate(fontSize)).toBe('34px');
  expect(await button.evaluate(fontSize)).toBe('32px');
  // The size of the root is what spacing, radii and controls are counted in.
  expect(await page.locator('html').evaluate(fontSize)).toBe('16px');
});

test('the legible font is served by the app, to who turns the option on only', async ({
  page,
  baseURL,
}) => {
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/fonts/')) fonts.push(request.url().replace(baseURL as string, ''));
  });
  await page.goto('/install');
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.filter((font) => font.includes('Atkinson'))).toEqual([]);

  await page.evaluate(() => {
    document.documentElement.dataset.typeface = 'legible';
  });
  await expect.poll(() => fonts).toContain('/fonts/AtkinsonHyperlegibleNext-latin.woff2');
  expect(await page.locator('h1').evaluate((h1) => getComputedStyle(h1).fontFamily)).toContain(
    'Atkinson Hyperlegible Next',
  );
});

test('increased spacing sets the four measures of the guidelines on every text', async ({
  page,
}) => {
  await page.goto('/install');
  await page.evaluate(() => {
    document.documentElement.dataset.spacing = 'increased';
  });

  const measures = await page.locator('h1').evaluate((h1) => {
    const style = getComputedStyle(h1);
    const size = Number.parseFloat(style.fontSize);
    return {
      letter: Number.parseFloat(style.letterSpacing) / size,
      word: Number.parseFloat(style.wordSpacing) / size,
      line: Number.parseFloat(style.lineHeight) / size,
    };
  });
  expect(measures.letter).toBeCloseTo(0.12);
  expect(measures.word).toBeCloseTo(0.16);
  expect(measures.line).toBeCloseTo(1.5);
});

test('on a desktop the title sits in a floating panel that stays while the page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/install');
  const panel = page.locator('.InstallLayout-left');

  const box = async () => panel.evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(await box()).toMatchObject({ x: 16, y: 16, width: 448, height: 568 });
  await page.evaluate(() => window.scrollTo(0, 400));
  expect((await box()).y).toBeCloseTo(16, 0);
});
