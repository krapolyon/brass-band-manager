import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { png } from './support/images.ts';
import { addMember, admin, install, memberPassword } from './support/scenario.ts';
import { emptyStorage, storedFiles } from './support/storage.ts';

// The settings of the band, for admins: its name, logo, accent colour and
// default language, and its sections and instruments. Rules: model/band.md,
// and model/members.md, entry 2 ("Section and instrument").

// Installed with: Trompette (Trompette), Saxophone (Sax Alto, Sax Ténor),
// Souba (Souba). Jibé the admin plays the Sax Ténor, Zaza and Momo the Trompette.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
});

async function signIn(page: Page, email = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/members');
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const card = (page: Page, name: string) =>
  page.locator('.SectionCard').filter({ has: page.getByRole('heading', { name, exact: true }) });
const sheet = (page: Page) => page.getByRole('dialog');
const save = (page: Page) => sheet(page).getByRole('button', { name: 'Enregistrer' });

test('the summary leads to the appearance and to the sections, and reserves a row for Discord', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: /Réglages de la fanfare/ }).click();

  await expect(title(page)).toHaveText('La fanfare');
  await expect(page.getByRole('link', { name: /Apparence/ })).toContainText(
    'Nom, logo, couleur, langue',
  );
  await expect(page.getByRole('link', { name: /Pupitres et instruments/ })).toContainText(
    '3 pupitres, 4 instruments',
  );
  await expect(page.getByText('Bientôt')).toBeVisible();
});

test.describe('appearance', () => {
  test('an admin changes the name and the accent colour, shown at once before sign-in', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/band/appearance');
    await page.getByLabel('Nom de la fanfare').fill('Les Cuivres du Jeudi');
    await page.getByRole('radio', { name: 'Menthe' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page).toHaveURL('/band');
    expect(sql('SELECT name, defaultAccentTheme, defaultLanguage FROM band')).toBe(
      'Les Cuivres du Jeudi\tmint\tfr',
    );
    // The admin follows the colour of the band: it changes for them too.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint');

    // And for whoever is not signed in.
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await expect(page.getByText('Les Cuivres du Jeudi')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint');
  });

  test('the name is required, and nothing is saved without it', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/appearance');
    await page.getByLabel('Nom de la fanfare').fill('  ');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('Il manque le nom de la fanfare.')).toBeVisible();
    await expect(page.getByLabel('Nom de la fanfare')).toBeFocused();
    expect(sql('SELECT name FROM band')).toBe('La Fanfare des Cuivres Déchaînés');
  });

  test('a logo is given, then removed', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/appearance');
    const logo = page.getByRole('group', { name: 'Logo' });
    await logo
      .locator('input[type=file]')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png(64) });
    await expect(logo.locator('img')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page).toHaveURL('/band');
    expect(storedFiles('band').length).toBeGreaterThan(0);
    expect(sql('SELECT logoPath IS NOT NULL FROM band')).toBe('1');

    await page.goto('/band/appearance');
    await page
      .getByRole('group', { name: 'Logo' })
      .getByRole('button', { name: 'Retirer' })
      .click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page).toHaveURL('/band');
    expect(sql('SELECT logoPath IS NULL FROM band')).toBe('1');
    expect(storedFiles('band')).toEqual([]);
  });
});

