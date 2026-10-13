import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { addMember, admin, install, memberPassword } from './support/scenario.ts';

// The frame of the app once signed in (TabBar on a phone, SideNav on a
// desktop) and the directory of the band with the sheet of a member. Rules:
// model/members.md, "Display" (directory) and "Access rights".

// Installed with: Trompette (Trompette), Saxophone (Sax Alto, Sax Ténor),
// Souba (Souba). Jibé the admin plays the Sax Ténor; the members added below
// get the first instrument, the Trompette, unless said otherwise.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Tonton Fred', status: 'POWER_MEMBER' });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
  addMember({ nickname: 'Bouboule', status: 'LEFT' });
  sql(
    `UPDATE member SET instrumentId = (SELECT id FROM instrument WHERE name = 'Sax Alto') WHERE nickname = 'Momo'`,
  );
  sql(`UPDATE member SET firstName = 'Isabelle', lastName = 'Garnier', mobilePhone = '+33612345678',
       streetAddress = '12 bis rue des Tanneurs', postalCode = '69007', city = 'Lyon', countryCode = 'FR',
       addressInstructions = 'Code 4812B' WHERE nickname = 'Zaza'`);
});

async function signIn(page: Page, email = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/members');
}

const cards = (page: Page) => page.locator('.MemberCard');
// The nickname of each card, without the mark that follows it.
const names = (page: Page) =>
  cards(page)
    .locator('.MemberCard-nickname')
    .evaluateAll((all) => all.map((one) => one.firstChild?.textContent?.trim() ?? ''));
const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Navigation' }).filter({ visible: true });

test.describe('the frame of the app', () => {
  test('on a phone the five tabs float at the bottom, and say which one is open', async ({
    page,
  }) => {
    await signIn(page);

    await expect(nav(page).getByRole('link')).toHaveText([
      'Accueil',
      'Morceaux',
      'Plans',
      'Fanfarons',
      'Réglages',
    ]);
    await expect(nav(page).getByRole('link', { name: 'Fanfarons' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav(page).getByRole('link', { name: 'Morceaux' }).click();
    await expect(page).toHaveURL('/songs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Morceaux');
    await expect(nav(page).getByRole('link', { name: 'Morceaux' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the tabs of the features to come say so', async ({ page }) => {
    await signIn(page);

    for (const [address, title] of [
      ['/', 'Accueil'],
      ['/gigs', 'Plans'],
    ] as const) {
      await page.goto(address);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByText(/arrive(nt)? bientôt/)).toBeVisible();
    }
  });

  test('on a desktop the navigation is the menu on the left, with the band and the member', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    const menu = nav(page);
    await expect(menu).toHaveCount(1);
    await expect(menu).toContainText('La Fanfare des Cuivres Déchaînés');
    await expect(menu).toContainText('Jibé');
    await expect(menu).toContainText('Sax Ténor');
    await expect(menu.getByRole('link', { name: 'Fanfarons' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const box = await menu.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(box).toMatchObject({ x: 16, y: 16, width: 264, height: 768 });
  });

  test('from a text size of 160 %, the tabs show their icons alone and keep their names', async ({
    page,
  }) => {
    sql(`UPDATE member SET textSizePercent = 160 WHERE email = '${admin.email}'`);
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '160');

    const tab = nav(page).getByRole('link', { name: 'Fanfarons' });
    await expect(tab).toBeVisible();
    // The label is still there for a screen reader, in a box of one pixel.
    const label = await tab.locator('span').evaluate((span) => span.getBoundingClientRect().width);
    expect(label).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('the directory', () => {
  test('shows the active members by nickname, and nobody else', async ({ page }) => {
    await signIn(page);

    expect(await names(page)).toEqual(['Jibé', 'Momo', 'Zaza']);
    await expect(page.getByText('3 fanfarons, de A à Z.')).toBeVisible();
    // Each card says the instrument.
    await expect(cards(page).filter({ hasText: 'Jibé' })).toContainText('Sax Ténor');
  });

  test('"Power members" adds them, each one marked', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Power members' }).click();

    expect(await names(page)).toEqual(['Jibé', 'Momo', 'Tonton Fred', 'Zaza']);
    await expect(page.getByText('4 fanfarons, power members compris.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Power members' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The mark is an icon, named for who cannot see it.
    await expect(cards(page).filter({ hasText: 'Tonton Fred' })).toContainText('Power member');
    await expect(cards(page).filter({ hasText: 'Zaza' })).not.toContainText('Power member');
  });

  test('"Mon pupitre" keeps the section of the signed-in member', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Mon pupitre' }).click();

    // Jibé plays the Sax Ténor and Momo the Sax Alto: one section, Saxophone.
    expect(await names(page)).toEqual(['Jibé', 'Momo']);
    await expect(
      page.getByText('Ton pupitre, Saxophone : 2 fanfarons, toi compris.'),
    ).toBeVisible();
  });

  test('never shows an invited member or one who left, even to who manages members', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Power members' }).click();

    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByText('Kiki')).toHaveCount(0);
    await expect(page.getByText('Bouboule')).toHaveCount(0);
  });

  test('only who manages members is offered to manage them', async ({ page }) => {
    await signIn(page, 'zaza@example.org', memberPassword);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Gérer' })).toHaveCount(0);

    await page.context().clearCookies();
    await signIn(page, 'momo@example.org', memberPassword);
    await expect(page.getByRole('button', { name: 'Gérer' })).toBeVisible();
  });

  test('a card opens the sheet of the member: how to reach them, and nothing that is missing', async ({
    page,
  }) => {
    await signIn(page);
    await cards(page).filter({ hasText: 'Zaza' }).click();

    const sheet = page.getByRole('dialog', { name: 'Zaza' });
    await expect(sheet).toContainText('Isabelle Garnier');
    await expect(sheet).toContainText('Trompette');
    await expect(sheet.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
      'href',
      'tel:+33612345678',
    );
    await expect(sheet.getByRole('link', { name: 'Écrire' })).toHaveAttribute(
      'href',
      'mailto:zaza@example.org',
    );
    // The phone is shown the local way.
    await expect(sheet).toContainText('06 12 34 56 78');
    await expect(sheet).toContainText('12 bis rue des Tanneurs, 69007 Lyon');
    await expect(sheet).toContainText('Code 4812B');
    await expect(sheet.getByRole('link', { name: 'Y aller' })).toHaveAttribute('href', /Tanneurs/);
    // The Discord action waits for its feature.
    await expect(sheet.getByText('Discord')).toHaveCount(0);

    await sheet.getByRole('button', { name: 'Fermer' }).click();
    await cards(page).filter({ hasText: 'Momo' }).click();
    const other = page.getByRole('dialog', { name: 'Momo' });
    // Momo gave no phone and no address: no line, no action for them.
    await expect(other.getByRole('link', { name: 'Écrire' })).toBeVisible();
    await expect(other.getByRole('link', { name: 'Appeler' })).toHaveCount(0);
    await expect(other.getByRole('link', { name: 'Y aller' })).toHaveCount(0);
  });

  test('at the largest text size with every option on, the directory can still be used', async ({
    page,
  }) => {
    sql(`UPDATE member SET textSizePercent = 200, hasIncreasedSpacing = 1, hasLegibleFont = 1,
         hasHighContrast = 1,
         hasReducedMotion = 1, hasExtendedTimeouts = 1 WHERE email = '${admin.email}'`);
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await cards(page).filter({ hasText: 'Zaza' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Zaza' }).getByRole('link', { name: 'Écrire' }),
    ).toBeVisible();
  });
});
