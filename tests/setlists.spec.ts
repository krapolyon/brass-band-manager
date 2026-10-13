import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { addGig, addSetlist, addSong, day } from './support/gigs.ts';
import { addMember, admin, install, memberId, memberPassword } from './support/scenario.ts';
import { emptyStorage } from './support/storage.ts';

// The setlists of a gig: in the gig, their form, and the live screen. Rules:
// model/gigs.md, entry 4; screens: Figma, page Gigs, sections 11 and 15. The
// songs and the gigs are examples; nobody here is real.

// The band: Jibé the admin, Zaza a member, Sissi who manages setlists.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sissi', roles: ['SETLIST_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;

async function signIn(page: Page, who = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(who);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/members');
}
const asMember = (page: Page, nickname: string) => signIn(page, email(nickname), memberPassword);
const confirmed = (name = 'Vide-grenier', slots?: string[]) =>
  addGig(name, { status: 'CONFIRMED', startsOn: day(3), meetingTime: '09:30', slots });
const liveOf = (setlistId: number) =>
  sql(`SELECT livePosition FROM setlist WHERE id = ${setlistId}`);

test.describe('the setlists of a gig', () => {
  test('a member reads them as an accordion and opens a song; nothing to write or start', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const [toxic, valerie] = [addSong('Toxic'), addSong('Valerie')];
    addSetlist(gigId, slotId, [toxic, valerie, toxic], 'Déambulation, 45 min');
    addSetlist(gigId, slotId, [valerie], 'Après le repas');
    addSetlist(gigId, slotId, []);
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    // The first one is open, the others closed with their count.
    const first = page.getByRole('button', { name: /Setlist n° 1/ });
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(first).toContainText('Déambulation, 45 min · 3 morceaux');
    await expect(page.getByRole('listitem').filter({ hasText: 'Toxic' })).toHaveCount(2);
    const second = page.getByRole('button', { name: /Setlist n° 2/ });
    await expect(second).toHaveAttribute('aria-expanded', 'false');
    await expect(second).toContainText('Après le repas · 1 morceau');
    await expect(page.getByRole('button', { name: /Setlist n° 3/ })).toContainText('aucun morceau');
    // One open at a time.
    await second.click();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listitem').filter({ hasText: 'Toxic' })).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Modifier la setlist' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nouvelle setlist' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /en direct/ })).toHaveCount(0);

    // A song opens the song.
    await page.getByRole('link', { name: /Valerie/ }).click();
    await expect(page).toHaveURL(`/songs/${valerie}`);
  });

  test('before “Validé” a gig shows no setlist; without one, only who writes them is told', async ({
    page,
    context,
  }) => {
    const accepted = addGig('Carnaval', { status: 'ACCEPTED', startsOn: day(5) });
    const { gigId } = confirmed();
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible();
    await expect(page.getByText('Pas encore de setlist')).toHaveCount(0);

    await context.clearCookies();
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByText('Pas encore de setlist pour ce plan.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle setlist' })).toBeVisible();
    await page.goto(`/gigs/${accepted.gigId}`);
    await expect(page.getByRole('heading', { name: 'Ta réponse' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle setlist' })).toHaveCount(0);
    await page.goto(`/gigs/${accepted.gigId}/setlists/new`);
    await expect(
      page.getByText('Une setlist s’écrit une fois le plan en « Validé ».'),
    ).toBeVisible();
  });
});

