import { expect, type Page, test } from '@playwright/test';
import { chooseAccessibility } from './support/accessibility.ts';
import { emptyDatabase, sql } from './support/database.ts';
import { admin, install, installInput } from './support/scenario.ts';

// The three steps of the install and its last screen, in a browser. The
// welcome screen is tested in tests/install.spec.ts, and what the API accepts
// and refuses in tests/api/install.spec.ts.
//
// Elements are found by what they are, never by their French text. The names
// of sections and instruments are data: they come from the starting library.

test.beforeEach(() => emptyDatabase());

const next = (page: Page) => page.locator('.FlowLayout-right button[type="submit"]');
const field = (page: Page, name: string) => page.locator(`input[name="${name}"]`);
const panel = (page: Page) => page.getByRole('dialog');
const cards = (page: Page) => page.locator('.SectionCard');
const card = (page: Page, name: string) =>
  cards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
const ticked = (page: Page) => page.locator('.SectionCard input[type="checkbox"]:checked');

async function toBand(page: Page) {
  await page.goto('/install');
  await field(page, 'installKey').fill(installInput().installKey);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/install/band');
}

async function toSections(page: Page) {
  await toBand(page);
  await field(page, 'bandName').fill('La Fanfare des Cuivres Déchaînés');
  await next(page).click();
  await expect(page).toHaveURL('/install/sections');
}

async function toMember(page: Page) {
  await toSections(page);
  await next(page).click();
  await expect(page).toHaveURL('/install/member');
}

async function fillMember(page: Page) {
  await field(page, 'firstName').fill(admin.firstName);
  await field(page, 'lastName').fill(admin.lastName);
  await field(page, 'nickname').fill(admin.nickname);
  await field(page, 'email').fill(admin.email);
  await field(page, 'password').fill(admin.password);
  await page.locator('button[aria-haspopup="dialog"]').click();
  await panel(page).getByRole('button', { name: admin.instrument, exact: true }).click();
}

const noOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
};

for (const step of ['band', 'sections', 'member']) {
  test(`the ${step} step opened without the install key sends back to the welcome screen`, async ({
    page,
  }) => {
    await page.goto(`/install/${step}`);
    await expect(page).toHaveURL('/install');
  });
}

test('the last screen opened by its address has nothing to show', async ({ page, request }) => {
  await install(request);
  await page.goto('/install/done');
  await expect(page).toHaveURL('/sign-in');
});

test.describe('step 1, the band', () => {
  test('the name of the band is required', async ({ page }) => {
    await toBand(page);
    await next(page).click();

    await expect(field(page, 'bandName')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/install/band');

    await field(page, 'bandName').fill('Les Cuivres');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a logo is shown, can be removed, and is not required', async ({ page }) => {
    await toBand(page);
    const preview = page.locator('.ImageField-preview img');
    await expect(preview).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
    });
    await expect(preview).toBeVisible();

    await page.locator('.ImageField button[data-kind="danger"]').click();
    await expect(preview).toHaveCount(0);

    await field(page, 'bandName').fill('Les Cuivres');
    await next(page).click();
    await expect(page).toHaveURL('/install/sections');
  });

  test('a file that is too heavy or not an image is refused, and says why', async ({ page }) => {
    await toBand(page);
    const error = page.locator('.ImageField[data-error="true"] .ImageField-hint');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(3_400_000),
    });
    // The weight is given in the format of the language: 3,4 in French.
    await expect(error).toContainText('3,4');
    await expect(page.locator('.ImageField-preview img')).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('3,4');
    await expect(page.locator('.ImageField-preview img')).toHaveCount(0);
  });

  test('going back keeps what was entered', async ({ page }) => {
    await toSections(page);
    await page.locator('.ScreenTop-navigation button').click();

    await expect(page).toHaveURL('/install/band');
    await expect(field(page, 'bandName')).toHaveValue('La Fanfare des Cuivres Déchaînés');
  });
});

