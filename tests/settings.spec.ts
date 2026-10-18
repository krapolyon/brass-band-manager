import { expect, type Page, test } from '@playwright/test';
import { textSizeOfDevice } from './support/accessibility.ts';
import { emptyDatabase, sql } from './support/database.ts';
import { fakePush } from './support/fakePush.ts';
import { png } from './support/images.ts';
import {
  addMember,
  admin,
  deviceOf,
  install,
  memberId,
  memberPassword,
} from './support/scenario.ts';
import { emptyStorage, storedFiles } from './support/storage.ts';

// The settings of a member: their profile, their password, the appearance,
// the accessibility options, and signing out. Rules: model/members.md,
// "Access rights" (a member edits their own record), "Password change",
// "Accessibility options" and "Personal data" (preferences).

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
});

async function signIn(page: Page, email = 'zaza@example.org', password = memberPassword) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Signing in leads to the home screen; these tests start from the directory.
  await expect(page).toHaveURL('/');
  await page.goto('/members');
  await expect(page).toHaveURL('/members');
  await page.goto('/settings');
}

const zaza = (columns: string) =>
  sql(`SELECT ${columns} FROM member WHERE id = ${memberId('Zaza')}`);
const root = (page: Page) => page.locator('html');
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer' });

test.describe('the summary', () => {
  test('shows the member, their settings, and nothing they may not do', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('link', { name: 'Mon profil' })).toContainText('Zaza');
    await expect(page.getByRole('link', { name: 'Mon profil' })).toContainText('Trompette');
    await expect(page.getByRole('link', { name: /Apparence/ })).toContainText(
      'Auto · couleur de la fanfare',
    );
    await expect(page.getByRole('link', { name: /Accessibilité/ })).toContainText(
      'Aucune option activée',
    );
    await expect(page.getByRole('button', { name: /Langue/ })).toContainText('Français');
    // A plain member manages neither the members nor the band.
    await expect(page.getByText('Gérer les fanfarons')).toHaveCount(0);
    await expect(page.getByText('Réglages de la fanfare')).toHaveCount(0);
  });

  test('offers who manages members to manage them, and the admin the band too', async ({
    page,
  }) => {
    await signIn(page, 'momo@example.org');
    await expect(page.getByRole('link', { name: /Gérer les fanfarons/ })).toContainText(
      '1 invitation en attente',
    );
    await expect(page.getByText('Réglages de la fanfare')).toHaveCount(0);

    await page.context().clearCookies();
    await signIn(page, admin.email, admin.password);
    await expect(page.getByRole('link', { name: /Gérer les fanfarons/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Réglages de la fanfare/ })).toBeVisible();
  });

  test('the language opens the list of the languages of the app', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: /Langue/ }).click();

    await expect(
      page.getByRole('dialog', { name: 'Langue' }).getByRole('button', { name: 'Français' }),
    ).toBeVisible();
  });
});

test.describe('the profile', () => {
  test('a member corrects their own record, phone included', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Mon profil' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon profil');

    await page.getByLabel('Prénom').fill('Isabelle');
    await page.getByLabel('Téléphone mobile').fill('06 12 34 56 78');
    await page.getByLabel('Ville').fill('Lyon');
    await save(page).click();

    await expect(page).toHaveURL('/settings');
    expect(zaza('firstName, mobilePhone, city')).toBe('Isabelle\t+33612345678\tLyon');
    // Shown the local way when the profile is opened again.
    await page.getByRole('link', { name: 'Mon profil' }).click();
    await expect(page.getByLabel('Téléphone mobile')).toHaveValue('06 12 34 56 78');
  });

  test('a phone number stays what it is when the country of the address changes', async ({
    page,
  }) => {
    sql(`UPDATE member SET mobilePhone = '+33612345678' WHERE id = ${memberId('Zaza')}`);
    await signIn(page);
    await page.goto('/settings/profile');
    await expect(page.getByLabel('Téléphone mobile')).toHaveValue('06 12 34 56 78');

    // The member moves abroad and keeps their number: it is a number of the
    // country of the band, whatever the address.
    await page.getByLabel('Pays').selectOption({ label: 'Belgique' });
    await save(page).click();

    await expect(page).toHaveURL('/settings');
    expect(zaza('mobilePhone, countryCode')).toBe('+33612345678\tBE');
  });

  test('a nickname or an email someone else has is refused, on its field', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/profile');
    await page.getByLabel('Surnom').fill('Momo');
    await page.getByLabel('Adresse email').fill(admin.email);
    await save(page).click();

    await expect(page.getByRole('alert')).toHaveText(
      '2 champs sont à corriger avant d’enregistrer.',
    );
    await expect(page.getByText('Ce surnom est déjà pris. Essaie une variante.')).toBeVisible();
    await expect(page.getByText('Cette adresse est déjà celle d’un fanfaron.')).toBeVisible();
    await expect(page).toHaveURL('/settings/profile');
    expect(zaza('nickname, email')).toBe('Zaza\tzaza@example.org');
  });

  test('a member gives themself a photo, then removes it', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/profile');
    const photo = page.getByRole('group', { name: 'Photo' });
    await photo
      .locator('input[type=file]')
      .setInputFiles({ name: 'moi.png', mimeType: 'image/png', buffer: png(300) });
    await expect(photo.locator('img')).toBeVisible();
    await save(page).click();
    await expect(page).toHaveURL('/settings');
    expect(storedFiles('members')).toHaveLength(1);
    await expect(page.getByRole('link', { name: 'Mon profil' }).locator('img')).toBeVisible();

    await page.goto('/settings/profile');
    await page
      .getByRole('group', { name: 'Photo' })
      .getByRole('button', { name: 'Retirer' })
      .click();
    await save(page).click();
    await expect(page).toHaveURL('/settings');
    expect(storedFiles('members')).toEqual([]);
  });
});

