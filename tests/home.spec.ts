import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { addGig, addSong, answerOf, day, organise, plays } from './support/gigs.ts';
import { addMember, admin, install, memberId, memberPassword } from './support/scenario.ts';
import { emptyStorage } from './support/storage.ts';

// The home screen: the gigs to come with the answers in place, the alert and
// its filter, the gig of the day, what is new, and the latest songs of the
// repertoire. Rules: model/gigs.md ("New", "The home screen", "The gig of the
// day") and model/songs.md ("The latest songs"); screens: Figma, page Home.
// The gigs and the songs are examples; nobody here is real.

// The band: Jibé the admin (Sax Ténor), Zaza and Lulu (Trompette), Riton
// (Souba), Gigi who manages gigs (Trompette). Three sections, each with a member.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Lulu' });
  addMember({ nickname: 'Riton' });
  plays('Riton', 'Souba');
  addMember({ nickname: 'Gigi', roles: ['GIG_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;

async function signIn(page: Page, who = admin.email, password = admin.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Adresse email').fill(who);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/members');
}

/** Signs a member in and opens the home screen. */
async function homeOf(page: Page, nickname: string) {
  await signIn(page, email(nickname), memberPassword);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: `Salut ${nickname} !` })).toBeVisible();
}

/** The cards of the list of gigs, in order: each one is a link. */
const cards = (page: Page) => page.locator('.home-cards > li');
const card = (page: Page, name: string) => cards(page).filter({ hasText: name });
const answers = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: `Ta réponse pour ${name}` });
const answerOfMember = (nickname: string, slotId: number) =>
  sql(
    `SELECT answer FROM gigSlotAttendance WHERE gigSlotId = ${slotId} AND memberId = ${memberId(nickname)}`,
  );