test.describe('step 2, sections and instruments', () => {
  test('the starting library is there, its preselected instruments ticked', async ({ page }) => {
    await toSections(page);

    // The library ships 8 sections; the instruments of the first 6 are ticked,
    // the Sax Baryton excepted.
    await expect(cards(page)).toHaveCount(8);
    await expect(ticked(page)).toHaveCount(10);
    await expect(page.getByLabel('Sax Baryton', { exact: true })).not.toBeChecked();
    await expect(card(page, 'Clarinette').locator('input[type="checkbox"]')).not.toBeChecked();
  });

  test('with no instrument ticked, the step cannot be passed and says why', async ({ page }) => {
    await toSections(page);
    const caption = page.locator('.BottomBar-caption');
    await expect(caption).toHaveAttribute('data-kind', 'info');

    while ((await ticked(page).count()) > 0) {
      await ticked(page).first().uncheck();
    }

    await expect(next(page)).toBeDisabled();
    await expect(caption).toHaveAttribute('data-kind', 'warning');

    await card(page, 'Souba').locator('input[type="checkbox"]').check();
    await expect(next(page)).toBeEnabled();
  });

  test('an instrument is added to a section, ticked', async ({ page }) => {
    await toSections(page);
    await card(page, 'Souba').locator('button.ListRow').click();

    await expect(panel(page)).toBeVisible();
    // The field to type in has the focus, and the section is already chosen.
    await expect(field(page, 'instrumentName')).toBeFocused();
    await field(page, 'instrumentName').fill('Hélicon');
    await field(page, 'instrumentName').press('Enter');

    await expect(panel(page)).toBeHidden();
    await expect(card(page, 'Souba').getByLabel('Hélicon', { exact: true })).toBeChecked();
    await expect(ticked(page)).toHaveCount(11);
  });

  test('a name that is missing or already taken is refused', async ({ page }) => {
    await toSections(page);
    await card(page, 'Souba').locator('button.ListRow').click();
    await expect(field(page, 'instrumentName')).toBeFocused();

    await field(page, 'instrumentName').press('Enter');
    await expect(field(page, 'instrumentName')).toHaveAttribute('aria-invalid', 'true');

    // The same name for the database: case and accents do not count.
    await field(page, 'instrumentName').fill('flute');
    await field(page, 'instrumentName').press('Enter');
    await expect(field(page, 'instrumentName')).toHaveAttribute('aria-invalid', 'true');
    await expect(panel(page)).toBeVisible();
  });

  test('an instrument is renamed, moved to another section, and removed', async ({ page }) => {
    await toSections(page);
    const more = (name: string) =>
      page.locator('.SectionCard .ListRow').filter({ hasText: name }).locator('.IconButton');

    await more('Piccolo').click();
    await expect(field(page, 'instrumentName')).toHaveValue('Piccolo');
    await field(page, 'instrumentName').fill('Fifre');
    await panel(page).locator('select').selectOption({ label: 'Clarinette' });
    await panel(page).locator('button[type="submit"]').click();

    await expect(card(page, 'Clarinette').getByLabel('Fifre', { exact: true })).toBeVisible();
    await expect(card(page, 'Flûte').getByLabel('Fifre', { exact: true })).toHaveCount(0);

    await more('Fifre').click();
    await panel(page).locator('button[data-kind="danger"]').click();
    await expect(page.getByLabel('Fifre', { exact: true })).toHaveCount(0);
  });

  test('a section is added, renamed and moved up', async ({ page }) => {
    await toSections(page);
    await page.locator('.FlowLayout-start button').click();
    await field(page, 'sectionName').fill('Accordéon');
    await field(page, 'sectionName').press('Enter');
    await expect(cards(page)).toHaveCount(9);
    await expect(cards(page).last().getByRole('heading')).toHaveText('Accordéon');

    await cards(page).last().locator('.SectionCard-header .IconButton').click();
    await field(page, 'sectionName').fill('Soufflets');
    const [up, down] = [
      panel(page).locator('.FlowLayout-order button').first(),
      panel(page).locator('.FlowLayout-order button').last(),
    ];
    // Last of the list: it cannot go further down.
    await expect(down).toBeDisabled();
    await up.click();
    await up.click();
    await panel(page).locator('button[type="submit"]').click();

    await expect(cards(page).nth(6).getByRole('heading')).toHaveText('Soufflets');
  });

  test('a section is deleted only once it has no instrument left', async ({ page }) => {
    await toSections(page);
    const remove = panel(page).locator('.FlowLayout-panelActions button[data-kind="danger"]');

    await card(page, 'Clarinette').locator('.SectionCard-header .IconButton').click();
    await expect(remove).toBeDisabled();
    // The reason is given, and tied to the button for screen readers.
    await expect(remove).toHaveAttribute('aria-describedby', 'sectionDeleteNote');
    await page.keyboard.press('Escape');

    await card(page, 'Clarinette').locator('.ListRow .IconButton').click();
    await panel(page).locator('button[data-kind="danger"]').click();

    await card(page, 'Clarinette').locator('.SectionCard-header .IconButton').click();
    await remove.click();
    await expect(cards(page)).toHaveCount(7);
  });
});