test.describe('writing a setlist', () => {
  test('who manages setlists writes one by typing: slot, songs in order, one twice, moved, removed', async ({
    page,
  }) => {
    const { gigId, slotIds } = confirmed('Fête des Lumières', ['Vendredi soir', 'Samedi soir']);
    const [toxic, valerie] = [addSong('Toxic'), addSong('Valerie', 'TEMPORARY')];
    addSong('Vesoul', 'PROPOSED');
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}`);
    await page.getByRole('button', { name: 'Nouvelle setlist' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Setlist n° 1' })).toBeVisible();
    await expect(page.getByText('Pas encore de morceau.')).toBeVisible();
    await page.getByLabel('Présence').selectOption({ label: 'Samedi soir' });
    await page.getByLabel('Description').fill('Place des Terreaux, 21 h');

    // A few letters, without their case: only the songs the band plays.
    const field = page.getByLabel('Ajouter un morceau');
    await field.fill('V');
    const suggestions = page.getByRole('list', { name: 'Suggestions' });
    await expect(suggestions.getByRole('button')).toHaveCount(1);
    await expect(suggestions.getByRole('button', { name: 'Ajouter Valerie' })).toBeVisible();
    // Enter adds the first suggestion, and the field is ready for the next.
    await field.press('Enter');
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Valerie ajouté en n° 1.' }),
    ).toHaveCount(1);
    await field.fill('tox');
    await field.press('Enter');
    // A song can come back: the app says where it is already.
    await field.fill('vale');
    await expect(suggestions.getByText('Valerie · déjà en n° 1')).toBeVisible();
    await suggestions.getByRole('button').click();
    // Touched instead of Enter: the field is ready for the next one all the same.
    await expect(field).toBeFocused();
    await field.fill('zzz');
    await expect(suggestions.getByText('Aucun morceau au répertoire ni temporaire')).toBeVisible();
    await field.fill('');

    // Valerie, Toxic, Valerie: the last one goes up, the first one goes away.
    await page.getByRole('button', { name: 'Actions de Valerie' }).last().click();
    let panel = page.getByRole('dialog', { name: 'Valerie · n° 3' });
    await expect(panel.getByRole('button', { name: 'Descendre' })).toBeDisabled();
    await panel.getByRole('button', { name: 'Monter' }).click();
    await expect(page.getByRole('dialog', { name: 'Valerie · n° 2' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('button', { name: 'Actions de Valerie' }).first().click();
    panel = page.getByRole('dialog', { name: 'Valerie · n° 1' });
    await panel.getByRole('button', { name: 'Retirer de la setlist' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Valerie retiré de la setlist.' }),
    ).toHaveCount(1);
    await expect(field).toBeFocused();
    expect(sql('SELECT COUNT(*) FROM setlist')).toBe('0');

    await page.getByRole('button', { name: 'Enregistrer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    await expect(page.getByRole('button', { name: /Setlist n° 1/ })).toContainText(
      'Place des Terreaux, 21 h · 2 morceaux',
    );
    expect(sql('SELECT gigSlotId, number, description FROM setlist')).toBe(
      `${slotIds[1]}\t1\tPlace des Terreaux, 21 h`,
    );
    expect(sql('SELECT songId FROM setlistSong ORDER BY position')).toBe(`${valerie}\n${toxic}`);
  });

  test('leaving with changes asks first; deleting asks first and keeps the numbers of the others', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    addSetlist(gigId, slotId, [toxic], 'Déambulation');
    const second = addSetlist(gigId, slotId, [toxic, toxic], 'Après le repas');
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}`);
    await page.getByRole('button', { name: 'Modifier la setlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Setlist n° 1' })).toBeVisible();
    // One slot: nothing to choose.
    await expect(page.getByLabel('Présence')).toHaveCount(0);

    // Nothing changed: the way back leaves at once.
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);

    await page.getByRole('button', { name: 'Modifier la setlist' }).click();
    await page.getByLabel('Description').fill('Parade');
    await page.getByRole('button', { name: 'Retour' }).click();
    let panel = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });
    await panel.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByLabel('Description')).toHaveValue('Parade');
    await page.getByRole('button', { name: 'Retour' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Quitter sans enregistrer' })
      .click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    expect(sql('SELECT description FROM setlist ORDER BY number')).toBe(
      'Déambulation\nAprès le repas',
    );

    await page.getByRole('button', { name: 'Modifier la setlist' }).click();
    await page.getByRole('button', { name: 'Supprimer la setlist' }).click();
    panel = page.getByRole('dialog', { name: 'Supprimer la setlist n° 1 ?' });
    await expect(panel.getByText('Son morceau part avec elle')).toBeVisible();
    await panel.getByRole('button', { name: 'Annuler' }).click();
    expect(sql('SELECT COUNT(*) FROM setlist')).toBe('2');
    await page.getByRole('button', { name: 'Supprimer la setlist' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    await expect(page.getByRole('button', { name: /Setlist n° 2/ })).toBeVisible();
    expect(sql('SELECT id, number FROM setlist')).toBe(`${second}\t2`);
    expect(sql('SELECT COUNT(*) FROM song')).toBe('1');
  });

  test('a member without the right is told so, on a new setlist as on one that exists', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, []);
    await asMember(page, 'Zaza');
    for (const address of [`/gigs/${gigId}/setlists/new`, `/gigs/${gigId}/setlists/${setlistId}`]) {
      await page.goto(address);
      await expect(
        page.getByText('c’est pour celles et ceux qui gèrent les setlists'),
      ).toBeVisible();
      await expect(page.getByLabel('Description')).toHaveCount(0);
    }
  });
});

