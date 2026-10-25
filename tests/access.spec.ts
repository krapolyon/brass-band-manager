import type { Page } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { emptyMailbox, receivedMails } from './support/mail.ts';
import { addMember, admin, install, memberPassword } from './support/scenario.ts';
import { expect, test } from './support/test.ts';

// The screens shown before sign-in: sign-in, forgotten password, the screen a
// password link opens, the link that no longer works, and the accessibility
// options offered on each. Rules: model/members.md, "Sign-in", "Forgotten
// password" and "Accessibility before sign-in".

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

const email = (page: Page) => page.getByLabel('Adresse email');
const password = (page: Page) => page.getByLabel('Mot de passe', { exact: true });
const title = (page: Page) => page.getByRole('heading', { level: 1 });

async function signIn(page: Page, address: string, secret: string) {
  await page.goto('/sign-in');
  await email(page).fill(address);
  await password(page).fill(secret);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test.describe('sign-in', () => {
  test('a visitor is asked to sign in, under the name of the band, and gets in', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/sign-in');
    await expect(title(page)).toHaveText('Te revoilà !');
    await expect(page.getByText('La Fanfare des Cuivres Déchaînés')).toBeVisible();

    await signIn(page, admin.email, admin.password);

    await expect(page).toHaveURL('/');
    // The device is signed in for good: the app still knows it after a reload.
    await page.reload();
    await expect(page).toHaveURL('/');
  });

  test('every refusal says the same thing, and keeps what was typed', async ({ page }) => {
    const refusal = page.getByRole('alert');
    const left = addMember({ nickname: 'Bouboule', status: 'LEFT' });

    for (const [address, secret] of [
      [admin.email, 'pas-le-bon-mot-de-passe'],
      ['personne@example.org', admin.password],
      [left, memberPassword],
    ] as const) {
      await signIn(page, address, secret);
      await expect(refusal).toContainText('Adresse email ou mot de passe incorrect.');
      await expect(refusal).toContainText('un quart d’heure');
      await expect(email(page)).toHaveValue(address);
      await expect(page).toHaveURL('/sign-in');
    }
  });

  test('the form is sent with the Enter key, and the eye shows the password', async ({ page }) => {
    await page.goto('/sign-in');
    await email(page).fill(admin.email);
    await password(page).fill(admin.password);
    await expect(password(page)).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
    await expect(password(page)).toHaveAttribute('type', 'text');

    await password(page).press('Enter');

    await expect(page).toHaveURL('/');
  });

  test('a member already signed in has nothing to do on the sign-in screen', async ({ page }) => {
    await signIn(page, admin.email, admin.password);
    await expect(page).toHaveURL('/');

    await page.goto('/sign-in');
    await expect(page).toHaveURL('/');
    await page.goto('/forgot-password');
    await expect(page).toHaveURL('/');
  });

  test('when the server does not answer, the screen says so and not that the password is wrong', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.route('**/api/session', (route) => route.abort());
    await email(page).fill(admin.email);
    await password(page).fill(admin.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Le serveur ne répond pas. Réessaie dans un instant.',
    );
  });
});