test.describe('step 3, the first member', () => {
  test('every field is required, and each one says what is missing', async ({ page }) => {
    await toMember(page);
    await next(page).click();

    for (const name of ['firstName', 'lastName', 'nickname', 'email', 'password']) {
      await expect(field(page, name)).toHaveAttribute('aria-invalid', 'true');
    }
    await expect(page.locator('.TextField[data-error="true"] button[aria-haspopup]')).toBeVisible();
    // The focus is on the first field to fix.
    await expect(field(page, 'firstName')).toBeFocused();
    await expect(page).toHaveURL('/install/member');
    expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
  });

  test('an incomplete email and a short password are refused before sending', async ({ page }) => {
    await toMember(page);
    await fillMember(page);
    await field(page, 'email').fill('jb.morel@example');
    await field(page, 'password').fill('tubatuba');
    await next(page).click();

    await expect(field(page, 'email')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'password')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'firstName')).not.toHaveAttribute('aria-invalid', 'true');
    // The error says how many characters are missing: 2 out of 10.
    await expect(page.locator('.TextField[data-error="true"]').last()).toContainText('2');
  });

  test('the instrument is chosen among those kept at step 2, and only those', async ({ page }) => {
    await toSections(page);
    await card(page, 'Souba').locator('input[type="checkbox"]').uncheck();
    await next(page).click();
    await page.locator('button[aria-haspopup="dialog"]').click();

    await expect(panel(page).locator('button.ListRow')).toHaveCount(9);
    await expect(panel(page).getByRole('button', { name: 'Souba', exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole('button', { name: 'Clarinette', exact: true })).toHaveCount(
      0,
    );

    await panel(page).getByRole('button', { name: 'Sax Ténor', exact: true }).click();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('button[aria-haspopup="dialog"]')).toHaveText('Sax Ténor');
    // Its name says both what it is and what is chosen.
    await expect(page.getByRole('button', { name: /Instrument.*Sax Ténor/ })).toBeVisible();
  });

  test('an instrument chosen and then unticked at step 2 has to be chosen again', async ({
    page,
  }) => {
    await toMember(page);
    await fillMember(page);
    await page.locator('.ScreenTop-navigation button').click();
    await expect(page).toHaveURL('/install/sections');
    await card(page, 'Saxophone').getByLabel(admin.instrument, { exact: true }).uncheck();
    await next(page).click();
    await next(page).click();

    await expect(page.locator('.TextField[data-error="true"] button[aria-haspopup]')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
  });

  test('the password is hidden, and the eye shows it', async ({ page }) => {
    await toMember(page);
    await field(page, 'password').fill('some-password');
    await expect(field(page, 'password')).toHaveAttribute('type', 'password');

    await page.locator('.TextField button[aria-pressed]').click();
    await expect(field(page, 'password')).toHaveAttribute('type', 'text');
  });
});