test.describe('the password', () => {
  const current = (page: Page) => page.getByLabel('Mot de passe actuel');
  const next = (page: Page) => page.getByLabel('Nouveau mot de passe');
  const change = (page: Page) => page.getByRole('button', { name: 'Changer le mot de passe' });

  test('the current password is asked, and the new one follows the rule', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: /Mot de passe/ }).click();
    await change(page).click();
    await expect(page.getByText('Il manque ton mot de passe actuel.')).toBeVisible();

    await current(page).fill('pas-le-bon-mot-de-passe');
    await next(page).fill('court');
    await change(page).click();
    await expect(page.getByText('Encore 5 caractères : il en faut 10 au minimum.')).toBeVisible();

    await next(page).fill('un-tout-nouveau-mot-de-passe');
    await change(page).click();
    await expect(page.getByText('Ce n’est pas ton mot de passe actuel.')).toBeVisible();
    await expect(current(page)).toBeFocused();

    await current(page).fill(memberPassword);
    await change(page).click();
    await expect(page).toHaveURL('/settings');

    // The new password is the one that signs in.
    await page.context().clearCookies();
    await signIn(page, 'zaza@example.org', 'un-tout-nouveau-mot-de-passe');
    await expect(page).toHaveURL('/settings');
  });

  test('after too many wrong current passwords, the device is signed out', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings/password');
    await next(page).fill('un-tout-nouveau-mot-de-passe');
    for (let attempt = 0; attempt < 5; attempt++) {
      await current(page).fill(`faux-mot-de-passe-${attempt}`);
      await change(page).click();
      if (attempt < 4)
        await expect(page.getByText('Ce n’est pas ton mot de passe actuel.')).toBeVisible();
    }

    await expect(page).toHaveURL('/sign-in');
  });
});

