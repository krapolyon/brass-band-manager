import { expect, type Page, test } from '@playwright/test';
import { chooseAccessibility } from './support/accessibility.ts';
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

  await chooseAccessibility(page, { textSizePercent: 200 });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');

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

  await chooseAccessibility(page, { hasLegibleFont: true });
  await page.reload();
  await expect.poll(() => fonts).toContain('/fonts/AtkinsonHyperlegibleNext-latin.woff2');
  expect(await page.locator('h1').evaluate((h1) => getComputedStyle(h1).fontFamily)).toContain(
    'Atkinson Hyperlegible Next',
  );
});

test('increased spacing sets the four measures of the guidelines on every text', async ({
  page,
}) => {
  await chooseAccessibility(page, { hasIncreasedSpacing: true });
  await page.goto('/install');
  await expect(page.locator('html')).toHaveAttribute('data-spacing', 'increased');

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

test.describe('a light device that asks for more contrast', () => {
  test.use({ contrast: 'more', colorScheme: 'light' });

  test('gets the light high contrast mode, not the dark one', async ({ page }) => {
    await page.goto('/install');

    expect(await variable(page, '--ground')).toBe(await variable(page, '--neutral100'));
    expect(await variable(page, '--text')).toBe(await variable(page, '--neutral1000'));
    expect(await variable(page, '--glass')).toBe(await variable(page, '--neutral0'));
    for (const field of ['--haloAccent', '--haloCool', '--haloDeep']) {
      expect(await variable(page, field), field).toBe(await variable(page, '--ground'));
    }
  });
});

test.describe('a device that asks for less motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('gets no animation and no transition', async ({ page }) => {
    await page.goto('/install');

    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  });
});

test('on a desktop the title sits in a floating panel that stays while the page scrolls', async ({
  page,
}) => {
  // A window lower than the content, so that the page scrolls for good.
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/install');
  const panel = page.locator('.FlowLayout-left');
  const box = async () => panel.evaluate((element) => element.getBoundingClientRect().toJSON());

  expect(await box()).toMatchObject({ x: 16, y: 16, width: 448, height: 368 });
  await page.evaluate(() => window.scrollTo(0, 150));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect((await box()).y).toBeCloseTo(16, 0);

  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await box()).width).toBe(648);
});

test('in a low desktop window at the largest text size, the whole title can still be read', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 500 });
  await chooseAccessibility(page, { textSizePercent: 200, hasIncreasedSpacing: true });
  await page.goto('/install');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');
  const top = page.locator('.FlowLayout-left .ScreenTop');

  // The text is taller than the panel: it scrolls inside it, down to its last line.
  expect(await top.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await top.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const hidden = await page.evaluate(() => {
    const lead = document.querySelector('.FlowLayout-left h1 + p') as Element;
    const panel = document.querySelector('.FlowLayout-left') as Element;
    return lead.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
  });
  expect(hidden).toBeLessThanOrEqual(0);
});
