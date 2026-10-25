import type { Page } from '@playwright/test';
import { textSizeOfDevice } from './support/accessibility.ts';
import { emptyDatabase, sql } from './support/database.ts';
import { emptyMailbox, receivedMails } from './support/mail.ts';
import { memberColumns } from './support/personal.ts';
import { addMember, admin, install, memberId, memberPassword } from './support/scenario.ts';
import { expect, test } from './support/test.ts';

// Managing members: the list (a table on a desktop), the record of a member
// in each status, the invitation and its link, the departure, and the page
// opened without the right. Rules: model/members.md, "Life cycle", "Rules"
// ("Always one admin", "Nobody acts on the access of someone who may do more
// than them"), "Roles and permissions" and "Access rights".

// Installed with: Trompette (Trompette), Saxophone (Sax Alto, Sax Ténor),
// Souba (Souba). Jibé the admin plays the Sax Ténor; the others the Trompette.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Tonton', status: 'POWER_MEMBER' });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
  addMember({ nickname: 'Bouboule', status: 'LEFT' });
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

async function openList(page: Page, email?: string, password?: string) {
  await signIn(page, email, password);
  await page.getByRole('button', { name: 'Gérer' }).click();
  await expect(page).toHaveURL('/members/manage');
}

const rows = (page: Page) => page.locator('.MemberRow');
const nicknames = (page: Page) => rows(page).locator('.MemberRow-nickname');
const status = (nickname: string) =>
  sql(`SELECT status FROM member WHERE nickname = '${nickname}'`);
const record = (page: Page, nickname: string) => page.goto(`/members/manage/${memberId(nickname)}`);
const title = (page: Page) => page.getByRole('heading', { level: 1 });