test.describe('appearance and accessibility', () => {
  test('light or dark and the accent colour apply at once, and are saved', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: /Apparence/ }).click();

    await page.getByRole('radio', { name: 'Sombre' }).check();
    await expect(root(page)).toHaveAttribute('data-scheme', 'dark');
    await page.getByRole('radio', { name: 'Clair' }).check();
    await expect(root(page)).toHaveAttribute('data-scheme', 'light');

    // The colour of the band is the first one, copper, until the member chooses.
    await expect(page.getByRole('radio', { name: 'Fanfare' })).toBeChecked();
    await expect(root(page)).toHaveAttribute('data-theme', 'copper');
    await page.getByRole('radio', { name: 'Menthe' }).check();
    await expect(root(page)).toHaveAttribute('data-theme', 'mint');
    await expect.poll(() => zaza('colorScheme, accentTheme')).toBe('LIGHT\tmint');

    await page.getByRole('radio', { name: 'Fanfare' }).check();
    await expect(root(page)).toHaveAttribute('data-theme', 'copper');
    await expect.poll(() => zaza('accentTheme IS NULL')).toBe('1');
  });

  test('a member who follows the band changes colour when the band does', async ({
    page,
    playwright,
  }) => {
    await signIn(page);
    await expect(root(page)).toHaveAttribute('data-theme', 'copper');

    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await jibe.patch('/api/band', { data: { defaultAccentTheme: 'lilac' } });
    await jibe.dispose();
    await page.reload();

    await expect(root(page)).toHaveAttribute('data-theme', 'lilac');
  });

  test('the six options apply at once, follow the account, and stay off the device', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: /Accessibilité/ }).click();
    await expect(page.getByText('personne d’autre ne les voit')).toBeVisible();

    const slider = page.getByRole('slider', { name: 'Taille du texte' });
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await page.getByRole('switch', { name: 'Contraste élevé' }).check();
    await page.getByRole('switch', { name: 'Délais augmentés' }).check();

    await expect(root(page)).toHaveAttribute('data-text-size', '140');
    await expect(root(page)).toHaveAttribute('data-contrast', 'more');
    await expect(root(page)).toHaveAttribute('data-timeouts', 'extended');
    // The five options of the account are saved on it; the text size is not.
    await expect
      .poll(() => zaza('hasHighContrast, hasExtendedTimeouts, hasLegibleFont'))
      .toBe('1\t1\t0');
    // The device keeps its text size, and nothing of the account.
    expect(
      JSON.parse((await page.evaluate(() => localStorage.getItem('accessibility'))) ?? '{}'),
    ).toEqual({
      textSizePercent: 140,
      hasHighContrast: false,
      hasIncreasedSpacing: false,
      hasLegibleFont: false,
      hasReducedMotion: false,
      hasExtendedTimeouts: false,
    });

    // The summary says what is on.
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /Accessibilité/ })).toContainText(
      'Texte à 140 %, contraste élevé, délais augmentés',
    );
  });

  test('the text size belongs to the device: it stays at sign-out, and another device keeps its own (#18)', async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: /Accessibilité/ }).click();
    // The text under the slider says it.
    await expect(
      page.getByText(
        'Agrandit les textes sans modifier la mise en page. Ce réglage n’affecte que cet appareil.',
      ),
    ).toBeVisible();
    await page.getByRole('slider', { name: 'Taille du texte' }).press('ArrowRight');
    await page.getByRole('switch', { name: 'Police plus lisible' }).check();
    await expect(root(page)).toHaveAttribute('data-text-size', '120');
    await expect.poll(() => zaza('hasLegibleFont')).toBe('1');

    // Signed out: the text size of the device stays, the font of the account goes.
    await page.goto('/settings');
    await page.getByRole('button', { name: /Me déconnecter/ }).click();
    await expect(page).toHaveURL('/sign-in');
    await expect(root(page)).toHaveAttribute('data-text-size', '120');
    await expect(root(page)).not.toHaveAttribute('data-typeface', 'legible');

    // Another device of the same member: the font follows the account, not the size.
    const other = await browser.newContext({ baseURL: 'http://localhost:8081', locale: 'fr-FR' });
    const computer = await other.newPage();
    await signIn(computer);
    await expect(root(computer)).toHaveAttribute('data-typeface', 'legible');
    await expect(root(computer)).not.toHaveAttribute('data-text-size');
    await computer.goto('/settings');
    await expect(computer.getByRole('link', { name: /Accessibilité/ })).toContainText(
      'Police plus lisible',
    );
    await expect(computer.getByRole('link', { name: /Accessibilité/ })).not.toContainText(
      'Texte à',
    );
    await other.close();

    // Back on the first device: its text size again, with the options of the account.
    await signIn(page);
    await expect(root(page)).toHaveAttribute('data-text-size', '120');
    await expect(root(page)).toHaveAttribute('data-typeface', 'legible');
  });

  test('at the largest text size with every option on, the settings can still be used', async ({
    page,
  }) => {
    sql(`UPDATE member SET hasIncreasedSpacing = 1, hasLegibleFont = 1, hasHighContrast = 1,
         hasReducedMotion = 1, hasExtendedTimeouts = 1 WHERE id = ${memberId('Zaza')}`);
    await textSizeOfDevice(page, 200);
    await signIn(page);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

    for (const address of [
      '/settings',
      '/settings/profile',
      '/settings/appearance',
      '/settings/accessibility',
    ]) {
      await page.goto(address);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await overflow(), address).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('notifications by channel (#23, #27)', () => {
  // This device was asked already: the sheet of a first opening stays shut.
  const askedBefore = (page: Page) =>
    page.addInitScript(() => localStorage.setItem('pushAsked', '1'));
  const kinds = [
    'Rappels de présence',
    'Plans jouables',
    'Plans validés',
    'Prochain morceau de la setlist',
    'Nouveau morceau',
    'Nouveau MuseScore',
    'Nouvelle partition',
  ];
  /** The chip of one channel of one kind: a toggle button in the group of the kind. */
  const chip = (page: Page, kind: string, channel: 'Notification' | 'E-mail') =>
    page
      .getByRole('group', { name: new RegExp(`^${kind}`) })
      .getByRole('button', { name: channel });

  test('the device switch first; with it off, the notification chips are kept and cannot change, the e-mail ones can', async ({
    page,
  }) => {
    await fakePush(page);
    await askedBefore(page);
    await signIn(page);
    await page.getByRole('link', { name: /Notifications/ }).click();

    const device = page.getByRole('switch', { name: 'Recevoir les notifications' });
    await expect(device).not.toBeChecked();
    await expect(
      page.getByText('Active les notifications sur cet appareil pour les recevoir ici.'),
    ).toBeVisible();
    for (const kind of kinds) {
      await expect(chip(page, kind, 'Notification'), kind).toHaveAttribute('aria-pressed', 'true');
      await expect(chip(page, kind, 'Notification'), kind).toBeDisabled();
    }
    // The live setlist has no e-mail: it would arrive too late.
    await expect(chip(page, 'Prochain morceau de la setlist', 'E-mail')).toHaveCount(0);
    await chip(page, 'Nouveau morceau', 'E-mail').click();
    await expect.poll(() => zaza('notifySongNew')).toBe('PUSH_AND_EMAIL');

    // On: each chip changes at once, for every device.
    await device.click();
    await expect(device).toBeChecked();
    await chip(page, 'Plans jouables', 'Notification').click();
    await chip(page, 'Nouvelle partition', 'Notification').click();
    await chip(page, 'Nouvelle partition', 'E-mail').click();
    await expect
      .poll(() => zaza('notifyGigPlayable, notifyGigConfirmed, notifySongPart'))
      .toBe('OFF\tPUSH\tEMAIL');

    // The reminders keep one channel at least: the last one on cannot be turned off.
    const reminder = chip(page, 'Rappels de présence', 'Notification');
    await expect(reminder).toBeDisabled();
    // Still reached from the keyboard, and pressing it changes nothing.
    await reminder.focus();
    await expect(reminder).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(reminder).toHaveAttribute('aria-pressed', 'true');
    await chip(page, 'Rappels de présence', 'E-mail').click();
    await expect(reminder).toBeEnabled();
    await reminder.click();
    await expect(chip(page, 'Rappels de présence', 'E-mail')).toBeDisabled();
    await expect.poll(() => zaza('notifyGigReminder')).toBe('EMAIL');
    await expect(
      page.getByText('sans appareil qui reçoit les notifications, ils arrivent par e-mail', {
        exact: false,
      }),
    ).toBeVisible();

    // The summary counts the kinds that reach the member, by any channel.
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /Notifications/ })).toContainText(
      'Sur cet appareil · 6 choix',
    );
  });

  test('a refused change goes back, and says so', async ({ page }) => {
    await fakePush(page, 'granted');
    await askedBefore(page);
    await signIn(page);
    await page.goto('/settings/notifications');
    await page.getByRole('switch', { name: 'Recevoir les notifications' }).click();
    const choice = chip(page, 'Nouveau morceau', 'Notification');
    await expect(choice).toBeEnabled();
    await page.route('**/api/me/notifications', (route) =>
      route.request().method() === 'PUT' ? route.abort() : route.continue(),
    );
    await choice.click();
    await expect(page.getByText('Le réglage n’a pas changé.')).toBeVisible();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    expect(zaza('notifySongNew')).toBe('PUSH');
  });

  test.describe('on an instance without a mail server', () => {
    test.use({ baseURL: 'http://localhost:8082' });

    test('no e-mail chip, and a choice saved with e-mail reads as a notification', async ({
      page,
    }) => {
      sql(`UPDATE member SET notifySongNew = 'EMAIL' WHERE email = 'zaza@example.org'`);
      await fakePush(page, 'granted');
      await askedBefore(page);
      await signIn(page);
      await page.goto('/settings/notifications');

      await expect(page.getByRole('button', { name: 'E-mail' })).toHaveCount(0);
      await expect(chip(page, 'Nouveau morceau', 'Notification')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByText('Tant que tu n’as pas répondu.', { exact: true })).toBeVisible();
    });
  });
});

