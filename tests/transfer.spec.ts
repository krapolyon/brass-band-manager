import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { emptyMailbox, receivedMails } from './support/mail.ts';
import { addMember, admin, install, memberPassword } from './support/scenario.ts';
import { emptyImportFolder, emptyStorage } from './support/storage.ts';
import { makeZip, readZip } from './support/zip.ts';

// The screens "Exporter" and "Importer" (0.4.0, issue #43, and #50 for the
// invitations; Figma, Band settings, sections 5, 9 and 10). The band and its
// people are made up.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  emptyImportFolder();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
});

async function signIn(page: Page, email = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/');
}

const souba = () => sql("SELECT name FROM instrument WHERE name = 'Souba'");
const members = (rows: string[][]) =>
  `email;nickname;firstName;lastName;instrument\r\n${rows.map((row) => row.join(';')).join('\r\n')}\r\n`;
const drop = (page: Page, zip: Buffer, name = 'reprise-krapos.zip') =>
  page
    .locator('.DropZone input[type=file]')
    .setInputFiles({ name, mimeType: 'application/zip', buffer: zip });

test('a reprise is dropped, read, and loaded once the admin confirms; the new members are invited', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/band');
  await page.getByRole('link', { name: /Exporter et importer/ }).click();
  await expect(page).toHaveURL('/band/import');
  await expect(page.getByRole('link', { name: 'Télécharger les modèles' })).toHaveAttribute(
    'href',
    '/api/transfer/templates',
  );

  await drop(
    page,
    makeZip({
      'members.csv': members([
        ['kiki@example.org', 'Kiki', 'Christine', 'Dupré', souba()],
        ['riton@example.org', 'Riton', 'Henri', 'Blanc', souba()],
      ]),
    }),
  );
  await expect(page.getByText('reprise-krapos', { exact: false }).first()).toBeVisible();
  const fanfarons = page.getByRole('checkbox', { name: /Fanfarons/ });
  await expect(fanfarons).toBeChecked();
  await expect(page.getByText('2 fanfarons et 0 photo · 2 nouveaux')).toBeVisible();
  // Songs, gigs and answers are not in this file.
  await expect(page.getByRole('checkbox', { name: /Morceaux/ })).toBeDisabled();
  await expect(
    page.getByRole('switch', { name: 'Envoyer les invitations par e-mail' }),
  ).toBeChecked();

  await page.getByRole('button', { name: 'Charger les données' }).click();
  const panel = page.getByRole('dialog', { name: 'Ton mot de passe' });
  await panel.getByLabel('Mot de passe', { exact: true }).fill('wrong-password-1');
  await panel.getByRole('button', { name: 'Charger les données' }).click();
  await expect(panel.getByText('Ce n’est pas ton mot de passe', { exact: false })).toBeVisible();
  await panel.getByLabel('Mot de passe', { exact: true }).fill(admin.password);
  await panel.getByRole('button', { name: 'Charger les données' }).click();

  await expect(page.getByText('Les données sont chargées.')).toBeVisible();
  expect(
    sql("SELECT COUNT(*) FROM member WHERE nickname IN ('Kiki', 'Riton') AND status = 'INVITED'"),
  ).toBe('2');
  expect((await receivedMails(2)).map((mail) => mail.to).sort()).toEqual([
    'kiki@example.org',
    'riton@example.org',
  ]);
});

test('a reprise with faults lists every line to correct, and loads nothing', async ({ page }) => {
  await signIn(page);
  await page.goto('/band/import');
  await drop(
    page,
    makeZip({
      'members.csv': members([
        ['kiki@example.org', 'Kiki', 'Christine', 'Dupré', 'Banjo'],
        ['lulu@example', 'Lulu', 'Lucie', 'Marchand', souba()],
      ]),
    }),
  );

  await expect(page.getByText('Rien n’est chargé', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2 lignes à corriger' })).toBeVisible();
  await expect(page.getByText('members.csv, ligne 2')).toBeVisible();
  await expect(
    page.getByText('L’instrument « Banjo » n’existe pas ici.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('L’adresse lulu@example est incomplète.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Charger les données' })).toBeDisabled();
  expect(sql("SELECT COUNT(*) FROM member WHERE nickname = 'Kiki'")).toBe('0');

  await page.getByRole('button', { name: 'Redéposer un zip' }).click();
  await expect(page.getByText('Dépose le fichier .zip')).toBeVisible();
});

test('the export ticks what a part needs, asks the password again, and saves the zip', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/band/import');
  await page.getByRole('link', { name: 'Exporter d’abord' }).click();
  await expect(page).toHaveURL('/band/export');

  const config = page.getByRole('checkbox', { name: /Config générale/ });
  const gigs = page.getByRole('checkbox', { name: /Plans/ });
  await config.uncheck();
  await expect(gigs).not.toBeChecked();
  await gigs.check();
  await expect(config).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Fanfarons/ })).toBeChecked();

  await page.getByRole('button', { name: 'Exporter en .zip' }).click();
  const panel = page.getByRole('dialog', { name: 'Ton mot de passe' });
  await panel.getByLabel('Mot de passe', { exact: true }).fill(admin.password);
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Exporter en .zip' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^la-fanfare-des-cuivres-dechaines-.*\.zip$/);
  const zip = readZip(
    Buffer.from(await (await import('node:fs/promises')).readFile(await file.path())),
  );
  expect(JSON.parse(zip.get('manifest.json')?.toString() ?? '{}').parts).toEqual([
    'settings',
    'members',
    'gigs',
  ]);
});

test('a member who is not admin is told the screens are for admins', async ({ page }) => {
  await signIn(page, 'zaza@example.org', memberPassword);
  for (const address of ['/band/import', '/band/export']) {
    await page.goto(address);
    await expect(page.getByRole('button', { name: 'Exporter en .zip' })).toHaveCount(0);
    await expect(page.locator('.DropZone')).toHaveCount(0);
  }
});