test.describe('the list', () => {
  test('shows the current and the invited members, and counts them', async ({ page }) => {
    await openList(page);

    await expect(nicknames(page)).toHaveText(['Jibé', 'Kiki', 'Momo', 'Tonton', 'Zaza']);
    await expect(
      page.getByText('4 fanfarons, dont 1 power member. 1 invitation en attente.'),
    ).toBeVisible();
    // An invitation whose link no longer works says so; a status that is the ordinary one says nothing.
    await expect(rows(page).filter({ hasText: 'Kiki' })).toContainText('Expirée');
    await expect(rows(page).filter({ hasText: 'Zaza' }).locator('.Chip')).toHaveCount(0);
    // The marks are icons, named for who cannot see them.
    await expect(rows(page).filter({ hasText: 'Tonton' })).toContainText('Power member');
    await expect(rows(page).filter({ hasText: 'Momo' })).toContainText('Gère les fanfarons');
    await expect(rows(page).filter({ hasText: 'Jibé' })).toContainText('Admin');
  });

  test('one choice among three narrows it, and a switch adds the former members', async ({
    page,
  }) => {
    await openList(page);
    const choice = (name: string) => page.getByRole('radio', { name });
    await expect(choice('Tous')).toBeChecked();

    // A group of radio buttons: the arrows move the choice.
    await choice('Tous').press('ArrowRight');
    await expect(choice('Power members')).toBeChecked();
    await expect(choice('Power members')).toBeFocused();
    await choice('Power members').press('ArrowLeft');
    await expect(choice('Tous')).toBeChecked();

    await choice('Power members').click();
    await expect(nicknames(page)).toHaveText(['Tonton']);
    await choice('Invités').click();
    await expect(nicknames(page)).toHaveText(['Kiki']);

    await choice('Tous').click();
    await page.getByRole('switch', { name: 'Afficher les anciens' }).check();
    await expect(nicknames(page)).toHaveText([
      'Bouboule',
      'Jibé',
      'Kiki',
      'Momo',
      'Tonton',
      'Zaza',
    ]);
    await expect(rows(page).filter({ hasText: 'Bouboule' })).toContainText('Parti');
    await expect(page.getByText('1 invitation en attente, 1 ancien.')).toBeVisible();
  });

  test('a choice nobody matches says so', async ({ page }) => {
    sql("UPDATE member SET status = 'ACTIVE' WHERE nickname = 'Tonton'");
    await openList(page);
    await page.getByRole('radio', { name: 'Power members' }).click();

    await expect(page.getByText('Pas de power member pour l’instant.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });

  test('on a desktop it is a table, the status in its own column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openList(page);
    await page.getByRole('switch', { name: 'Afficher les anciens' }).check();

    const table = page.getByRole('table', { name: 'Gérer les fanfarons' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Fanfaron',
      'Instrument',
      'Statut',
      'Rôles',
    ]);
    const line = (nickname: string) => table.getByRole('row').filter({ hasText: nickname });
    await expect(line('Zaza')).toContainText('Actif');
    await expect(line('Tonton')).toContainText('Power member');
    await expect(line('Kiki')).toContainText('Invitation expirée');
    await expect(line('Bouboule')).toContainText('Parti');
    await expect(line('Momo')).toContainText('Gère les fanfarons');
    await expect(line('Jibé')).toContainText('Sax Ténor');
    // The list of a phone is not there twice.
    await expect(rows(page).filter({ visible: true })).toHaveCount(0);

    await table.getByRole('link', { name: 'Ouvrir la fiche de Zaza' }).click();
    await expect(title(page)).toHaveText('Zaza');
  });
});

test.describe('an invitation', () => {
  test('is created with what is known, and gives a link shown once', async ({ page, browser }) => {
    await openList(page);
    await page.locator('.BottomBar').getByRole('button', { name: 'Inviter un fanfaron' }).click();
    await expect(title(page)).toHaveText('Inviter un fanfaron');

    await page.getByLabel('Surnom').fill('Riton');
    await page.getByLabel('Prénom').fill('Henri');
    await page.getByLabel('Nom', { exact: true }).fill('Blanc');
    // The caption above the button says what is still missing.
    await expect(page.getByText('Il manque l’instrument.')).toBeVisible();
    await page.getByRole('button', { name: /^Instrument/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Souba' }).click();
    await page.getByLabel('Adresse email').fill('riton@example.org');
    await page.getByLabel('Téléphone mobile').fill('06 12 34 56 78');
    // With a mail server the invitation leaves by email (#50).
    await expect(
      page.getByText('L’invitation part à cette adresse.', { exact: false }),
    ).toBeVisible();
    await emptyMailbox();
    await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();

    const panel = page.getByRole('dialog', { name: 'Invitation envoyée' });
    await expect(panel).toContainText('Riton la reçoit à riton@example.org');
    await expect(panel).toContainText('Pas reçue ? Envoie-lui ce lien toi-même.');
    const link = await panel.getByLabel('Lien d’invitation').inputValue();
    const [mail] = await receivedMails(1);
    expect(mail?.to).toBe('riton@example.org');
    expect(mail?.text).toContain(link);
    expect(link).toMatch(/^http:\/\/localhost:8081\/invitation#[0-9a-f]{64}$/);
    expect(memberColumns('Riton', 'status, mobilePhone')).toBe('INVITED\t+33612345678');

    // The link opens the invitation of Riton, on another device.
    const other = await browser.newPage();
    await other.goto(link);
    await expect(other.getByRole('heading', { level: 1 })).toHaveText('Bienvenue, Riton !');
    await other.close();

    await panel.getByRole('button', { name: 'Fermer' }).click();
    await expect(rows(page).filter({ hasText: 'Riton' })).toContainText('Invité');

    // Shown once: neither a reload nor the history of the browser brings it back.
    await page.reload();
    await expect(rows(page).filter({ hasText: 'Riton' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toMatch(/[0-9a-f]{64}/);
  });

  test('says until when its link works, is sent again by email, or cancelled (#50)', async ({
    page,
  }) => {
    await signIn(page);
    await record(page, 'Kiki');
    // The link of Kiki has expired: no record form, a status that says so.
    await expect(page.getByText('Invitation expirée')).toBeVisible();
    await expect(page.getByText('Le lien d’invitation ne marche plus')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);

    await emptyMailbox();
    await page.getByRole('button', { name: /Renvoyer l’invitation/ }).click();
    await expect(
      page.getByText(/Invitation envoyée le \d+ \S+\. Le lien marche jusqu’au \d+ \S+/),
    ).toBeVisible();
    expect((await receivedMails(1))[0]?.to).toBe('kiki@example.org');
    // Not again within 5 minutes: the screen says so.
    await page.getByRole('button', { name: /Renvoyer l’invitation/ }).click();
    await expect(page.getByText('Une invitation vient de partir.', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: /Annuler l’invitation/ }).click();
    await expect(page).toHaveURL('/members/manage');
    expect(sql("SELECT COUNT(*) FROM member WHERE nickname = 'Kiki'")).toBe('0');
  });
});

// An instance without a mail server: the link is copied by whoever invites,
// as before 0.4.0 (Members, section 6).
test.describe('an invitation without a mail server', () => {
  test.use({ baseURL: 'http://localhost:8082' });

  test('is created, and its link is shown once to be sent by hand', async ({ page }) => {
    await openList(page);
    await page.locator('.BottomBar').getByRole('button', { name: 'Inviter un fanfaron' }).click();
    await page.getByLabel('Surnom').fill('Riton');
    await page.getByLabel('Prénom').fill('Henri');
    await page.getByLabel('Nom', { exact: true }).fill('Blanc');
    await page.getByRole('button', { name: /^Instrument/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Souba' }).click();
    await page.getByLabel('Adresse email').fill('riton@example.org');
    await page.getByRole('button', { name: 'Créer l’invitation' }).click();

    const panel = page.getByRole('dialog', { name: 'Invitation prête' });
    await expect(panel).toContainText('Envoie ce lien à Riton par le moyen que tu veux.');
    await expect(panel).toContainText('On ne te le montrera plus');
    await expect(panel.getByLabel('Lien d’invitation')).toHaveValue(
      /^http:\/\/localhost:8082\/invitation#[0-9a-f]{64}$/,
    );
  });

  test('an expired one gets a new link to copy', async ({ page }) => {
    await signIn(page);
    await record(page, 'Kiki');
    await expect(page.getByRole('button', { name: /Renvoyer l’invitation/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Créer un nouveau lien/ }).click();
    const panel = page.getByRole('dialog', { name: 'Invitation prête' });
    await expect(panel.getByLabel('Lien d’invitation')).toHaveValue(/\/invitation#[0-9a-f]{64}$/);
    await panel.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByText(/Le lien d’invitation marche jusqu’au \d+ \S+/)).toBeVisible();
  });
});

test.describe('the record of a member', () => {
  test('whoever manages members corrects it; an admin also gives roles', async ({ page }) => {
    await signIn(page);
    await record(page, 'Zaza');
    await expect(title(page)).toHaveText('Zaza');
    await expect(page.getByText('Prénom Nom · Trompette')).toBeVisible();

    await page.getByLabel('Prénom').fill('Isabelle');
    await page.getByLabel('Gère les plans').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page).toHaveURL('/members/manage');
    expect(memberColumns('Zaza', 'firstName')).toBe('Isabelle');
    expect(sql(`SELECT role FROM memberRole WHERE memberId = ${memberId('Zaza')}`)).toBe(
      'GIG_MANAGER',
    );
  });

  test('a member becomes a power member and back, by hand', async ({ page }) => {
    await signIn(page);
    await record(page, 'Zaza');
    await expect(
      page.getByText('Joue régulièrement, reçoit les rappels pour les plans'),
    ).toBeVisible();

    await page.getByRole('button', { name: /Passer en power member/ }).click();
    await expect(page.getByText('Joue moins souvent, ne reçoit pas les rappels')).toBeVisible();
    expect(status('Zaza')).toBe('POWER_MEMBER');

    await page.getByRole('button', { name: /Repasser en actif/ }).click();
    await expect(
      page.getByText('Joue régulièrement, reçoit les rappels pour les plans'),
    ).toBeVisible();
    expect(status('Zaza')).toBe('ACTIVE');
  });

  test('a lost password gets a link, shown once', async ({ page }) => {
    await signIn(page);
    await record(page, 'Zaza');
    await page.getByRole('button', { name: /Créer un lien de mot de passe/ }).click();

    const panel = page.getByRole('dialog', { name: 'Lien prêt' });
    await expect(panel.getByLabel('Lien de mot de passe')).toHaveValue(/\/password#[0-9a-f]{64}$/);
    await expect(panel).toContainText('Zaza');
  });

  test('marking a member as gone asks first, then cuts their access and erases their details', async ({
    page,
  }) => {
    sql("UPDATE member SET mobilePhone = '+33612345678' WHERE nickname = 'Tonton'");
    await signIn(page);
    await record(page, 'Tonton');
    await page.getByRole('button', { name: /Marquer comme parti/ }).click();
    const confirm = page.getByRole('dialog', { name: 'Marquer Tonton comme parti ?' });
    await expect(confirm).toContainText('Son accès est coupé tout de suite.');

    await confirm.getByRole('button', { name: 'Annuler' }).click();
    expect(status('Tonton')).toBe('POWER_MEMBER');

    await page.getByRole('button', { name: /Marquer comme parti/ }).click();
    await confirm.getByRole('button', { name: 'Marquer comme parti' }).click();
    await expect(page.getByText('Coordonnées, photo et rôles effacés à son départ')).toBeVisible();
    expect(sql("SELECT status, mobilePhone IS NULL FROM member WHERE nickname = 'Tonton'")).toBe(
      'LEFT\t1',
    );
    // A member who left is not edited: no form, one action.
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  });

  test('a former member can be brought back: a new invitation, a new link', async ({ page }) => {
    await signIn(page);
    await record(page, 'Bouboule');
    await page.getByRole('button', { name: /Faire revenir Bouboule/ }).click();

    // Invited again by email (#50), with the link shown once too.
    const panel = page.getByRole('dialog', { name: 'Invitation envoyée' });
    await expect(panel.getByLabel('Lien d’invitation')).toHaveValue(/\/invitation#[0-9a-f]{64}$/);
    expect(status('Bouboule')).toBe('INVITED');
  });

  test('the last admin can neither leave nor lose the role, and the screen says why', async ({
    page,
  }) => {
    await signIn(page);
    await record(page, 'Jibé');

    await expect(page.getByText('Jibé est le dernier admin.')).toBeVisible();
    const leave = page.getByRole('button', { name: /Marquer comme parti/ });
    await expect(leave).toBeDisabled();
    await expect(leave).toContainText('Impossible tant qu’il est le seul admin');

    // The role itself cannot be unticked: its line says why, with no box.
    await expect(
      page.getByText('Dernier admin\u00a0: ce rôle ne peut pas lui être retiré'),
    ).toBeVisible();
    await expect(page.getByLabel('Admin', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Gère les plans')).toBeVisible();
  });

  test('who manages members acts on nobody who may do more than them', async ({ page }) => {
    await signIn(page, 'momo@example.org', memberPassword);
    await record(page, 'Jibé');

    for (const name of [
      /Passer en power member/,
      /Créer un lien de mot de passe/,
      /Marquer comme parti/,
    ]) {
      const action = page.getByRole('button', { name });
      await expect(action).toBeDisabled();
      await expect(action).toContainText('Réservé aux admins');
    }
    // The email is what the admin signs in with: Momo reads it, and cannot change it.
    await expect(page.getByLabel('Adresse email')).toHaveAttribute('readonly', '');
    await expect(page.getByText('Réservé aux admins\u00a0: c’est son identifiant')).toBeVisible();
    // Roles are read, not changed: no box to tick.
    await expect(page.getByText('Tout, rôles et réglages compris')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    // A member without a role: Momo acts, and sees no roles to read.
    await record(page, 'Zaza');
    await expect(page.getByRole('button', { name: /Passer en power member/ })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Rôles' })).toHaveCount(0);
  });
});

test('a member whose session ended elsewhere is sent to the sign-in screen at their next action', async ({
  page,
}) => {
  await signIn(page);
  await record(page, 'Zaza');
  await expect(title(page)).toHaveText('Zaza');
  // Signed out from another device, or marked as gone.
  sql('DELETE FROM memberSession');

  await page.getByRole('button', { name: /Passer en power member/ }).click();

  await expect(page).toHaveURL('/sign-in');
  expect(status('Zaza')).toBe('ACTIVE');
});

test('a member without the right is told so, on every address of the management', async ({
  page,
}) => {
  await signIn(page, 'zaza@example.org', memberPassword);

  for (const address of [
    '/members/manage',
    '/members/manage/invite',
    `/members/manage/${memberId('Momo')}`,
  ]) {
    await page.goto(address);
    await expect(title(page), address).toHaveText('Pas par ici');
    await expect(page.getByText('Vois ça avec un admin.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Retour aux fanfarons' }).click();
  await expect(page).toHaveURL('/members');
});

test('at the largest text size with every option on, managing members can still be done', async ({
  page,
}) => {
  sql(`UPDATE member SET hasIncreasedSpacing = 1, hasLegibleFont = 1, hasHighContrast = 1,
         hasReducedMotion = 1, hasExtendedTimeouts = 1 WHERE email = '${admin.email}'`);
  await textSizeOfDevice(page, 200);
  await signIn(page);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  for (const address of [
    '/members/manage',
    '/members/manage/invite',
    `/members/manage/${memberId('Zaza')}`,
  ]) {
    await page.goto(address);
    await expect(title(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');
    expect(await overflow(), address).toBeLessThanOrEqual(0);
  }
});