test.describe('the calendar (#21)', () => {
  test('the address is created when it is first asked for, then reset after a confirmation', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await signIn(page);
    await expect(page.getByRole('link', { name: /Calendrier/ })).toContainText(
      'Pas encore dans ton agenda',
    );
    await page.getByRole('link', { name: /Calendrier/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Calendrier' })).toBeVisible();
    expect(zaza('calendarToken')).toBe('NULL');
    // Nothing to reset before an address exists.
    await expect(page.getByRole('button', { name: 'Réinitialiser la synchro' })).toBeDisabled();

    const isApple = browserName === 'webkit';
    if (isApple) {
      // An iPhone opens its Calendar app with the webcal address; copying is offered too.
      await expect(page.getByRole('button', { name: 'Ajouter à mon agenda' })).toBeVisible();
      await expect(page.getByText(/Il se met à jour à la fréquence réglée/)).toBeVisible();
    } else {
      // Android: the address is copied, with the steps of Google Agenda.
      await expect(page.getByRole('button', { name: 'Ajouter à mon agenda' })).toHaveCount(0);
      await expect(page.getByText(/Autres agendas › À partir de l’URL/)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Copier l’adresse' }).click();
    await expect.poll(() => zaza('calendarToken')).toMatch(/^[0-9a-f]{32}$/);
    const token = zaza('calendarToken');
    const address = `http://localhost:8081/api/calendar/${token}.ics`;
    if (isApple) {
      // The clipboard of the test browser may refuse: the address is then shown to copy by hand.
      await expect(
        page
          .getByRole('button', { name: 'Adresse copiée' })
          .or(page.getByLabel('Adresse de ton agenda')),
      ).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Adresse copiée' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
    }

    await page.getByRole('button', { name: 'Réinitialiser la synchro' }).click();
    const confirm = page.getByRole('dialog', { name: 'Réinitialiser la synchro ?' });
    await expect(
      confirm.getByText('L’ancienne synchro ne fonctionnera plus, il faudra recommencer.'),
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'Annuler' }).click();
    expect(zaza('calendarToken')).toBe(token);
    await page.getByRole('button', { name: 'Réinitialiser la synchro' }).click();
    await confirm.getByRole('button', { name: 'Réinitialiser la synchro' }).click();
    await expect(confirm).toBeHidden();
    await expect.poll(() => zaza('calendarToken')).not.toBe(token);
    await expect(
      page.getByRole('status').filter({ hasText: 'Nouvelle adresse créée.' }),
    ).toHaveCount(1);

    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /Calendrier/ })).toContainText('Adresse créée');
  });
});

