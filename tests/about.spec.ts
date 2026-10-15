import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase } from './support/database.ts';
import { addMember, install, memberPassword } from './support/scenario.ts';

// The version of the app and its changelog, in the settings (Figma: Members,
// section 5, "Settings — about"; docs/architecture.md, "Versions and the
// changelog"). The screen reads version.json and changelog.json, two files
// written by the build; the tests give it other versions through them.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  // A member with no role at all: the screen is for everyone.
  addMember({ nickname: 'Zaza' });
});

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill('zaza@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(memberPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/');
}

const build = { version: '2.3.0', builtAt: '2026-11-20T10:00:00Z', commit: 'local' };
const current = {
  version: '2.3.0',
  date: '2026-11-20',
  changes: [
    { kind: 'added', text: 'Setlists can be printed.' },
    { kind: 'fixed', text: 'The map opens again.' },
    { kind: 'changed', text: 'Bigger buttons.' },
  ],
};
const earlier = {
  version: '2.2.0',
  date: '2026-11-02',
  changes: [{ kind: 'added', text: 'Quotes.' }],
};
const french = {
  '2.3.0': {
    'Setlists can be printed.': 'Les setlists s’impriment.',
    'Bigger buttons.': 'Des boutons plus grands.',
  },
  '2.2.0': { 'Quotes.': 'Les devis.' },
};

/** The build and the changelog the screen is given. */
async function given(page: Page, entries: object[]) {
  await page.route('**/version.json', (route) => route.fulfill({ json: build }));
  await page.route('**/changelog.json', (route) =>
    route.fulfill({ json: { en: entries, fr: french } }),
  );
}

const title = (page: Page) => page.getByRole('heading', { level: 1 });

test('the settings lead to the version of the app and its changes, grouped by kind', async ({
  page,
}) => {
  await given(page, [current, earlier]);
  await signIn(page);
  await page.goto('/settings');

  const entry = page.getByRole('link', { name: /À propos/ });
  await expect(entry).toContainText('Version 2.3.0 · les nouveautés');
  await entry.click();

  await expect(title(page)).toHaveText('À propos');
  await expect(page.getByText('Ce qui change dans l’app, version après version.')).toBeVisible();
  await expect(page.getByText('Version 2.3.0', { exact: true })).toBeVisible();
  await expect(page.getByText('Publiée le 20 novembre 2026')).toBeVisible();

  // Each kind under its chip, in the order Nouveau, Amélioré, Corrigé.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Nouveau',
    'Amélioré',
    'Corrigé',
    'Versions précédentes',
  ]);
  const group = (name: string) =>
    page.locator('.settings-changeGroup').filter({ has: page.getByRole('heading', { name }) });
  await expect(group('Nouveau').getByRole('listitem')).toHaveText(['Les setlists s’impriment.']);
  await expect(group('Amélioré').getByRole('listitem')).toHaveText(['Des boutons plus grands.']);
  // A line without French is shown in English, never left out.
  await expect(group('Corrigé').getByRole('listitem')).toHaveText(['The map opens again.']);

  // An earlier version is folded: its row opens it in a panel.
  await expect(page.getByRole('heading', { name: 'Versions précédentes' })).toBeVisible();
  await page.getByRole('button', { name: /2\.2\.0/ }).click();
  const panel = page.getByRole('dialog', { name: 'Version 2.2.0' });
  await expect(panel.getByText('Publiée le 2 novembre 2026')).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveText(['Les devis.']);
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('with a single version, there is no earlier one to show', async ({ page }) => {
  await given(page, [current]);
  await signIn(page);
  await page.goto('/settings/about');

  await expect(page.getByText('Version 2.3.0', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Versions précédentes' })).toHaveCount(0);
});

test('a version the changelog does not know shows every entry as an earlier one', async ({
  page,
}) => {
  await given(page, [earlier]);
  await signIn(page);
  await page.goto('/settings/about');

  await expect(page.getByText('Version 2.3.0', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Versions précédentes' })).toBeVisible();
  await expect(page.getByRole('button', { name: /2\.2\.0/ })).toBeVisible();
});

test('the real build says its version, and every line of it has its French', async ({ page }) => {
  await signIn(page);
  const written = await (await page.request.get('/version.json')).json();
  await page.goto('/settings/about');

  await expect(page.getByText(`Version ${written.version}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  // No English line in the French screen of the real changelog.
  const changelog = await (await page.request.get('/changelog.json')).json();
  const english = changelog.en
    .find((entry: { version: string }) => entry.version === written.version)
    .changes.map((change: { text: string }) => change.text);
  for (const line of await page.getByRole('listitem').allTextContents()) {
    expect(english).not.toContain(line);
  }
});

test('on a desktop an earlier version opens as a dialog beside the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await given(page, [current, earlier]);
  await signIn(page);
  await page.goto('/settings/about');

  await page.getByRole('button', { name: /2\.2\.0/ }).click();
  const panel = page.getByRole('dialog', { name: 'Version 2.2.0' });
  await expect(panel).toBeVisible();
  const box = await panel.locator('.Panel-surface').boundingBox();
  // Centred over the window, not risen from its bottom edge.
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(800 - 16);
});