test.describe('the gigs to come', () => {
  test('one list, the nearest first; the alert counts the gigs to answer, and its filter is off', async ({
    page,
  }) => {
    const done = addGig('Vide-grenier', { status: 'CONFIRMED', startsOn: day(3) });
    answerOf('Zaza', done.slotId, 'YES');
    addGig('Anniversaire de Margaux', { status: 'ACCEPTED', startsOn: day(10) });
    addGig('Fête des Lumières', {
      startsOn: day(40),
      endsOn: day(42),
      slots: ['Vendredi soir', 'Samedi soir'],
    });
    addGig('Fête de la soupe', { status: 'CANCELLED', startsOn: day(15) });
    addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(-30) });
    await homeOf(page, 'Zaza');

    await expect(page.getByRole('heading', { level: 2, name: 'Plans à venir' })).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(0)).toContainText('Vide-grenier');
    await expect(cards(page).nth(1)).toContainText('Anniversaire de Margaux');
    await expect(cards(page).nth(2)).toContainText('Fête des Lumières');

    await expect(page.getByText('2 plans attendent ta réponse')).toBeVisible();
    await expect(page.getByRole('button', { name: 'N’afficher que ceux-là' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // No hero: none of them is today.
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('answering from the home screen lowers the count, and takes the gig out when the filter is on', async ({
    page,
  }) => {
    const done = addGig('Vide-grenier', { status: 'CONFIRMED', startsOn: day(3) });
    answerOf('Zaza', done.slotId, 'YES');
    const margaux = addGig('Anniversaire de Margaux', { status: 'ACCEPTED', startsOn: day(10) });
    const soup = addGig('Fête de la soupe', { startsOn: day(20) });
    addGig('Fête des Lumières', {
      startsOn: day(40),
      endsOn: day(42),
      slots: ['Vendredi soir', 'Samedi soir'],
    });
    await homeOf(page, 'Zaza');

    // A gig already answered shows the answer, not the four choices.
    await expect(card(page, 'Vide-grenier')).toContainText('Oui');
    await expect(answers(page, 'Vide-grenier')).toHaveCount(0);

    // Filter off: the answer is saved, the count goes down, the card stays with the answer on it.
    await expect(page.getByText('3 plans attendent ta réponse')).toBeVisible();
    await expect(card(page, 'Anniversaire de Margaux')).toContainText('À répondre');
    await answers(page, 'Anniversaire de Margaux')
      .getByRole('radio', { name: 'Peut-être', exact: true })
      .click();
    await expect(page.getByText('2 plans attendent ta réponse')).toBeVisible();
    await expect(answers(page, 'Anniversaire de Margaux')).toHaveCount(0);
    await expect(card(page, 'Anniversaire de Margaux')).toContainText('Peut-être');
    await expect(card(page, 'Anniversaire de Margaux')).not.toContainText('À répondre');
    expect(answerOfMember('Zaza', margaux.slotId)).toBe('MAYBE');
    // The focus follows the card whose choices just left.
    await expect(card(page, 'Anniversaire de Margaux').getByRole('link')).toBeFocused();

    // Filter on: only the gigs to answer, under another title.
    await page.getByRole('button', { name: 'N’afficher que ceux-là' }).click();
    await expect(page.getByRole('button', { name: 'N’afficher que ceux-là' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const title = page.getByRole('heading', { level: 2, name: 'Plans à répondre' });
    await expect(title).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText('Fête de la soupe');
    await expect(cards(page).nth(1)).toContainText('Fête des Lumières');

    // Answering takes the gig out of the list at once.
    await answers(page, 'Fête de la soupe')
      .getByRole('radio', { name: 'Non', exact: true })
      .click();
    await expect(card(page, 'Fête de la soupe')).toHaveCount(0);
    await expect(page.getByText('1 plan attend ta réponse')).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    expect(answerOfMember('Zaza', soup.slotId)).toBe('NO');
    await expect(title).toBeFocused();

    // Filter off again: the answered gig is back, with the answer.
    await page.getByRole('button', { name: 'N’afficher que ceux-là' }).click();
    await expect(card(page, 'Fête de la soupe')).toContainText('Non');
    await expect(cards(page)).toHaveCount(4);
  });

  test('once nothing waits, the alert leaves with its filter and the member is up to date', async ({
    page,
  }) => {
    addGig('Fête de la soupe', { startsOn: day(20) });
    const done = addGig('Vide-grenier', { status: 'CONFIRMED', startsOn: day(30) });
    answerOf('Zaza', done.slotId, 'YES');
    await homeOf(page, 'Zaza');

    await page.getByRole('button', { name: 'N’afficher que ceux-là' }).click();
    await expect(cards(page)).toHaveCount(1);
    await answers(page, 'Fête de la soupe')
      .getByRole('radio', { name: 'Oui', exact: true })
      .click();

    await expect(page.getByText('Tu es à jour, rien à répondre.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'N’afficher que ceux-là' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Plans à venir' })).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
  });

  test('a gig with several slots has no answers in place: it opens the gig', async ({ page }) => {
    const lights = addGig('Fête des Lumières', {
      startsOn: day(40),
      endsOn: day(42),
      slots: ['Vendredi soir', 'Samedi soir'],
    });
    await homeOf(page, 'Zaza');

    await expect(card(page, 'Fête des Lumières')).toContainText('À répondre');
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await card(page, 'Fête des Lumières').getByRole('link').click();
    await expect(page).toHaveURL(`/gigs/${lights.gigId}`);
    await expect(page.getByRole('radiogroup')).toHaveCount(2);
  });

  test('a member does not see the drafts; who manages gigs does, without answers nor “Nouveau”', async ({
    page,
  }) => {
    addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(20) });
    const mine = addGig('Carnaval', { status: 'DRAFT', startsOn: day(25) });
    organise(mine.gigId, 'Lulu');
    // Proposed and never played: to close for who may edit it, behind us for everyone.
    addGig('Braderie', { startsOn: day(-5) });
    await homeOf(page, 'Zaza');
    await expect(page.getByRole('heading', { name: 'Pas de plan à l’horizon' })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByText('Tu es à jour, rien à répondre.')).toBeVisible();

    // An organiser sees their own draft only.
    await page.context().clearCookies();
    await homeOf(page, 'Lulu');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toContainText('Carnaval');

    await page.context().clearCookies();
    await homeOf(page, 'Gigi');
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).nth(0)).toContainText('Soirée au Ninkasi');
    await expect(cards(page).nth(0)).toContainText('Brouillon');
    await expect(cards(page)).not.toContainText(['Nouveau', 'Nouveau']);
    await expect(page.getByText('Braderie')).toHaveCount(0);
    // Nobody answers for a draft: nothing waits.
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByText('Tu es à jour, rien à répondre.')).toBeVisible();
  });
});