test.describe('signing out', () => {
  test('signs this device out, and no other', async ({ page, playwright }) => {
    const other = await deviceOf(playwright, 'zaza@example.org');
    await signIn(page);
    await page.getByRole('button', { name: /Me déconnecter/ }).click();

    await expect(page).toHaveURL('/sign-in');
    await page.goto('/members');
    await expect(page).toHaveURL('/sign-in');
    expect((await other.get('/api/me')).status()).toBe(200);
    await other.dispose();
  });

  test('"everywhere" asks first, then signs every device out', async ({ page, playwright }) => {
    const other = await deviceOf(playwright, 'zaza@example.org');
    await signIn(page);
    await page.getByRole('button', { name: /Déconnecter tous mes appareils/ }).click();
    const confirm = page.getByRole('dialog', { name: 'Tout déconnecter ?' });
    await expect(confirm).toContainText('Il te faudra ton mot de passe pour revenir.');

    // Cancelling changes nothing.
    await confirm.getByRole('button', { name: 'Annuler' }).click();
    expect((await other.get('/api/me')).status()).toBe(200);

    await page.getByRole('button', { name: /Déconnecter tous mes appareils/ }).click();
    await confirm.getByRole('button', { name: 'Déconnecter tous mes appareils' }).click();
    await expect(page).toHaveURL('/sign-in');
    expect((await other.get('/api/me')).status()).toBe(401);
    await other.dispose();
  });
});