test.describe('the live setlist', () => {
  test('who manages setlists starts it, moves it on with one button, goes back, and ends it', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, [
      addSong('Toxic'),
      addSong('Valerie'),
      addSong('Crazy'),
    ]);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}`);
    await page.getByRole('button', { name: 'Lancer en direct' }).click();

    await expect(page).toHaveURL(`/setlists/${setlistId}/live`);
    await expect(page.getByRole('heading', { level: 1, name: 'Setlist n° 1' })).toBeVisible();
    await expect(page.getByText('Vide-grenier')).toBeVisible();
    // The whole window: no tab bar, no menu.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const songs = page.getByRole('list', { name: 'Les morceaux de la setlist' });
    const playing = songs.locator('[aria-current="true"]');
    await expect(playing).toHaveText('Toxic');
    await expect(page.getByRole('status').filter({ hasText: '1/3 · Toxic' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(playing).toHaveText('Valerie');
    expect(liveOf(setlistId)).toBe('2');
    // Back, for the keyboard: the button shows when it has the focus.
    const previous = page.getByRole('button', { name: 'Morceau précédent' });
    await expect(previous).toHaveCSS('opacity', '0');
    await previous.focus();
    await expect(previous).toHaveCSS('opacity', '1');
    await page.keyboard.press('Enter');
    // It keeps the focus, for the next press.
    await expect(previous).toBeFocused();
    await expect(playing).toHaveText('Toxic');
    await expect.poll(() => liveOf(setlistId)).toBe('1');

    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(playing).toHaveText('Valerie');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(playing).toHaveText('Crazy');
    // The last song: the one button ends the setlist.
    await expect(page.getByRole('button', { name: 'Suivant' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    expect(liveOf(setlistId)).toBe('NULL');
    await expect(page.getByRole('button', { name: 'Lancer en direct' })).toBeVisible();
  });

  test('a member follows it: the chip on the gig, the same list without a button, moved by who manages', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, [
      addSong('Toxic'),
      addSong('Valerie'),
      addSong('Crazy'),
    ]);
    sql(
      `UPDATE setlist SET liveStartedAt = UTC_TIMESTAMP(), livePosition = 2 WHERE id = ${setlistId}`,
    );
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    await expect(page.getByRole('button', { name: /Setlist n° 1/ })).toContainText(
      'En direct · 2/3',
    );
    await page.getByRole('button', { name: 'Suivre en direct' }).click();
    await expect(page).toHaveURL(`/setlists/${setlistId}/live`);
    const playing = page.locator('.gigs-liveSongs [aria-current="true"]');
    await expect(playing).toHaveText('Valerie');
    await expect(
      page.getByRole('button', { name: /Suivant|Terminer|précédent|Gérer/ }),
    ).toHaveCount(0);

    // Their scrolling never moves the setlist: nothing is even asked of the server.
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url());
    });
    await page.locator('.gigs-liveSongs').evaluate((list) => list.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    expect(writes).toEqual([]);
    expect(liveOf(setlistId)).toBe('2');
    // The setlist moves on the phone of who manages it: the screen follows.
    sql(`UPDATE setlist SET livePosition = 3 WHERE id = ${setlistId}`);
    await expect(playing).toHaveText('Crazy', { timeout: 10_000 });
    // Ended: said, and nothing is being played any more.
    sql(`UPDATE setlist SET liveStartedAt = NULL, livePosition = NULL WHERE id = ${setlistId}`);
    await expect(page.getByText('Cette setlist n’est pas en direct.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(playing).toHaveCount(0);
    // The songs stay readable: none is faded.
    await expect(page.locator('.gigs-liveSongs li').first()).toHaveCSS('opacity', '1');
    // Deleted meanwhile: said too, instead of a list that no longer moves.
    sql(`DELETE FROM setlist WHERE id = ${setlistId}`);
    await expect(page.getByText('Cette setlist n’existe pas, ou plus.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.gigs-liveSongs')).toHaveCount(0);
  });

  test('who manages setlists corrects by scrolling: the song that rests on the line is played', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(
      gigId,
      slotId,
      ['Toxic', 'Valerie', 'Crazy', 'Rasputin'].map((name) => addSong(name)),
    );
    sql(
      `UPDATE setlist SET liveStartedAt = UTC_TIMESTAMP(), livePosition = 1 WHERE id = ${setlistId}`,
    );
    await asMember(page, 'Sissi');
    await page.goto(`/setlists/${setlistId}/live`);
    const playing = page.locator('.gigs-liveSongs [aria-current="true"]');
    await expect(playing).toHaveText('Toxic');
    await page.waitForTimeout(1000);

    // The third song is brought to the focus line.
    await page.locator('.gigs-liveSongs').evaluate((node) => {
      const list = node as HTMLElement;
      const row = list.children[2] as HTMLElement;
      const line = Number.parseFloat(getComputedStyle(list).paddingTop);
      list.scrollTo(0, row.offsetTop - list.offsetTop - line);
    });
    await expect(playing).toHaveText('Crazy');
    await expect.poll(() => liveOf(setlistId)).toBe('3');
  });

  test('on a desktop it takes the whole window, and at 200 % nothing spills out', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed('Vide-grenier de la Croix-Rousse');
    const setlistId = addSetlist(
      gigId,
      slotId,
      ['Get Lucky', 'Crazy', 'Seven Nation Army', 'Valerie'].map((name) => addSong(name)),
    );
    sql(
      `UPDATE setlist SET liveStartedAt = UTC_TIMESTAMP(), livePosition = 3 WHERE id = ${setlistId}`,
    );
    sql(
      `UPDATE member SET textSizePercent = 200, hasLegibleFont = 1 WHERE id = ${memberId('Sissi')}`,
    );
    await asMember(page, 'Sissi');
    await page.goto(`/setlists/${setlistId}/live`);
    await expect(page.locator('.gigs-liveSongs [aria-current="true"]')).toHaveText(
      'Seven Nation Army',
    );
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 1280, height: 844 });
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const column = await page.locator('.gigs-liveColumn').boundingBox();
    expect(column?.width).toBe(560);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test('when the network is lost the screen says what it shows may be old, and a failed change goes back', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(
      gigId,
      slotId,
      ['Toxic', 'Valerie', 'Crazy'].map((name) => addSong(name)),
    );
    sql(
      `UPDATE setlist SET liveStartedAt = UTC_TIMESTAMP(), livePosition = 1 WHERE id = ${setlistId}`,
    );
    await asMember(page, 'Sissi');
    await page.goto(`/setlists/${setlistId}/live`);
    const playing = page.locator('.gigs-liveSongs [aria-current="true"]');
    await expect(playing).toHaveText('Toxic');

    await page.route(`**/api/setlists/${setlistId}**`, (route) => route.abort());
    await expect(page.getByText('ce que tu vois date peut-être un peu')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Le changement n’est pas passé.')).toBeVisible();
    await expect(playing).toHaveText('Toxic');
    expect(liveOf(setlistId)).toBe('1');

    await page.unroute(`**/api/setlists/${setlistId}**`);
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(playing).toHaveText('Valerie');
    await expect(page.getByText('Le changement n’est pas passé.')).toHaveCount(0);
    await expect(page.getByText('ce que tu vois date peut-être un peu')).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test('at 200 % the two songs just played stay whole above the one being played', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(
      gigId,
      slotId,
      ['Get Lucky', 'Crazy', 'Toxic', 'Valerie'].map((name) => addSong(name)),
    );
    sql(
      `UPDATE setlist SET liveStartedAt = UTC_TIMESTAMP(), livePosition = 3 WHERE id = ${setlistId}`,
    );
    sql(`UPDATE member SET textSizePercent = 200 WHERE id = ${memberId('Zaza')}`);
    await asMember(page, 'Zaza');
    await page.goto(`/setlists/${setlistId}/live`);
    await expect(page.locator('.gigs-liveSongs [aria-current="true"]')).toHaveText('Toxic');
    await page.waitForTimeout(1200);
    const list = await page.locator('.gigs-liveSongs').boundingBox();
    const first = await page.locator('.gigs-liveSongs li').first().boundingBox();
    expect(first?.y).toBeGreaterThanOrEqual(list?.y ?? 0);
  });

  test('a setlist that is not live says so, and one that does not exist too', async ({ page }) => {
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, [addSong('Toxic')]);
    await asMember(page, 'Zaza');
    await page.goto(`/setlists/${setlistId}/live`);
    await expect(page.getByText('Cette setlist n’est pas en direct.')).toBeVisible();
    await page.goto('/setlists/9999/live');
    await expect(page.getByText('Cette setlist n’existe pas, ou plus.')).toBeVisible();
  });
});