test.describe('the end of the install', () => {
  test('the whole flow installs the app as it was entered and signs the first member in', async ({
    page,
  }) => {
    await toSections(page);
    // Kept: everything ticked but the Souba, plus one instrument of our own.
    await card(page, 'Souba').locator('input[type="checkbox"]').uncheck();
    await card(page, 'Percu').locator('button.ListRow').click();
    await field(page, 'instrumentName').fill('Washboard');
    await field(page, 'instrumentName').press('Enter');
    await next(page).click();
    await fillMember(page);
    await next(page).click();

    await expect(page).toHaveURL('/install/done');
    await expect(page.locator('.Chip[data-kind="success"]')).toBeVisible();
    await expect(page.locator('.Sheet .ListRow').first()).toContainText(
      'La Fanfare des Cuivres Déchaînés',
    );

    expect(sql('SELECT name, defaultLanguage FROM band')).toBe(
      'La Fanfare des Cuivres Déchaînés\tfr',
    );
    // A section with no instrument kept is not created.
    expect(sql('SELECT name FROM section ORDER BY position')).toBe(
      ['Trompette', 'Saxophone', 'Trombone', 'P’tites basses', 'Percu'].join('\n'),
    );
    expect(sql('SELECT COUNT(*) FROM instrument')).toBe('10');
    expect(
      sql(`SELECT i.name FROM instrument i JOIN section s ON s.id = i.sectionId
           WHERE s.name = 'Percu' ORDER BY i.position`),
    ).toBe(['Batterie', 'Percus', 'Washboard'].join('\n'));
    expect(
      sql(`SELECT m.nickname, m.status, i.name, r.role FROM member m
           JOIN instrument i ON i.id = m.instrumentId JOIN memberRole r ON r.memberId = m.id`),
    ).toBe(`${admin.nickname}\tACTIVE\t${admin.instrument}\tADMIN`);

    // The device is signed in: the API knows who is asking.
    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(200);

    // The install address now says that the app is installed.
    await page.locator('.BottomBar button').last().click();
    await expect(page).toHaveURL('/');
    await page.goto('/install');
    await expect(field(page, 'installKey')).toHaveCount(0);
  });

  test('the logo chosen at step 1 becomes the logo of the band and the icon of the page', async ({
    page,
  }) => {
    await toBand(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#c00"/></svg>',
      ),
    });
    await expect(page.locator('.ImageField-preview img')).toBeVisible();
    await field(page, 'bandName').fill('Les Cuivres');
    await next(page).click();
    await next(page).click();
    await fillMember(page);
    await next(page).click();
    await expect(page).toHaveURL('/install/done');

    const band = await (await page.request.get('/api/band')).json();
    expect(sql('SELECT logoPath FROM band')).toMatch(/logo\.svg$/);
    // The page takes the name and the icon of the band.
    await expect(page).toHaveTitle('Les Cuivres');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', band.icons['192']);

    // The icon is a square of the size asked, with the logo fitted in the
    // middle on white: red at the centre, white in the corner and above the logo.
    const pixels = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      context.drawImage(image, 0, 0);
      const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
      return {
        side: [image.naturalWidth, image.naturalHeight],
        centre: at(256, 256),
        corner: at(4, 4),
        above: at(256, 100),
      };
    }, band.icons['512']);
    expect(pixels.side).toEqual([512, 512]);
    expect(pixels.centre[0]).toBeGreaterThan(180);
    expect(pixels.centre[1]).toBeLessThan(40);
    expect(pixels.corner).toEqual([255, 255, 255]);
    expect(pixels.above).toEqual([255, 255, 255]);
  });

  test('a file that only pretends to be an image is refused at step 1', async ({ page }) => {
    await toBand(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not a picture'),
    });

    await expect(page.locator('.ImageField[data-error="true"]')).toBeVisible();
    await expect(page.locator('.ImageField-preview img')).toHaveCount(0);
  });

  test('the install key and the password are not kept on the device', async ({ page }) => {
    await toMember(page);
    await fillMember(page);
    await next(page).click();
    await expect(page).toHaveURL('/install/done');

    const stored = await page.evaluate(() =>
      JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
    );
    expect(stored).not.toContain(installInput().installKey);
    expect(stored).not.toContain(admin.password);
  });

  test('when the server does not answer, the answers are kept and can be sent again', async ({
    page,
  }) => {
    await toMember(page);
    await fillMember(page);
    await page.route('**/api/install', (route) => route.abort());
    await next(page).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(field(page, 'nickname')).toHaveValue(admin.nickname);
    await expect(next(page)).toBeEnabled();

    await page.unroute('**/api/install');
    await next(page).click();
    await expect(page).toHaveURL('/install/done');
  });

  test('while the install is sent, it cannot be sent twice', async ({ page }) => {
    await toMember(page);
    await fillMember(page);
    await page.route('**/api/install', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await next(page).click();

    await expect(next(page)).toBeDisabled();
    // Typing in a field meanwhile neither changes what is sent nor opens the button again.
    await field(page, 'nickname').pressSequentially('x');
    await expect(next(page)).toBeDisabled();
    await expect(page).toHaveURL('/install/done');
    expect(sql('SELECT nickname FROM member')).toBe(admin.nickname);
  });

  test('an install finished by someone else in the meantime is said, and nothing is overwritten', async ({
    page,
    playwright,
  }) => {
    await toMember(page);
    await fillMember(page);
    await field(page, 'nickname').fill('Trop tard');

    const other = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
    await install(other);
    await other.dispose();

    await next(page).click();
    await expect(page).toHaveURL('/install');
    await expect(field(page, 'installKey')).toHaveCount(0);
    expect(sql('SELECT nickname FROM member')).toBe(admin.nickname);
  });
});