test.describe('the gig of the day', () => {
  test('the hero is shown on the day of a confirmed gig only, in place of its card', async ({
    page,
  }) => {
    const today = addGig('Vide-grenier', {
      status: 'CONFIRMED',
      startsOn: day(0),
      meetingTime: '10:00',
      placeName: 'Boulevard de la Croix-Rousse',
    });
    sql(`UPDATE gig SET postalCode = '69004', city = 'Lyon' WHERE id = ${today.gigId}`);
    answerOf('Zaza', today.slotId, 'YES');
    // Today too, and not confirmed: a card.
    addGig('Anniversaire de Margaux', { status: 'ACCEPTED', startsOn: day(0) });
    // Confirmed, and tomorrow: a card today, the hero tomorrow.
    addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(1) });
    const at = (fromToday: number, time: string) => new Date(`${day(fromToday)}T${time}:00`);
    await page.clock.install({ time: at(0, '08:00') });
    await homeOf(page, 'Zaza');

    await expect(page.getByText('Y’a un plan aujourd’hui.')).toBeVisible();
    const hero = page.getByRole('article');
    await expect(hero).toHaveCount(1);
    await expect(hero.getByRole('heading', { name: 'Vide-grenier' })).toBeVisible();
    await expect(hero).toContainText('Aujourd’hui · RDV dans 2 h');
    await expect(hero).toContainText('RDV 10 h');
    await expect(hero).toContainText('Boulevard de la Croix-Rousse, 69004 Lyon');
    await expect(hero).toContainText('Validé');
    await expect(hero).toContainText('Oui');
    await expect(hero.getByRole('button', { name: 'Y aller' })).toBeVisible();
    // Its card is not in the list; the two others are.
    await expect(cards(page)).toHaveCount(2);
    await expect(card(page, 'Vide-grenier')).toHaveCount(0);

    // Less than an hour before, then once the time has come.
    await page.clock.setFixedTime(at(0, '09:25'));
    await page.reload();
    await expect(hero).toContainText('Aujourd’hui · RDV dans 35 min');
    await page.clock.setFixedTime(at(0, '10:05'));
    await page.reload();
    await expect(hero).toContainText('Aujourd’hui · En cours');

    // The whole card opens the gig.
    await hero.getByRole('link', { name: 'Vide-grenier' }).click();
    await expect(page).toHaveURL(`/gigs/${today.gigId}`);

    // The day after: the gig of yesterday is behind us, the next one is the hero.
    await page.clock.setFixedTime(at(1, '08:00'));
    await page.goto('/');
    await expect(hero).toHaveCount(1);
    await expect(hero.getByRole('heading', { name: 'Mariage de Clémence' })).toBeVisible();
    await expect(hero).toContainText('Aujourd’hui');
    await expect(hero).not.toContainText('RDV');
    await expect(page.getByText('Vide-grenier')).toHaveCount(0);
  });

  test('a gig of several days is the hero every day; a gig without a place has no “Y aller”', async ({
    page,
  }) => {
    addGig('Fête des Lumières', {
      status: 'CONFIRMED',
      startsOn: day(-1),
      endsOn: day(1),
      meetingTime: '18:00',
    });
    await homeOf(page, 'Zaza');

    const hero = page.getByRole('article');
    await expect(hero).toContainText('Aujourd’hui · En cours');
    await expect(hero.getByRole('button', { name: 'Y aller' })).toHaveCount(0);
    // The only gig to come is the hero: no empty list under it.
    await expect(page.getByRole('heading', { name: 'Plans à venir' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pas de plan à l’horizon' })).toHaveCount(0);
  });
});

test('two gigs on the same day: the one that meets first comes first, and the alert leaves them out', async ({
  page,
}) => {
  addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(0), meetingTime: '18:00' });
  addGig('Vide-grenier', { status: 'CONFIRMED', startsOn: day(0), meetingTime: '09:30' });
  await homeOf(page, 'Zaza');

  const heroes = page.getByRole('article');
  await expect(heroes).toHaveCount(2);
  await expect(heroes.nth(0)).toContainText('Vide-grenier');
  await expect(heroes.nth(1)).toContainText('Mariage de Clémence');
  // Zaza has answered neither: said on each of them, and answered on the gig.
  await expect(heroes.nth(0)).toContainText('À répondre');
  await expect(page.locator('.AlertCard')).toHaveCount(0);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
});

