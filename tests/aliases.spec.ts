import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { addMember, admin, install, memberPassword } from './support/scenario.ts';

// The known spellings of the instruments, in the settings of the band: the
// list, the sheet of an instrument, and who reaches them. Rules:
// model/songs.md, entry 2, "Managing the aliases" and "Access rights".

// Installed with Trompette, Sax Alto, Sax Ténor and Souba, each with the
// aliases of the starting library. Jibé is the admin, Sisi manages songs
// without being an admin, Zaza is a plain member.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER'] });
});

async function signIn(page: Page, email = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Signing in leads to the home screen; these tests start from the directory.
  await expect(page).toHaveURL('/');
  await page.goto('/members');
  await expect(page).toHaveURL('/members');
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const sheet = (page: Page) => page.getByRole('dialog');
const row = (page: Page, text: string) => page.locator('main .ListRow').filter({ hasText: text });
const aliasesOf = (instrument: string) =>
  sql(
    `SELECT a.alias FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId
     WHERE i.name = '${instrument}' ORDER BY a.alias`,
  ).split('\n');

/** Opens the sheet of an instrument from the list. */
async function open(page: Page, instrument: string) {
  await page.goto('/band/spellings');
  await page.getByRole('button', { name: new RegExp(`${instrument}$`) }).click();
  await expect(sheet(page).getByRole('heading', { name: instrument })).toBeVisible();
}

test('an admin reaches the list from the band settings: each instrument with its spellings', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: /Réglages de la fanfare/ }).click();
  await page.getByRole('link', { name: /Orthographes connues/ }).click();

  await expect(page).toHaveURL('/band/spellings');
  await expect(title(page)).toHaveText('Orthographes connues');
  // In the order of the band, the spellings from A to Z under each name.
  await expect(page.locator('main .ListRow .ListRow-texts > :first-child')).toHaveText([
    'Trompette',
    'Sax Alto',
    'Sax Ténor',
    'Souba',
  ]);
  await expect(row(page, 'Trompette')).toContainText('cornet, tp, trompettes, trumpet');
  await expect(row(page, 'Souba')).toContainText('sb, soubassophone, sousaphone, tuba');
});

test('the sheet of an instrument lists its spellings, each with its deletion', async ({ page }) => {
  await signIn(page);
  await open(page, 'Souba');

  for (const spelling of ['sb', 'soubassophone', 'sousaphone', 'tuba']) {
    await expect(sheet(page).getByRole('button', { name: `« ${spelling} »` })).toBeVisible();
  }
  // The field waits behind its line.
  await expect(sheet(page).getByRole('textbox')).toHaveCount(0);
});

test('a spelling is added from the sheet, saved at once and cleaned', async ({ page }) => {
  await signIn(page);
  await open(page, 'Souba');

  await sheet(page).locator('button[data-add]').click();
  const field = sheet(page).getByRole('textbox');
  await expect(field).toBeFocused();
  await field.fill('Gros-Tuyau');
  await field.press('Enter');

  await expect(sheet(page).getByRole('button', { name: '« gros tuyau »' })).toBeVisible();
  expect(aliasesOf('Souba')).toContain('gros tuyau');
  // Ready for the next one.
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  // The list behind the sheet shows it too.
  await page.keyboard.press('Escape');
  await expect(row(page, 'Souba')).toContainText('gros tuyau, sb');
});

test('a spelling another instrument has is refused, and the instrument is named', async ({
  page,
}) => {
  await signIn(page);
  await open(page, 'Souba');
  const before = sql('SELECT COUNT(*) FROM instrumentAlias');

  await sheet(page).locator('button[data-add]').click();
  const field = sheet(page).getByRole('textbox');
  await field.fill('tp');
  await sheet(page).locator('button[type="submit"]').click();

  await expect(field).toHaveAttribute('aria-invalid', 'true');
  // The error is tied to the field, and names who has the spelling.
  await expect(field).toHaveAccessibleDescription(/«\stp\s».*Trompette/);
  expect(sql('SELECT COUNT(*) FROM instrumentAlias')).toBe(before);

  // Typing something else clears it.
  await field.fill('tpx');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});

test('a spelling is deleted from the sheet, and the focus goes to the next one', async ({
  page,
}) => {
  await signIn(page);
  await open(page, 'Souba');

  await sheet(page).getByRole('button', { name: '« soubassophone »' }).click();

  await expect(sheet(page).getByRole('button', { name: '« soubassophone »' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: '« sousaphone »' })).toBeFocused();
  expect(aliasesOf('Souba')).toEqual(['sb', 'sousaphone', 'tuba']);
});

test('an instrument without any spelling shows the line that adds one, which takes the focus after the last deletion', async ({
  page,
}) => {
  sql(`DELETE a FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId
       WHERE i.name = 'Souba' AND a.alias <> 'sb'`);
  await signIn(page);
  await open(page, 'Souba');

  await sheet(page).getByRole('button', { name: '« sb »' }).click();

  await expect(sheet(page).locator('[data-delete]')).toHaveCount(0);
  await expect(sheet(page).locator('button[data-add]')).toBeFocused();
  expect(
    sql(
      "SELECT COUNT(*) FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId WHERE i.name = 'Souba'",
    ),
  ).toBe('0');
});

test('who manages songs without being an admin sees this one entry of the band settings', async ({
  page,
}) => {
  await signIn(page, 'sisi@example.org', memberPassword);
  await page.goto('/settings');
  await page.getByRole('link', { name: /Réglages de la fanfare/ }).click();

  await expect(page).toHaveURL('/band');
  // One sheet, one row: nothing else of the band settings.
  await expect(page.locator('main .Sheet')).toHaveCount(1);
  await expect(page.locator('main .NavRow')).toHaveCount(1);
  await page.locator('main .NavRow').click();
  await expect(page).toHaveURL('/band/spellings');
  await expect(row(page, 'Souba')).toContainText('sb');

  // And they manage the spellings there.
  await page.getByRole('button', { name: /Souba$/ }).click();
  await sheet(page).getByRole('button', { name: '« sb »' }).click();
  await expect(sheet(page).getByRole('button', { name: '« sb »' })).toHaveCount(0);
  expect(aliasesOf('Souba')).not.toContain('sb');

  // The rest stays reserved to admins.
  await page.goto('/band/appearance');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.goto('/band/sections');
  await expect(page.locator('.SectionCard')).toHaveCount(0);
});

test('a member who does not manage songs has no entry, and is sent away from the address', async ({
  page,
}) => {
  await signIn(page, 'zaza@example.org', memberPassword);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /Réglages de la fanfare/ })).toHaveCount(0);

  await page.goto('/band/spellings');
  await expect(page).toHaveURL('/settings');

  await page.goto('/band');
  await expect(page.locator('main .NavRow')).toHaveCount(0);
});