test('a refusal that is not about this step says so, without asking to send again', async ({
  page,
}) => {
  await toMember(page);
  await fillMember(page);
  await page.route('**/api/install', (route) =>
    route.fulfill({
      status: 422,
      json: { error: 'invalidInput', fields: { sections: 'duplicate' } },
    }),
  );
  await next(page).click();
  const refused = await page.getByRole('alert').textContent();

  await page.unroute('**/api/install');
  await page.route('**/api/install', (route) => route.abort());
  await field(page, 'nickname').fill('Jibé');
  await next(page).click();
  await expect(page.getByRole('alert')).not.toHaveText(refused as string);
});

test('a name refused by the server is shown on its field', async ({ page }) => {
  await toMember(page);
  await fillMember(page);
  // A zero-width space: not blank for the browser, blank once cleaned by the API.
  await field(page, 'lastName').fill('\u200B');
  await next(page).click();

  await expect(field(page, 'lastName')).toHaveAttribute('aria-invalid', 'true');
  expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
});

test.describe('the focus is never lost', () => {
  test('removing the logo gives the focus to the button that chooses one', async ({ page }) => {
    await toBand(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: '',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
    });
    await page.locator('.ImageField button[data-kind="danger"]').click();

    await expect(page.locator('.ImageField button')).toBeFocused();
  });

  test('moving or removing an instrument gives the focus to a control of its section', async ({
    page,
  }) => {
    await toSections(page);
    await card(page, 'Flûte').locator('.ListRow .IconButton').last().click();
    await panel(page).locator('select').selectOption({ label: 'Clarinette' });
    await panel(page).locator('button[type="submit"]').click();
    await expect(card(page, 'Clarinette').locator('.ListRow .IconButton').last()).toBeFocused();

    // Opened with the keyboard, at once: the panel opens, and stays open.
    await page.keyboard.press('Enter');
    await expect(field(page, 'instrumentName')).toHaveValue('Piccolo');
    await panel(page).locator('button[data-kind="danger"]').click();
    await expect(card(page, 'Clarinette').locator('button.ListRow')).toBeFocused();
  });

  test('a selection dragged out of a field of a panel does not close it', async ({ page }) => {
    await toSections(page);
    await card(page, 'Souba').locator('button.ListRow').click();
    await field(page, 'instrumentName').fill('Hélicon');

    const box = (await field(page, 'instrumentName').boundingBox()) as { x: number; y: number };
    await page.mouse.move(box.x + 20, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, 20);
    await page.mouse.up();
    await page.mouse.click(box.x + 20, 20, { delay: 0 });
    // The click above starts and ends on the scrim: that one closes the panel.
    await expect(panel(page)).toBeHidden();
  });
});

test('at the largest text size, no step spills out of the screen', async ({ page }) => {
  await chooseAccessibility(page, { textSizePercent: 200 });
  await toBand(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');
  await noOverflow(page);
  await field(page, 'bandName').fill('La Fanfare des Cuivres Déchaînés');
  await next(page).click();
  await noOverflow(page);
  await next(page).click();
  await noOverflow(page);
  await fillMember(page);
  await next(page).click();
  await expect(page).toHaveURL('/install/done');
  await noOverflow(page);
});