test.describe('accessibility before sign-in', () => {
  const open = (page: Page) => page.getByRole('button', { name: 'Accessibilité' }).click();
  const root = (page: Page) => page.locator('html');

  test('the options apply at once and stay on this device', async ({ page }) => {
    await page.goto('/sign-in');
    await open(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Réglé pour cet appareil.');

    // The text size is a slider with six steps, moved with the keyboard.
    const slider = sheet.getByRole('slider', { name: 'Taille du texte' });
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '140 %');
    await sheet.getByRole('switch', { name: 'Contraste élevé' }).check();
    await sheet.getByRole('switch', { name: 'Police plus lisible' }).check();
    await sheet.getByRole('switch', { name: 'Espacement augmenté' }).check();
    await sheet.getByRole('switch', { name: 'Mouvement réduit' }).check();

    await expect(root(page)).toHaveAttribute('data-text-size', '140');
    await expect(root(page)).toHaveAttribute('data-contrast', 'more');
    await expect(root(page)).toHaveAttribute('data-typeface', 'legible');
    await expect(root(page)).toHaveAttribute('data-spacing', 'increased');
    await expect(root(page)).toHaveAttribute('data-motion', 'reduced');

    // Still there on the other screens, and after the page is loaded again.
    await page.goto('/forgot-password');
    await expect(root(page)).toHaveAttribute('data-text-size', '140');
    await expect(root(page)).toHaveAttribute('data-contrast', 'more');
  });

  test('once signed in, the options of the account apply, not those of the device', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await open(page);
    await page.getByRole('switch', { name: 'Contraste élevé' }).check();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(root(page)).toHaveAttribute('data-contrast', 'more');

    await signIn(page, admin.email, admin.password);
    await expect(page).toHaveURL('/');

    // The account of Jibé has no option on.
    await expect(root(page)).not.toHaveAttribute('data-contrast', 'more');
    // Nothing of the device was sent to the account.
    expect(sql(`SELECT hasHighContrast FROM member WHERE nickname = '${admin.nickname}'`)).toBe(
      '0',
    );
  });

  test('the button is on every screen shown before sign-in', async ({ page }) => {
    for (const address of ['/sign-in', '/forgot-password', '/password#nothing']) {
      await page.goto(address);
      await expect(page.getByRole('button', { name: 'Accessibilité' }), address).toBeVisible();
    }
  });

  test('at the largest text size with every option on, the sign-in screen can still be used', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await open(page);
    await page.getByRole('slider').press('End');
    for (const name of ['Contraste élevé', 'Espacement augmenté', 'Police plus lisible']) {
      await page.getByRole('switch', { name }).check();
    }
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(root(page)).toHaveAttribute('data-text-size', '200');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await email(page).fill(admin.email);
    await password(page).fill(admin.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('forgotten password', () => {
  test('a member receives a link, chooses a new password with it and is signed in', async ({
    page,
    baseURL,
  }) => {
    const address = addMember({ nickname: 'Zaza' });
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
    await expect(title(page)).toHaveText('Mot de passe oublié\u00a0?');

    // An address that cannot be one is said on the field, before anything is sent.
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByText('Il manque ton adresse email.')).toBeVisible();
    await expect(email(page)).toBeFocused();

    await email(page).fill(address);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(title(page)).toHaveText('Regarde tes mails');

    const [mail] = await receivedMails(1);
    const link = mail?.text.match(/http\S+/)?.[0] ?? '';
    expect(link.startsWith(`${baseURL}/password#`)).toBe(true);

    // The secret of the link is never part of an address sent to the server.
    const token = link.split('#')[1] ?? 'missing';
    const asked: string[] = [];
    page.on('request', (request) => asked.push(request.url()));

    await page.goto(link);
    await expect(title(page)).toHaveText('Un nouveau mot de passe');
    const field = page.getByLabel('Nouveau mot de passe');
    const hint = page.locator('.TextField-hint');
    // The hint lives with the typing (Figma: Members, section 17): the rule
    // while the field is empty, what is still missing, then Success.
    await expect(hint).toHaveText(
      '15 caractères au moins. Le plus simple : une phrase, genre « ma trompette fait des pirouettes ».\nMais pas celle-là, hein.',
    );
    await field.fill('tubatubat');
    await expect(hint).toHaveText('Encore 6 caractères.');
    await field.fill('tubatubatubatub');
    await expect(hint).toHaveText('Nickel. Même ta mère ne le devinerait pas.');
    await expect(page.locator('.TextField[data-hint="success"]')).toHaveCount(1);

    await field.fill('court');
    await page.getByRole('button', { name: 'Enregistrer et me connecter' }).click();
    await expect(hint).toHaveText('Encore 10 caractères.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();

    // Refused by the API: among the most used passwords.
    await field.fill('jetaimemonamour');
    await page.getByRole('button', { name: 'Enregistrer et me connecter' }).click();
    await expect(hint).toHaveText(
      'Trop connu : il est dans la liste des mots de passe les plus utilisés. Choisis-en un autre.',
    );

    await field.fill('un-tout-nouveau-mot-de-passe');
    await page.getByRole('button', { name: 'Enregistrer et me connecter' }).click();
    await expect(page).toHaveURL('/');
    expect(asked.filter((url) => url.includes(token))).toEqual([]);

    // The link worked once.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(title(page)).toHaveText('Ce lien ne marche plus');
  });

  test('an address nobody has gets the same screen, and no email', async ({ page }) => {
    await page.goto('/forgot-password');
    await email(page).fill('personne@example.org');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();

    await expect(title(page)).toHaveText('Regarde tes mails');
    await expect(page.getByText('Si cette adresse est celle d’un fanfaron')).toBeVisible();
    await page.getByRole('button', { name: 'Retour à la connexion' }).click();
    await expect(page).toHaveURL('/sign-in');
  });

  test.describe('on an instance that cannot send email', () => {
    test.use({ baseURL: 'http://localhost:8082' });

    test('the screen asks for no address and sends to those who manage members', async ({
      page,
    }) => {
      await page.goto('/forgot-password');

      await expect(
        page.getByText('Demande un lien à quelqu’un qui gère les fanfarons'),
      ).toBeVisible();
      await expect(
        page.getByText('N’importe quel admin de la fanfare peut te le créer.'),
      ).toBeVisible();
      await expect(email(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Retour à la connexion' }).click();
      await expect(page).toHaveURL('/sign-in');
    });
  });
});

test.describe('a link that no longer works', () => {
  for (const address of [
    '/password',
    '/password#',
    `/password#${'a'.repeat(64)}`,
    '/password#<script>',
  ]) {
    test(`${address} says so, whatever is wrong with it`, async ({ page }) => {
      await page.goto(address);

      await expect(title(page)).toHaveText('Ce lien ne marche plus');
      await expect(page.getByText('C’était une invitation ?')).toBeVisible();
    });
  }

  test('it offers a new link, or the sign-in screen', async ({ page }) => {
    await page.goto('/password#nothing');
    await page.getByRole('button', { name: 'Recevoir un nouveau lien' }).click();
    await expect(page).toHaveURL('/forgot-password');

    await page.goto('/password#nothing');
    await page.getByRole('button', { name: 'Aller à la connexion' }).click();
    await expect(page).toHaveURL('/sign-in');
  });
});
