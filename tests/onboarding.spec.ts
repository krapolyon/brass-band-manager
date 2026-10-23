import { expect, type Page, type PlaywrightWorkerArgs, test } from '@playwright/test';
import { chooseAccessibility } from './support/accessibility.ts';
import { emptyDatabase } from './support/database.ts';
import { png } from './support/images.ts';
import { memberColumns } from './support/personal.ts';
import { addMember, admin, deviceOf, install, memberId } from './support/scenario.ts';
import { emptyStorage, storedFiles } from './support/storage.ts';

// Arriving from an invitation, in two steps: the details to check and
// complete, then the password. Rules: model/members.md, entry 3 ("An
// invitation is completed in one request") and "Accessibility before sign-in".

let link = '';

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
  link = `/invitation#${await tokenFor(playwright, 'Kiki')}`;
});

async function tokenFor(playwright: PlaywrightWorkerArgs['playwright'], nickname: string) {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const response = await jibe.post(`/api/members/${memberId(nickname)}/passwordLink`);
  const token = (await response.json()).passwordLinkToken as string;
  await jibe.dispose();
  return token;
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const next = (page: Page) => page.getByRole('button', { name: 'Continuer' });
const enter = (page: Page) => page.getByRole('button', { name: 'Entrer dans l’app' });
const password = (page: Page) => page.getByLabel('Mot de passe', { exact: true });
// The personal fields read in clear, as the app reads them (they are encrypted).
const kiki = (columns: string) => memberColumns('Kiki', columns);

test('an invited member checks their details, chooses a password and is in', async ({ page }) => {
  await page.goto(link);

  await expect(title(page)).toHaveText('Bienvenue, Kiki !');
  await expect(page.getByText('Étape 1 sur 2')).toBeVisible();
  // What whoever invited filled in is there to check.
  await expect(page.getByLabel('Surnom')).toHaveValue('Kiki');
  await expect(page.getByLabel('Adresse email')).toHaveValue('kiki@example.org');

  await page.getByLabel('Prénom').fill('Christine');
  await page.getByLabel('Nom', { exact: true }).fill('Dupré');
  await page.getByLabel('Téléphone mobile').fill('06 12 34 56 78');
  await page.getByLabel('Ville').fill('Lyon');
  await page.getByLabel('Pays').selectOption({ label: 'France' });
  await page.getByRole('button', { name: /^Instrument/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sax Alto' }).click();
  await next(page).click();

  await expect(title(page)).toHaveText('Plus qu’un mot de passe');
  await expect(page.getByText('Étape 2 sur 2')).toBeVisible();
  // Nothing is saved before the last step.
  expect(kiki('status, firstName')).toBe('INVITED\tPrénom');

  await password(page).fill('court');
  await enter(page).click();
  await expect(page.getByText('Encore 5 caractères : il en faut 10 au minimum.')).toBeVisible();
  await password(page).fill('helicon-en-fa-diese-9');
  await enter(page).click();

  await expect(page).toHaveURL('/');
  // The phone number typed the local way is stored in the international form.
  expect(
    kiki(
      'status, firstName, lastName, mobilePhone, city, countryCode, (SELECT name FROM instrument WHERE id = instrumentId)',
    ),
  ).toBe('ACTIVE\tChristine\tDupré\t+33612345678\tLyon\tFR\tSax Alto');
});

test('a nickname already taken is said at the first step, on its field', async ({ page }) => {
  await page.goto(link);
  await page.getByLabel('Surnom').fill('zaza');
  await next(page).click();

  await expect(page.getByRole('alert')).toHaveText('Un champ est à corriger avant de continuer.');
  await expect(page.getByText('Ce surnom est déjà pris. Essaie une variante.')).toBeVisible();
  await expect(page.getByLabel('Surnom')).toBeFocused();
  await expect(title(page)).toHaveText('Bienvenue, Kiki !');

  await page.getByLabel('Surnom').fill('Kiki la Rousse');
  await next(page).click();
  await expect(title(page)).toHaveText('Plus qu’un mot de passe');
});

test('every field that is wrong is said before anything is sent', async ({ page }) => {
  await page.goto(link);
  await page.getByLabel('Prénom').fill('');
  await page.getByLabel('Adresse email').fill('pas-une-adresse');
  await page.getByLabel('Téléphone mobile').fill('12');
  await next(page).click();

  await expect(page.getByRole('alert')).toHaveText('3 champs sont à corriger avant de continuer.');
  await expect(page.getByText('Il manque le prénom.')).toBeVisible();
  await expect(page.getByText('Cette adresse n’a pas l’air complète.')).toBeVisible();
  await expect(page.getByText('Ce numéro n’a pas l’air complet.')).toBeVisible();
});

test('going back from the password keeps what was typed', async ({ page }) => {
  await page.goto(link);
  await page.getByLabel('Prénom').fill('Christine');
  await next(page).click();
  await expect(title(page)).toHaveText('Plus qu’un mot de passe');

  await page.getByRole('button', { name: 'Retour' }).click();

  await expect(page.getByLabel('Prénom')).toHaveValue('Christine');
});

test('the options chosen during an invitation are saved with the account, not on the device', async ({
  page,
}) => {
  await page.goto(link);
  await page.getByRole('button', { name: 'Accessibilité' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Ces réglages seront enregistrés avec ton compte.');
  await sheet.getByRole('slider').press('ArrowRight');
  await sheet.getByRole('switch', { name: 'Police plus lisible' }).check();
  await page.getByRole('button', { name: 'Fermer' }).click();
  // Shown at once, on both steps.
  await expect(page.locator('html')).toHaveAttribute('data-text-size', '120');

  await next(page).click();
  await expect(page.locator('html')).toHaveAttribute('data-typeface', 'legible');
  await password(page).fill('helicon-en-fa-diese-9');
  await enter(page).click();
  await expect(page).toHaveURL('/');

  // The account receives the five options; the text size stays on the device.
  expect(kiki('hasLegibleFont, hasHighContrast')).toBe('1\t0');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', '120');
  // The options of the account can hint at a disability: the device keeps no
  // trace of them, only its own text size.
  const stored = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('accessibility'))) ?? '{}',
  );
  expect(stored).toMatchObject({ textSizePercent: 120, hasLegibleFont: false });
});

test('the photo given by whoever invited can be replaced, or removed', async ({
  page,
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.put(`/api/members/${memberId('Kiki')}/photo`, {
    data: { image: png(64).toString('base64') },
  });
  await jibe.dispose();
  const [given] = storedFiles('members');

  await page.goto(link);
  const photo = page.getByRole('group', { name: 'Photo' });
  await expect(photo.locator('img')).toBeVisible();
  await photo.locator('input[type=file]').setInputFiles({
    name: 'moi.png',
    mimeType: 'image/png',
    buffer: png(300),
  });
  await expect(photo.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await next(page).click();
  await password(page).fill('helicon-en-fa-diese-9');
  await enter(page).click();
  await expect(page).toHaveURL('/');

  // One file, and not the one that was given.
  const kept = storedFiles('members');
  expect(kept).toHaveLength(1);
  expect(kept[0]).not.toBe(given);
  expect(kept[0]).toMatch(/photo\.jpg$/);
});

test('an invited member who wants no photo has none', async ({ page, playwright }) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.put(`/api/members/${memberId('Kiki')}/photo`, {
    data: { image: png(64).toString('base64') },
  });
  await jibe.dispose();

  await page.goto(link);
  await page.getByRole('group', { name: 'Photo' }).getByRole('button', { name: 'Retirer' }).click();
  await next(page).click();
  // Not removed yet: the invitation can still be abandoned.
  expect(storedFiles('members')).toHaveLength(1);
  await password(page).fill('helicon-en-fa-diese-9');
  await enter(page).click();
  await expect(page).toHaveURL('/');

  expect(storedFiles('members')).toEqual([]);
});

test('a link used twice, or of someone already in, opens the screen of a dead link', async ({
  page,
  playwright,
}) => {
  await page.goto(link);
  await expect(title(page)).toHaveText('Bienvenue, Kiki !');
  // Meanwhile whoever invited created another link: this one is dead.
  await tokenFor(playwright, 'Kiki');

  await next(page).click();

  await expect(title(page)).toHaveText('Ce lien ne marche plus');
});

test('at the largest text size, both steps can still be used', async ({ page }) => {
  await chooseAccessibility(page, { textSizePercent: 200, hasIncreasedSpacing: true });
  await page.goto(link);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await next(page).click();
  await expect(title(page)).toHaveText('Plus qu’un mot de passe');
  expect(await overflow()).toBeLessThanOrEqual(0);
});
