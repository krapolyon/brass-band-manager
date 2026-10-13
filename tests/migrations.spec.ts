import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import {
  dropTables,
  forgetLast,
  LAST,
  repairMigrations,
  unapplyLast,
} from './support/migrations.ts';
import { addMember, admin, install, installInput, memberPassword } from './support/scenario.ts';

// The screen where an admin applies the migrations, and the notice that tells
// them some wait. Rules: model/band.md, "Updating the database". The screen
// is not drawn in Figma (docs/architecture.md, "Deployment").

test.beforeEach(async ({ playwright, baseURL }) => {
  repairMigrations();
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

test.afterAll(repairMigrations);

async function signIn(page: Page, email = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/');
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const panel = (page: Page) => page.getByRole('dialog');
const isRecorded = () => sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`);

test('an admin is told on the home screen, applies the migration and sees the result', async ({
  page,
}) => {
  unapplyLast();
  await signIn(page);

  await expect(page.getByRole('alert')).toContainText('Une mise à jour de la base attend.');
  await page.getByRole('button', { name: 'Voir les mises à jour' }).click();

  await expect(title(page)).toHaveText('Mise à jour de la base');
  await expect(page.getByRole('heading', { name: 'En attente (1)' })).toBeVisible();
  await expect(page.getByText(LAST)).toBeVisible();
  await expect(page.getByText('Sauvegarde la base avant de continuer')).toBeVisible();

  await page.getByRole('button', { name: 'Appliquer les mises à jour' }).click();
  await expect(panel(page)).toContainText('Une mise à jour va modifier la base de données.');
  // The field of the password has the focus: the keyboard is enough.
  await expect(panel(page).getByLabel('Mot de passe', { exact: true })).toBeFocused();
  await page.keyboard.type(admin.password);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('status')).toContainText('La mise à jour est appliquée.');
  await expect(panel(page)).toBeHidden();
  // The button that opened the panel is gone: the focus is on what happened.
  await expect(page.locator(':focus')).toContainText('La mise à jour est appliquée.');
  await expect(page.getByRole('heading', { name: 'Appliquées' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Appliquer les mises à jour' })).toBeHidden();
  expect(isRecorded()).toBe('1');

  // Nothing waits any more: the notice left the home screen.
  await page.goto('/');
  await expect(title(page)).toBeVisible();
  await expect(page.getByText('mise à jour de la base')).toBeHidden();
});

test('the band settings lead to the screen and say how many wait', async ({ page }) => {
  await signIn(page);
  await page.goto('/band');
  const row = page.getByRole('link', { name: /Mise à jour de la base/ });
  await expect(row).toContainText('La base est à jour');

  await row.click();
  await expect(page).toHaveURL('/band/migrations');
  await expect(page.getByText('La base est à jour. Rien à faire ici.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Appliquer les mises à jour' })).toBeHidden();

  unapplyLast();
  await page.goto('/band');
  await expect(page.getByRole('link', { name: /Mise à jour de la base/ })).toContainText(
    '1 mise à jour en attente',
  );
  await expect(page.getByRole('alert')).toContainText('Une mise à jour de la base attend.');
});

test('a wrong password is said on its field, and nothing is applied', async ({ page }) => {
  unapplyLast();
  await signIn(page);
  await page.goto('/band/migrations');
  await page.getByRole('button', { name: 'Appliquer les mises à jour' }).click();

  await panel(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(panel(page).getByText('Il manque ton mot de passe.')).toBeVisible();

  await panel(page).getByLabel('Mot de passe', { exact: true }).fill('pas-le-bon-du-tout');
  await panel(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(panel(page).getByText('Ce n’est pas ton mot de passe actuel.')).toBeVisible();
  expect(isRecorded()).toBe('0');

  await panel(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'En attente (1)' })).toBeVisible();
});

test('a migration that fails is named, with what the database answered', async ({ page }) => {
  forgetLast();
  await signIn(page);
  await page.goto('/band/migrations');
  await page.getByRole('button', { name: 'Appliquer les mises à jour' }).click();
  await panel(page).getByLabel('Mot de passe', { exact: true }).fill(admin.password);
  await panel(page).getByRole('button', { name: 'Appliquer', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(`« ${LAST} » a échoué.`);
  await expect(page.getByRole('heading', { name: 'Réponse de la base' })).toBeVisible();
  await expect(page.getByText(/Duplicate column name 'proposedAt'/)).toBeVisible();
  // It still waits: the admin tries again once the database is repaired.
  await expect(page.getByRole('heading', { name: 'En attente (1)' })).toBeVisible();
  expect(isRecorded()).toBe('0');
});

test('a member who is not an admin sees neither the notice, nor the row, nor the screen', async ({
  page,
}) => {
  unapplyLast();
  const email = addMember({
    nickname: 'Lulu',
    roles: ['MEMBER_MANAGER', 'SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER'],
  });
  await signIn(page, email, memberPassword);

  await expect(title(page)).toBeVisible();
  await expect(page.getByText('mise à jour de la base')).toBeHidden();

  await page.goto('/band');
  await expect(title(page)).toHaveText('La fanfare');
  await expect(page.getByRole('link', { name: /Mise à jour de la base/ })).toBeHidden();

  await page.goto('/band/migrations');
  await expect(page.getByText('Cette page est réservée aux admins de la fanfare.')).toBeVisible();
  await expect(page.getByText(LAST)).toBeHidden();
});

test('on an empty database, a migration that fails is not said to be a wrong key', async ({
  page,
}) => {
  dropTables();
  // A table stands in the way of the first migration.
  sql('CREATE TABLE section (id INT PRIMARY KEY)');

  await page.goto('/install');
  await page.getByLabel('Clé d’installation').fill(installInput().installKey);
  await page.getByRole('button', { name: 'C’est parti' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'La clé est la bonne, mais la base de données n’a pas pu être préparée.',
  );
  await expect(page.getByText('Ce n’est pas la bonne clé.')).toBeHidden();
  await expect(page).toHaveURL('/install');
});