test.describe('sections and instruments', () => {
  test('each instrument says how many members play it', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/sections');

    await expect(card(page, 'Trompette')).toContainText('2 fanfarons');
    await expect(
      card(page, 'Saxophone').locator('.ListRow').filter({ hasText: 'Sax Ténor' }),
    ).toContainText('1 fanfaron');
    await expect(
      card(page, 'Saxophone').locator('.ListRow').filter({ hasText: 'Sax Alto' }),
    ).toContainText('Personne n’en joue');
  });

  test('an admin adds a section with its pictogram, and an instrument in it', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/sections');
    await page.getByRole('button', { name: 'Ajouter un pupitre' }).click();
    await sheet(page).getByLabel('Nom').fill('Clarinette');
    await sheet(page).getByRole('radio', { name: 'Clarinette' }).check();
    await save(page).click();

    await expect(card(page, 'Clarinette')).toBeVisible();
    expect(sql("SELECT icon, position FROM section WHERE name = 'Clarinette'")).toBe('clarinet\t4');

    await card(page, 'Clarinette').getByRole('button', { name: 'Ajouter un instrument' }).click();
    await sheet(page).getByLabel('Nom').fill('Clarinette basse');
    await sheet(page).getByRole('button', { name: 'Ajouter l’instrument' }).click();
    await expect(card(page, 'Clarinette')).toContainText('Clarinette basse');
    await expect(card(page, 'Clarinette')).toContainText('Personne n’en joue');
  });

  test('a section is renamed, given another pictogram and moved', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/sections');
    await page.getByRole('button', { name: 'Modifier le pupitre Souba' }).click();
    await expect(sheet(page).getByText('3e sur 3')).toBeVisible();
    await sheet(page).getByLabel('Nom').fill('Soubassophones');
    await sheet(page).getByRole('radio', { name: 'Soubassophone' }).check();
    await sheet(page).getByRole('button', { name: 'Monter' }).click();
    await sheet(page).getByRole('button', { name: 'Monter' }).click();
    await expect(sheet(page).getByText('1er sur 3')).toBeVisible();
    await save(page).click();

    await expect(page.locator('.SectionCard h2')).toHaveText([
      'Soubassophones',
      'Trompette',
      'Saxophone',
    ]);
    expect(sql("SELECT icon, position FROM section WHERE name = 'Soubassophones'")).toBe(
      'sousaphone\t1',
    );
  });

  test('a name already taken is refused, on its field', async ({ page }) => {
    await signIn(page);
    await page.goto('/band/sections');
    await page.getByRole('button', { name: 'Modifier le pupitre Souba' }).click();
    await sheet(page).getByLabel('Nom').fill('trompette');
    await save(page).click();

    await expect(sheet(page).getByText('Ce nom est déjà pris. Choisis-en un autre.')).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM section WHERE name = 'Souba'")).toBe('1');
  });

  test('what is still used cannot be deleted, and the screen says why, with the numbers', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/band/sections');

    await page.getByRole('button', { name: 'Modifier le pupitre Saxophone' }).click();
    await expect(sheet(page).getByRole('button', { name: 'Supprimer ce pupitre' })).toBeDisabled();
    await expect(sheet(page)).toContainText('Saxophone a encore 2 instruments et 1 fanfaron.');
    await sheet(page).getByRole('button', { name: 'Fermer' }).click();

    await page.getByRole('button', { name: 'Modifier Sax Ténor' }).click();
    await expect(
      sheet(page).getByRole('button', { name: 'Retirer cet instrument' }),
    ).toBeDisabled();
    await expect(sheet(page)).toContainText(
      '1 fanfaron en joue. Change son instrument avant de le retirer.',
    );
    await sheet(page).getByRole('button', { name: 'Fermer' }).click();

    // An instrument nobody plays goes; a section left empty can then go too.
    await page.getByRole('button', { name: 'Modifier Souba', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Retirer cet instrument' }).click();
    await expect(card(page, 'Souba')).not.toContainText('Personne n’en joue');
    await page.getByRole('button', { name: 'Modifier le pupitre Souba' }).click();
    await sheet(page).getByRole('button', { name: 'Supprimer ce pupitre' }).click();
    await expect(card(page, 'Souba')).toHaveCount(0);
    expect(sql("SELECT COUNT(*) FROM section WHERE name = 'Souba'")).toBe('0');
  });

  test('moving an instrument to another section takes its members with it, and says so', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/band/sections');
    await page.getByRole('button', { name: 'Modifier Sax Ténor' }).click();
    await expect(sheet(page)).toContainText('Le changer de pupitre emmène son fanfaron avec lui.');
    await sheet(page).getByLabel('Pupitre').selectOption({ label: 'Souba' });
    await save(page).click();

    await expect(card(page, 'Souba')).toContainText('Sax Ténor');
    await expect(card(page, 'Saxophone')).not.toContainText('Sax Ténor');
    // Jibé is now in the section Souba: his directory filter follows.
    await page.goto('/members');
    await page.getByRole('button', { name: 'Mon pupitre' }).click();
    await expect(page.getByText('Ton pupitre, Souba')).toBeVisible();
  });
});

test('only an admin opens the settings of the band', async ({ page }) => {
  for (const email of ['momo@example.org', 'zaza@example.org']) {
    await page.context().clearCookies();
    await signIn(page, email, memberPassword);
    for (const address of ['/band', '/band/appearance', '/band/sections']) {
      await page.goto(address);
      await expect(title(page), `${email} ${address}`).toHaveText('Pas par ici');
      await expect(page.getByText('réservée aux admins')).toBeVisible();
      await expect(page.locator('.SectionCard')).toHaveCount(0);
    }
  }
  await page.getByRole('button', { name: 'Retour aux réglages' }).click();
  await expect(page).toHaveURL('/settings');
});

test('at the largest text size with every option on, the settings of the band can still be used', async ({
  page,
}) => {
  sql(`UPDATE member SET textSizePercent = 200, hasIncreasedSpacing = 1, hasLegibleFont = 1, hasHighContrast = 1
       WHERE email = '${admin.email}'`);
  await signIn(page);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  for (const address of ['/band', '/band/appearance', '/band/sections']) {
    await page.goto(address);
    await expect(title(page)).toBeVisible();
    expect(await overflow(), address).toBeLessThanOrEqual(0);
  }
  await page.getByRole('button', { name: 'Modifier le pupitre Saxophone' }).click();
  await expect(sheet(page).getByRole('radio', { name: 'Saxophone' })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