test.describe('what is new', () => {
  test('“Nouveau” is shown for 15 days after the gig was proposed, with the day in words', async ({
    page,
  }) => {
    addGig('Marché de Noël', { startsOn: day(60), proposedDaysAgo: 1 });
    addGig('Fête de la soupe', { startsOn: day(50), proposedDaysAgo: 14 });
    addGig('Carnaval', { startsOn: day(70), proposedDaysAgo: 16 });
    await homeOf(page, 'Zaza');

    await expect(card(page, 'Marché de Noël')).toContainText('Nouveau');
    await expect(card(page, 'Marché de Noël')).toContainText('Proposé hier');
    await expect(card(page, 'Fête de la soupe')).toContainText('Proposé il y a 14 jours');
    await expect(card(page, 'Carnaval')).not.toContainText('Nouveau');
    await expect(page.getByText('3 plans attendent ta réponse')).toBeVisible();
    await expect(page.getByText('Dont 2 nouveaux.')).toBeVisible();

    // Two days later the second one is no longer new.
    await page.clock.install({ time: new Date(Date.now() + 2 * 86_400_000) });
    await page.reload();
    await expect(card(page, 'Marché de Noël')).toContainText('Proposé il y a 3 jours');
    await expect(card(page, 'Fête de la soupe')).not.toContainText('Nouveau');
    await expect(page.getByText('Dont 1 nouveau.')).toBeVisible();

    // Fifteen days after it was proposed, the first one neither.
    await page.clock.setFixedTime(new Date(Date.now() + 14 * 86_400_000 + 3_600_000));
    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText('Nouveau', { exact: true })).toHaveCount(0);
    await expect(page.getByText('3 plans attendent ta réponse')).toBeVisible();
    await expect(page.getByText(/Dont \d/)).toHaveCount(0);
  });

  test('a gig cancelled then reopened does not become new again', async ({ page }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(40), proposedDaysAgo: 20 });
    addGig('Marché de Noël', { startsOn: day(60) });
    await homeOf(page, 'Gigi');
    await expect(card(page, 'Marché de Noël')).toContainText('Proposé aujourd’hui');
    await expect(card(page, 'Carnaval')).not.toContainText('Nouveau');

    for (const status of ['CANCELLED', 'PROPOSED']) {
      const moved = await page.request.put(`/api/gigs/${gigId}/status`, { data: { status } });
      expect(moved.status(), status).toBe(200);
    }
    await page.reload();
    await expect(card(page, 'Carnaval')).toContainText('Proposition');
    await expect(card(page, 'Carnaval')).not.toContainText('Nouveau');
  });
});

test.describe('the latest songs', () => {
  test('the three songs of the repertoire created last, the latest first; the cross hides them until the app is opened again', async ({
    page,
  }) => {
    const created = (name: string, status: Parameters<typeof addSong>[1], daysAgo: number) =>
      sql(
        `UPDATE song SET createdAt = UTC_TIMESTAMP() - INTERVAL ${daysAgo} DAY WHERE id = ${addSong(name, status)}`,
      );
    created('Toxic', 'IN_REPERTOIRE', 30);
    created('Hey Ya', 'IN_REPERTOIRE', 2);
    created('Crazy', 'IN_REPERTOIRE', 90);
    created('The Look', 'IN_REPERTOIRE', 10);
    // Created last, and not in the repertoire: not one of them.
    created('Seven Nation', 'PROPOSED', 1);
    const heyYa = Number(sql("SELECT id FROM song WHERE name = 'Hey Ya'"));
    addGig('Fête de la soupe', { startsOn: day(20) });
    await homeOf(page, 'Zaza');

    const panel = page.getByRole('region', { name: 'Derniers morceaux au répertoire' });
    await expect(panel.getByRole('listitem')).toHaveText([/Hey Ya/, /The Look/, /Toxic/]);

    // The cross: gone, and still gone when coming back from another tab.
    await panel.getByRole('button', { name: 'Fermer' }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole('link', { name: 'Fanfarons' }).click();
    await expect(page).toHaveURL('/members');
    await page.getByRole('link', { name: 'Accueil' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(panel).toHaveCount(0);

    // Nothing was stored: the panel is back when the app is opened again.
    await page.reload();
    await expect(panel).toBeVisible();
    await panel.getByRole('link', { name: /Hey Ya/ }).click();
    await expect(page).toHaveURL(`/songs/${heyYa}`);
  });

  test('no gig to come and an empty repertoire: an empty list, and no panel', async ({ page }) => {
    addSong('Seven Nation', 'PROPOSED');
    await homeOf(page, 'Zaza');

    await expect(page.getByText('Tu es à jour, rien à répondre.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pas de plan à l’horizon' })).toBeVisible();
    await expect(
      page.getByText('Profites-en pour bosser tes morceaux. On te prévient dès qu’un plan tombe.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Derniers morceaux au répertoire' })).toHaveCount(
      0,
    );
    await expect(page.locator('.AlertCard')).toHaveCount(0);
  });
});

test('gigs that do not load are said, and asked again with “Réessayer”', async ({ page }) => {
  addGig('Fête de la soupe', { startsOn: day(20) });
  addSong('Hey Ya');
  await signIn(page, email('Zaza'), memberPassword);
  await page.route('**/api/gigs', (route) => route.abort());
  await page.goto('/');

  await expect(
    page.getByText('Impossible de charger les plans. Vérifie ta connexion, puis réessaie.'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Zaza !' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Derniers morceaux au répertoire' })).toHaveCount(
    0,
  );

  await page.unroute('**/api/gigs');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Derniers morceaux au répertoire' })).toBeVisible();
});
