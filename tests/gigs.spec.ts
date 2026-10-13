import { expect, type Page, test } from '@playwright/test';
import { emptyDatabase, sql } from './support/database.ts';
import { addCostume, addGig, answerOf, day, organise, plays } from './support/gigs.ts';
import { png } from './support/images.ts';
import { addMember, admin, install, memberId, memberPassword } from './support/scenario.ts';
import { emptyStorage, storedFiles } from './support/storage.ts';

// The screens of gigs: the list, a gig in its states, the answers, what who
// may edit a gig does (form, status, answering for someone), and the
// costumes and reminders of the band settings. Rules: model/gigs.md;
// screens: Figma, page Gigs. The gigs are examples; nobody here is real.

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
const asMember = (page: Page, nickname: string) => signIn(page, email(nickname), memberPassword);
const statusOf = (gigId: number) => sql(`SELECT status FROM gig WHERE id = ${gigId}`);

test.describe('the list', () => {
  test('a member sees the gigs to come by month, not the drafts, and what they owe', async ({
    page,
  }) => {
    const margaux = addGig('Anniversaire de Margaux', {
      status: 'ACCEPTED',
      startsOn: day(10),
      meetingTime: '17:30',
      placeName: 'Salle des fêtes',
    });
    answerOf('Lulu', margaux.slotId, 'YES');
    answerOf('Jibé', margaux.slotId, 'YES');
    const done = addGig('Vide-grenier', { status: 'CONFIRMED', startsOn: day(3) });
    answerOf('Zaza', done.slotId, 'YES');
    addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(20) });
    addGig('Fête de la soupe', { status: 'CANCELLED', startsOn: day(15) });
    addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(-30) });
    await asMember(page, 'Zaza');
    await page.goto('/gigs');

    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await expect(page.getByText('2 plans à venir, dont 1 qui attend ta réponse.')).toBeVisible();
    const cards = page
      .getByRole('link')
      .filter({ hasText: /Vide-grenier|Margaux|Ninkasi|soupe|Mariage/ });
    await expect(cards).toHaveCount(2);

    // The nearest first; the status and her answer on each card; the banner while it matters.
    await expect(cards.nth(0)).toContainText('Vide-grenier');
    await expect(cards.nth(0)).toContainText('Validé');
    await expect(cards.nth(0)).toContainText('Oui');
    await expect(cards.nth(0)).not.toContainText('Jouable');
    await expect(cards.nth(1)).toContainText('Manque : Souba');
    await expect(cards.nth(1)).toContainText('RDV 17 h 30');
    await expect(cards.nth(1)).toContainText('Accepté');
    await expect(cards.nth(1)).toContainText('À répondre');

    // Nothing to create, nothing "to handle".
    await expect(page.getByRole('button', { name: 'Ajouter' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'À traiter' })).toHaveCount(0);

    // The cancelled and the past ones, on request.
    await page.getByRole('button', { name: 'Annulés' }).click();
    await expect(page.getByRole('link', { name: /Fête de la soupe/ })).toContainText('Annulé');
    await page.getByRole('button', { name: 'Passés' }).click();
    await expect(page.getByRole('link', { name: /Mariage de Clémence/ })).toContainText('Validé');
    await expect(page.getByRole('link', { name: /Ninkasi/ })).toHaveCount(0);
  });

  test('who manages gigs gets the drafts and the gigs to close first, and the way to add one', async ({
    page,
  }) => {
    addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(40) });
    addGig('Pique-nique des Pentes', { startsOn: day(-5), placeName: 'Jardin des Chartreux' });
    addGig('Carnaval', { startsOn: day(12) });
    await asMember(page, 'Gigi');
    await page.goto('/gigs');

    await expect(page.getByText('1 plan à venir, et 2 à traiter.')).toBeVisible();
    const toHandle = page.getByRole('region', { name: 'À traiter' });
    await expect(toHandle.getByRole('link')).toHaveCount(2);
    await expect(toHandle.getByRole('link', { name: /Pique-nique/ })).toContainText('À clore');
    await expect(toHandle.getByRole('link', { name: /Pique-nique/ })).toContainText('date passée');
    await expect(toHandle.getByRole('link', { name: /Ninkasi/ })).toContainText('Brouillon');
    await expect(toHandle.getByRole('link', { name: /Ninkasi/ })).toContainText(
      'Vu par les brasseurs seulement',
    );
    await expect(page.getByRole('button', { name: 'Ajouter' })).toBeVisible();
  });

  test('with nothing to come, a member is told so, and who manages gigs is offered to add one', async ({
    page,
    context,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/gigs');
    await expect(page.getByRole('heading', { name: 'Pas de plan à l’horizon' })).toBeVisible();
    await expect(page.getByText('Profites-en pour bosser tes morceaux.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter un plan' })).toHaveCount(0);

    await context.clearCookies();
    await asMember(page, 'Gigi');
    await page.goto('/gigs');
    await expect(page.getByText('Quelqu’un a appelé ?')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un plan' }).click();
    await expect(page).toHaveURL('/gigs/new');
  });

  test('when the list does not load, the screen says so and offers to retry', async ({ page }) => {
    addGig('Carnaval', { startsOn: day(12) });
    await asMember(page, 'Zaza');
    await page.route('**/api/gigs', (route) => route.abort());
    await page.goto('/gigs');
    await expect(page.getByText('Impossible de charger les plans.')).toBeVisible({
      timeout: 15_000,
    });

    await page.unroute('**/api/gigs');
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('link', { name: /Carnaval/ })).toBeVisible();
  });
});

test.describe('a gig', () => {
  test('a member answers at once, and the answer that makes an accepted gig playable confirms it', async ({
    page,
  }) => {
    const { gigId, slotId } = addGig('Anniversaire de Margaux', {
      status: 'ACCEPTED',
      startsOn: day(10),
      meetingTime: '17:30',
      placeName: 'Salle des fêtes',
      city: 'Lyon',
      notes: 'Repas offert après le jouage.',
    });
    organise(gigId, 'Lulu');
    answerOf('Lulu', slotId, 'YES');
    answerOf('Jibé', slotId, 'MAYBE');
    answerOf('Zaza', slotId, 'NO');
    await asMember(page, 'Riton');
    await page.goto(`/gigs/${gigId}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Anniversaire de Margaux' }),
    ).toBeVisible();
    await expect(page.getByText('· RDV 17 h 30')).toBeVisible();
    await expect(page.getByText('Salle des fêtes, Lyon')).toBeVisible();
    await expect(page.getByText('Pas encore jouable', { exact: true })).toBeVisible();
    // Who comes: the count, the sections in the order of the band, his own marked.
    await expect(page.getByText('1 oui sur 5')).toBeVisible();
    await expect(page.getByText('Souba · ton pupitre')).toBeVisible();
    await expect(page.getByText('Personne pour l’instant')).toHaveCount(1);
    await expect(page.getByText('Jibé peut-être')).toBeVisible();
    await expect(page.getByText('1 peut-être')).toBeVisible();
    await expect(page.getByText('Repas offert après le jouage.')).toBeVisible();
    // A member edits nothing.
    await expect(page.getByRole('button', { name: 'Gérer le plan' })).toHaveCount(0);

    // The saxophones still miss: his yes does not make the gig playable yet.
    const choices = page.getByRole('radiogroup', { name: 'Ta réponse' });
    await choices.getByRole('radio', { name: 'Oui', exact: true }).click();
    await expect(choices.getByRole('radio', { name: 'Oui' })).toBeChecked();
    await expect(page.getByText('2 oui sur 5')).toBeVisible();
    expect(statusOf(gigId)).toBe('ACCEPTED');

    // Jibé's yes is the last one missing: the app confirms the gig and says so.
    answerOf('Jibé', slotId, 'YES');
    await choices.getByRole('radio', { name: 'Si besoin', exact: true }).click();
    await choices.getByRole('radio', { name: 'Oui', exact: true }).click();
    await expect(page.getByText('il passe en « Validé »')).toBeVisible();
    await expect(page.getByText('Validé', { exact: true })).toBeVisible();
    expect(statusOf(gigId)).toBe('CONFIRMED');
  });

  test('a gig of several days: an answer per slot, and yes everywhere at once', async ({
    page,
  }) => {
    const { gigId, slotIds } = addGig('Fête des Lumières', {
      startsOn: day(40),
      endsOn: day(42),
      meetingTime: '18:00',
      slots: ['Vendredi soir', 'Samedi midi', 'Dimanche'],
    });
    sql(`UPDATE gigSlot SET note = 'Défilé sur la presqu’île.' WHERE id = ${slotIds[0]}`);
    answerOf('Zaza', slotIds[0] as number, 'NO');
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    await expect(page.getByText(/^Du .* au .* · RDV 18\sh le /)).toBeVisible();
    await expect(page.getByText('1 sur 3')).toBeVisible();
    await expect(page.getByText('Il te reste 2 présences.')).toBeVisible();
    await expect(page.getByText('Défilé sur la presqu’île.')).toBeVisible();
    await expect(
      page
        .getByRole('radiogroup', { name: 'Ta réponse pour Vendredi soir' })
        .getByRole('radio', { name: 'Non' }),
    ).toBeChecked();

    await page.getByRole('button', { name: 'Oui partout' }).click();
    await expect(page.getByText('3 sur 3')).toBeVisible();
    // Yes where she had not answered; her no stays.
    expect(
      sql(
        `SELECT answer FROM gigSlotAttendance WHERE memberId = ${memberId('Zaza')} ORDER BY gigSlotId`,
      ),
    ).toBe('NO\nYES\nYES');

    // Who comes to one slot, from its count.
    await page.getByRole('button', { name: '1 oui' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Qui vient · Samedi midi' });
    await expect(panel.getByText('Trompette · ton pupitre')).toBeVisible();
  });

  test('a confirmed gig shows the meeting first, and the answer given with a way to change it', async ({
    page,
  }) => {
    const { gigId, slotId } = addGig('Vide-grenier', {
      status: 'CONFIRMED',
      startsOn: day(3),
      meetingTime: '09:30',
      placeName: 'Boulevard de la Croix-Rousse',
      city: 'Lyon',
    });
    for (const nickname of ['Zaza', 'Jibé', 'Riton']) answerOf(nickname, slotId, 'YES');
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible();
    await expect(page.getByText('9 h 30')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Y aller' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier l’adresse' })).toBeVisible();
    await expect(page.getByText('On est jouables !')).toBeVisible();
    await expect(page.getByText('Tu viens. On compte sur toi !')).toBeVisible();

    await page.getByRole('button', { name: 'Changer' }).click();
    await page
      .getByRole('radiogroup', { name: 'Ta réponse' })
      .getByRole('radio', { name: 'Non', exact: true })
      .click();
    await expect(page.getByText('Tu ne viens pas.')).toBeVisible();
    expect(sql(`SELECT answer FROM gigSlotAttendance WHERE memberId = ${memberId('Zaza')}`)).toBe(
      'NO',
    );
  });

  test('a cancelled gig, a past gig and a draft say what they are; a draft does not exist for a member', async ({
    page,
  }) => {
    const cancelled = addGig('Fête de la soupe', { status: 'CANCELLED', startsOn: day(15) });
    const past = addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(-30) });
    answerOf('Zaza', past.slotId, 'IF_NEEDED');
    answerOf('Lulu', past.slotId, 'YES');
    const draft = addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(20) });
    await asMember(page, 'Zaza');

    await page.goto(`/gigs/${cancelled.gigId}`);
    await expect(page.getByText('Ce plan est annulé : pas besoin de répondre.')).toBeVisible();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);

    await page.goto(`/gigs/${past.gigId}`);
    await expect(page.getByText('Ce plan est passé : les réponses ne bougent plus.')).toBeVisible();
    await expect(page.getByText('Passé', { exact: true })).toBeVisible();
    await expect(page.getByText('1 fanfaron. Ta réponse : si besoin.')).toBeVisible();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);

    await page.goto(`/gigs/${draft.gigId}`);
    await expect(page.getByText('Ce plan n’existe pas, ou plus.')).toBeVisible();
  });
});

test.describe('who may edit a gig', () => {
  test('who manages gigs creates a draft from the form, corrects it, and proposes it', async ({
    page,
  }) => {
    addCostume('Jungle');
    await asMember(page, 'Gigi');
    await page.goto('/gigs');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nouveau plan' })).toBeVisible();
    // A form opened from a tab hides the tab bar.
    await expect(page.getByRole('navigation', { name: 'Navigation' })).toHaveCount(0);

    // Nothing typed: the form says how many fields, and which.
    await page.getByRole('button', { name: 'Créer le plan' }).click();
    await expect(page.getByText('2 champs à corriger avant de créer le plan.')).toBeVisible();
    await expect(page.getByText('Il manque le nom du plan.')).toBeVisible();
    await expect(page.getByText('Il manque la date de début.')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM gig')).toBe('0');

    await page.getByLabel('Nom du plan').fill('Fête des Lumières');
    await page.getByLabel('Date de début').fill(day(40));
    await page.getByLabel('Date de fin').fill(day(39));
    await page.getByLabel('Coordonnées GPS').fill('45,7673 4,8344');
    await page.getByRole('button', { name: 'Créer le plan' }).click();
    await expect(page.getByText('La fin ne peut pas être avant le début.')).toBeVisible();
    await expect(page.getByText('Écris la latitude puis la longitude')).toBeVisible();

    await page.getByLabel('Date de fin').fill(day(41));
    await page.getByLabel('Heure de rendez-vous').fill('18:00');
    await page.getByLabel('Lieu', { exact: true }).fill('Place des Terreaux');
    await page.getByLabel('Coordonnées GPS').fill('45.7673, 4.8344');
    await page.getByRole('button', { name: 'Jungle' }).click();
    await page.getByLabel('Infos diverses').fill('Badge exposant à récupérer.');

    // Two slots: the first is named, then a second is added with its costume.
    await page
      .getByRole('button', { name: 'Modifier la présence Une seule présence, sans nom' })
      .click();
    let panel = page.getByRole('dialog');
    await panel.getByLabel('Nom').fill('Vendredi soir');
    await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();
    await page.getByRole('button', { name: 'Ajouter une présence' }).click();
    panel = page.getByRole('dialog', { name: 'Nouvelle présence' });
    await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();
    await expect(panel.getByText('Il manque le nom de la présence.')).toBeVisible();
    await panel.getByLabel('Nom').fill('Samedi midi');
    await panel.getByLabel('Note').fill('Aubade devant l’Hôtel de Ville');
    await panel.getByText('Jungle').click();
    await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();

    // An organiser, found by the search.
    await page.getByRole('button', { name: 'Ajouter un brasseur' }).click();
    panel = page.getByRole('dialog', { name: 'Brasseurs' });
    await panel.getByLabel('Chercher un fanfaron').fill('souba');
    await panel.getByText('Riton').click();
    await panel.getByRole('button', { name: 'Valider le brasseur' }).click();

    await page.getByRole('button', { name: 'Créer le plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fête des Lumières' })).toBeVisible();
    await expect(page.getByText('Brouillon : seuls les brasseurs')).toBeVisible();
    expect(
      sql('SELECT name, status, meetingTime, placeName, latitude, longitude, notes FROM gig'),
    ).toBe(
      'Fête des Lumières\tDRAFT\t18:00:00\tPlace des Terreaux\t45.767300\t4.834400\tBadge exposant à récupérer.',
    );
    expect(sql('SELECT name, note, costumeId IS NOT NULL FROM gigSlot ORDER BY position')).toBe(
      'Vendredi soir\tNULL\t0\nSamedi midi\tAubade devant l’Hôtel de Ville\t1',
    );
    expect(sql('SELECT memberId FROM gigOrganizer')).toBe(String(memberId('Riton')));

    await page.getByRole('button', { name: 'Proposer à la fanfare' }).click();
    await expect(page.locator('.GigHeader').getByText('Proposition')).toBeVisible();
    expect(sql('SELECT status FROM gig')).toBe('PROPOSED');
  });

  test('changing the status follows the life cycle, and forcing “Validé” asks first', async ({
    page,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', { startsOn: day(12) });
    answerOf('Lulu', slotId, 'YES');
    await asMember(page, 'Gigi');
    await page.goto(`/gigs/${gigId}`);

    // The more button opens a menu: the form, the status, and deleting, which
    // is for a draft nobody answered.
    await page.getByRole('button', { name: 'Gérer le plan' }).click();
    const menu = page.getByRole('dialog', { name: 'Carnaval' });
    await expect(menu.getByRole('link', { name: 'Modifier le plan' })).toHaveAttribute(
      'href',
      `/gigs/${gigId}/edit`,
    );
    const remove = menu.getByRole('button', { name: /Supprimer le plan/ });
    await expect(remove).toContainText('Seulement un brouillon sans réponse');
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await menu.getByRole('button', { name: 'Changer le statut' }).click();

    let panel = page.getByRole('dialog', { name: 'Statut du plan' });
    // The five statuses stay listed. From "Proposition" there is no way back
    // to a draft: the row says so and cannot be chosen.
    await expect(panel.getByRole('radio')).toHaveCount(5);
    await expect(panel.getByRole('radio', { name: /^Brouillon/ })).toBeDisabled();
    await expect(panel.getByText('Pas depuis « Proposition »')).toBeVisible();
    await expect(panel.getByRole('radio', { name: /^Proposition/ })).toBeChecked();
    await panel.getByText('Validé', { exact: true }).click();
    await panel.getByRole('button', { name: 'Enregistrer le statut' }).click();

    // Sections are named as they are, members by their nickname.
    panel = page.getByRole('dialog', { name: 'Valider sans Saxophone et Souba ?' });
    await expect(
      panel.getByText(
        'Pupitre sans oui : Saxophone, Souba. Jibé n’a pas répondu, Riton n’a pas répondu.',
      ),
    ).toBeVisible();
    expect(statusOf(gigId)).toBe('PROPOSED');
    await panel.getByRole('button', { name: 'Valider quand même' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('il n’est plus jouable')).toBeVisible();
    expect(statusOf(gigId)).toBe('CONFIRMED');
  });

  test('a draft is deleted after a confirmation; one that has answers is not', async ({ page }) => {
    const draft = addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(20) });
    const answered = addGig('Carnaval', { status: 'DRAFT', startsOn: day(25) });
    answerOf('Zaza', answered.slotId, 'YES');
    await asMember(page, 'Gigi');

    await page.goto(`/gigs/${answered.gigId}`);
    await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
    const panel = page.getByRole('dialog', { name: 'Supprimer ce brouillon ?' });
    await panel.getByRole('button', { name: 'Supprimer le brouillon' }).click();
    await expect(panel.getByText('Des fanfarons ont déjà répondu pour ce plan')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM gig')).toBe('2');

    await page.goto(`/gigs/${draft.gigId}`);
    await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
    await page
      .getByRole('dialog', { name: 'Supprimer ce brouillon ?' })
      .getByRole('button', { name: 'Supprimer le brouillon' })
      .click();
    await expect(page).toHaveURL('/gigs');
    expect(sql('SELECT name FROM gig')).toBe('Carnaval');
  });

  test('an organiser notes the answer of a member; a plain member only reads the answers', async ({
    page,
    context,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', { startsOn: day(12) });
    organise(gigId, 'Lulu');
    answerOf('Riton', slotId, 'NO');
    await asMember(page, 'Lulu');
    await page.goto(`/gigs/${gigId}`);
    await page.getByRole('button', { name: 'Voir toutes les réponses' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Qui vient' })).toBeVisible();
    await expect(page.getByText('Tu brasses ce plan')).toBeVisible();
    await expect(page.getByText('Lulu (toi)')).toBeVisible();
    // The name of the row says the answer too: it replaces what the row shows.
    await page.getByRole('button', { name: 'Noter la réponse de Riton, Non' }).click();
    const panel = page.getByRole('dialog', { name: 'Réponse de Riton' });
    await expect(panel.getByText('Sa réponse actuelle : non.')).toBeVisible();
    await panel.getByRole('radio', { name: 'Oui', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      sql(
        `SELECT answer, updatedByMemberId FROM gigSlotAttendance WHERE memberId = ${memberId('Riton')}`,
      ),
    ).toBe(`YES\t${memberId('Lulu')}`);

    await context.clearCookies();
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}/answers`);
    await expect(page.getByText('Riton')).toBeVisible();
    await expect(page.getByRole('button', { name: /Noter la réponse/ })).toHaveCount(0);
    await expect(page.getByText('Tu brasses ce plan')).toHaveCount(0);
  });

  test('a member without the right gets neither the form nor a refusal that looks like a bug', async ({
    page,
  }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(12) });
    await asMember(page, 'Zaza');

    for (const address of ['/gigs/new', `/gigs/${gigId}/edit`]) {
      await page.goto(address);
      await expect(page.getByText('c’est pour ceux qui gèrent les plans')).toBeVisible();
      await expect(page.getByLabel('Nom du plan')).toHaveCount(0);
    }
  });

  test('editing a gig keeps what the form does not show, and deleting a slot asks first', async ({
    page,
  }) => {
    const { gigId, slotIds } = addGig('Fête des Lumières', {
      startsOn: day(40),
      slots: ['Vendredi soir', 'Samedi midi'],
    });
    sql(`UPDATE gig SET discordChannelId = '1203984756120394875' WHERE id = ${gigId}`);
    answerOf('Zaza', slotIds[1] as number, 'YES');
    await asMember(page, 'Gigi');
    await page.goto(`/gigs/${gigId}/edit`);

    await expect(page.getByRole('heading', { level: 1, name: 'Modifier le plan' })).toBeVisible();
    await page.getByLabel('Nom du plan').fill('Fête des Lumières 2026');
    await page.getByRole('button', { name: 'Modifier la présence Samedi midi' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la présence' }).click();
    const panel = page.getByRole('dialog', { name: 'Supprimer « Samedi midi » ?' });
    await expect(
      panel.getByText('Les réponses données pour cette présence sont effacées.'),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Supprimer la présence' }).click();
    // Nothing is deleted before the form is saved.
    expect(sql('SELECT COUNT(*) FROM gigSlot')).toBe('2');

    await page.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fête des Lumières 2026' }),
    ).toBeVisible();
    expect(sql('SELECT name, discordChannelId FROM gig')).toBe(
      'Fête des Lumières 2026\t1203984756120394875',
    );
    expect(sql('SELECT name FROM gigSlot')).toBe('Vendredi soir');
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');
  });
});

test.describe('the band settings', () => {
  test('the admin adds a costume with its picture, renames it, and cannot delete one a gig has', async ({
    page,
  }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(12) });
    await signIn(page);
    await page.goto('/band');
    await page.getByRole('link', { name: /Déguiz/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Déguiz' })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter un déguiz' }).click();
    let panel = page.getByRole('dialog', { name: 'Nouveau déguiz' });
    await panel.getByRole('button', { name: 'Enregistrer le déguiz' }).click();
    await expect(panel.getByText('Il manque le nom du déguiz.')).toBeVisible();
    await panel.getByLabel('Nom').fill('Paillettes');
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'paillettes.png',
      mimeType: 'image/png',
      buffer: png(1600, 900),
    });
    await panel.getByRole('button', { name: 'Enregistrer le déguiz' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Aucun plan pour l’instant')).toBeVisible();
    // Made smaller by the browser before it is sent: one file, of the costume.
    expect(storedFiles('costumes')).toHaveLength(1);
    expect(sql('SELECT name, imagePath IS NOT NULL FROM costume')).toBe('Paillettes\t1');

    const costumeId = Number(sql('SELECT id FROM costume'));
    sql(`INSERT INTO gigCostume (gigId, costumeId) VALUES (${gigId}, ${costumeId})`);
    await page.reload();
    await expect(page.getByText('1 plan', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Modifier Paillettes' }).click();
    panel = page.getByRole('dialog', { name: 'Paillettes' });
    await expect(panel.getByRole('button', { name: 'Supprimer le déguiz' })).toBeDisabled();
    await expect(panel.getByText('il ne peut pas être supprimé')).toBeVisible();
    await panel.getByLabel('Nom').fill('Paillettes dorées');
    await panel.getByRole('button', { name: 'Enregistrer le déguiz' }).click();
    await expect(page.getByText('Paillettes dorées')).toBeVisible();

    // The gig shows the picture of its costume.
    await page.goto(`/gigs/${gigId}`);
    await expect(page.locator('.GigHeader img')).toHaveAttribute(
      'src',
      /\/api\/costumes\/\d+\/picture/,
    );
  });

  test('the admin sets the reminders; a wrong number is said under its field', async ({ page }) => {
    await signIn(page);
    await page.goto('/band');
    await expect(page.getByRole('link', { name: /Rappels des plans/ })).toContainText(
      '15 et 5 jours avant, à partir de 18 h',
    );
    await page.getByRole('link', { name: /Rappels des plans/ }).click();

    const [first, second] = [
      page.getByLabel('Jours avant le plan').nth(0),
      page.getByLabel('Jours avant le plan').nth(1),
    ];
    await expect(first).toHaveValue('15');
    await first.fill('3');
    await page.getByRole('button', { name: 'Enregistrer les rappels' }).click();
    await expect(page.getByText('Le second rappel vient après le premier')).toBeVisible();
    await first.fill('120');
    await page.getByRole('button', { name: 'Enregistrer les rappels' }).click();
    await expect(page.getByText('Un nombre de 1 à 90.')).toBeVisible();
    expect(sql('SELECT gigFirstReminderDays FROM band')).toBe('15');

    await first.fill('10');
    await second.fill('');
    await page.getByLabel('À partir de').selectOption('9');
    await page.getByRole('button', { name: 'Enregistrer les rappels' }).click();
    await expect(page.getByText('Les rappels sont enregistrés.')).toBeVisible();
    expect(
      sql('SELECT gigFirstReminderDays, gigSecondReminderDays, gigReminderHour FROM band'),
    ).toBe('10\tNULL\t9');
  });

  test('costumes and reminders are for admins: anyone else is told so', async ({ page }) => {
    await asMember(page, 'Gigi');
    for (const address of ['/band/costumes', '/band/reminders']) {
      await page.goto(address);
      await expect(
        page.getByText('Cette page est réservée aux admins de la fanfare.'),
      ).toBeVisible();
    }
  });
});

test.describe('accessibility', () => {
  test('with the text at 200 %, the list and a gig wrap instead of overflowing', async ({
    page,
  }) => {
    const { gigId, slotId } = addGig('Marché de Noël de Saint-Genis-Laval', {
      status: 'ACCEPTED',
      startsOn: day(12),
      meetingTime: '17:30',
      placeName: 'Place Joffre, Saint-Genis-Laval',
    });
    answerOf('Lulu', slotId, 'YES');
    sql(
      `UPDATE member SET textSizePercent = 200, hasLegibleFont = 1 WHERE id = ${memberId('Zaza')}`,
    );
    await asMember(page, 'Zaza');

    for (const address of ['/gigs', `/gigs/${gigId}`, `/gigs/${gigId}/answers`]) {
      await page.goto(address);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, address).toBeLessThanOrEqual(0);
    }
  });

  test('the four answers are radio buttons: the arrows move, and only Space chooses', async ({
    page,
  }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(12) });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    const choices = page.getByRole('radiogroup', { name: 'Ta réponse' });
    await expect(choices.getByRole('radio')).toHaveCount(4);
    await choices.getByRole('radio', { name: 'Oui' }).focus();
    await page.keyboard.press('Space');
    await expect(choices.getByRole('radio', { name: 'Oui' })).toBeChecked();
    await expect(page.getByRole('status').filter({ hasText: 'C’est noté.' })).toHaveCount(1);

    // An answer is saved as soon as it is chosen: passing over "Non" on the
    // way to "Peut-être" must not save it.
    await page.keyboard.press('ArrowRight');
    await expect(choices.getByRole('radio', { name: 'Non' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(choices.getByRole('radio', { name: 'Peut-être' })).toBeFocused();
    await expect(choices.getByRole('radio', { name: 'Oui' })).toBeChecked();
    expect(sql('SELECT answer FROM gigSlotAttendance')).toBe('YES');
    await page.keyboard.press('Space');
    await expect.poll(() => sql('SELECT answer FROM gigSlotAttendance')).toBe('MAYBE');
  });

  test('at 200 %, a label of the infos of a gig grows instead of running into its value', async ({
    page,
  }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(12), notes: 'Badge à récupérer.' });
    sql(
      `UPDATE member SET textSizePercent = 200, hasLegibleFont = 1 WHERE id = ${memberId('Zaza')}`,
    );
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    const label = page.locator('.GigInfos dt', { hasText: 'Infos diverses' });
    await expect(label).toBeVisible();
    expect(await label.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test('beside the list, the headings go down one level under the name of the gig', async ({
    page,
  }) => {
    const { gigId } = addGig('Carnaval', { startsOn: day(12) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Carnaval' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Ta réponse' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Qui vient' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Infos' })).toBeVisible();
  });
});

test.describe('what must not go wrong', () => {
  test('a slot that could not be saved does not create the gig twice when saving again', async ({
    page,
  }) => {
    await asMember(page, 'Gigi');
    await page.goto('/gigs/new');
    await page.getByLabel('Nom du plan').fill('Fête des Lumières');
    await page.getByLabel('Date de début').fill(day(40));
    await page
      .getByRole('button', { name: 'Modifier la présence Une seule présence, sans nom' })
      .click();
    let panel = page.getByRole('dialog');
    await panel.getByLabel('Nom').fill('Vendredi soir');
    await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();
    for (const name of ['Samedi midi', 'Samedi soir']) {
      await page.getByRole('button', { name: 'Ajouter une présence' }).click();
      panel = page.getByRole('dialog', { name: 'Nouvelle présence' });
      await panel.getByLabel('Nom').fill(name);
      await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();
    }

    // The network drops on the last slot, once.
    let dropped = false;
    await page.route('**/api/gigs/*/slots', async (route) => {
      const isLast = route.request().postDataJSON()?.name === 'Samedi soir';
      if (isLast && !dropped) {
        dropped = true;
        return route.abort();
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Créer le plan' }).click();
    await expect(page.getByText('une présence n’a pas pu l’être')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM gigSlot')).toBe('2');

    await page.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fête des Lumières' })).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM gig')).toBe('1');
    expect(sql('SELECT name FROM gigSlot ORDER BY position')).toBe(
      'Vendredi soir\nSamedi midi\nSamedi soir',
    );
  });

  test('an organiser who takes themself off a gig saves it, slots included, without an error', async ({
    page,
  }) => {
    const { gigId } = addGig('Fête des Lumières', {
      startsOn: day(40),
      slots: ['Vendredi soir', 'Samedi midi'],
    });
    organise(gigId, 'Lulu');
    organise(gigId, 'Riton');
    await asMember(page, 'Lulu');
    await page.goto(`/gigs/${gigId}/edit`);

    await page.getByRole('button', { name: 'Modifier la présence Samedi midi' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Note').fill('Aubade devant l’Hôtel de Ville');
    await panel.getByRole('button', { name: 'Enregistrer la présence' }).click();
    await page.getByRole('button', { name: 'Retirer Lulu des brasseurs' }).click();
    await page.getByRole('button', { name: 'Enregistrer le plan' }).click();

    await expect(page).toHaveURL(`/gigs/${gigId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Fête des Lumières' })).toBeVisible();
    // No longer an organiser: nothing to manage.
    await expect(page.getByRole('button', { name: 'Gérer le plan' })).toHaveCount(0);
    expect(sql('SELECT memberId FROM gigOrganizer')).toBe(String(memberId('Riton')));
    expect(sql("SELECT note FROM gigSlot WHERE name = 'Samedi midi'")).toBe(
      'Aubade devant l’Hôtel de Ville',
    );
  });

  test('a gig to close is one for who may edit it; a member reads that it was not played', async ({
    page,
    context,
  }) => {
    const { gigId } = addGig('Vide-grenier', { status: 'PROPOSED', startsOn: day(-3) });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByText('il n’a pas été joué.')).toBeVisible();
    await expect(page.getByText('À clore')).toHaveCount(0);
    await expect(page.getByText('Annule-le')).toHaveCount(0);
    await expect(page.locator('.GigHeader').getByText('Proposition')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Annuler le plan' })).toHaveCount(0);

    await context.clearCookies();
    await asMember(page, 'Gigi');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.locator('.GigHeader').getByText('À clore')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler le plan' }).click();
    await expect.poll(() => statusOf(gigId)).toBe('CANCELLED');
  });

  test('the answers of every slot of a past gig can be read, one slot at a time', async ({
    page,
  }) => {
    const { gigId, slotIds } = addGig('Fête des Lumières', {
      status: 'CONFIRMED',
      startsOn: day(-10),
      endsOn: day(-9),
      slots: ['Vendredi soir', 'Samedi midi'],
    });
    answerOf('Lulu', slotIds[0] as number, 'YES');
    answerOf('Lulu', slotIds[1] as number, 'NO');
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    await page.getByRole('button', { name: 'Voir toutes les réponses' }).click();

    const lulu = page.locator('.gigs-member', { hasText: 'Lulu' });
    await expect(page.getByRole('button', { name: 'Vendredi soir' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(lulu.getByText('Oui', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Samedi midi' }).click();
    await expect(lulu.getByText('Non', { exact: true })).toBeVisible();
    // Nobody answered: said as such, never as a no.
    await expect(
      page.locator('.gigs-member', { hasText: 'Riton' }).getByText('Pas répondu'),
    ).toBeVisible();
    // The answers of a gig that is over no longer change.
    await expect(page.getByRole('button', { name: /Noter la réponse/ })).toHaveCount(0);
  });

  test('a past gig nobody said yes to does not count one member', async ({ page }) => {
    const { gigId } = addGig('Mariage de Clémence', { status: 'CONFIRMED', startsOn: day(-30) });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByText('Personne n’avait dit oui.')).toBeVisible();
  });

  test('on a desktop, the gig opened beside the list stays open when an action moves it', async ({
    page,
  }) => {
    const draft = addGig('Soirée au Ninkasi', { status: 'DRAFT', startsOn: day(20) });
    addGig('Carnaval', { status: 'DRAFT', startsOn: day(25) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await asMember(page, 'Gigi');
    await page.goto('/gigs');

    // The first gig to handle opens, and the address says which.
    await expect(page).toHaveURL(`/gigs/${draft.gigId}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Soirée au Ninkasi' })).toBeVisible();
    await page.getByRole('button', { name: 'Proposer à la fanfare' }).click();
    await expect.poll(() => statusOf(draft.gigId)).toBe('PROPOSED');
    await expect(page.getByRole('heading', { level: 2, name: 'Soirée au Ninkasi' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Soirée au Ninkasi/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('a costume whose picture is refused is not added twice when saving again', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/band/costumes');
    await page.getByRole('button', { name: 'Ajouter un déguiz' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Nom').fill('Paillettes');
    await panel.locator('input[type="file"]').setInputFiles({
      name: 'paillettes.png',
      mimeType: 'image/png',
      buffer: png(1600, 900),
    });
    let dropped = false;
    await page.route('**/api/costumes/*/picture', async (route) => {
      if (route.request().method() === 'PUT' && !dropped) {
        dropped = true;
        return route.abort();
      }
      return route.continue();
    });
    await panel.getByRole('button', { name: 'Enregistrer le déguiz' }).click();
    await expect.poll(() => dropped).toBe(true);
    await expect.poll(() => sql('SELECT imagePath IS NOT NULL FROM costume')).toBe('0');

    await panel.getByRole('button', { name: 'Enregistrer le déguiz' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(sql('SELECT name, imagePath IS NOT NULL FROM costume')).toBe('Paillettes\t1');
  });

  test('a costume is moved up and down from its panel, and the list follows', async ({ page }) => {
    addCostume('Jungle');
    addCostume('Paillettes');
    addCostume('Marins');
    await signIn(page);
    await page.goto('/band/costumes');
    await page.getByRole('button', { name: 'Modifier Marins' }).click();
    const panel = page.getByRole('dialog', { name: 'Marins' });
    await expect(panel.getByRole('button', { name: 'Descendre' })).toBeDisabled();
    await panel.getByRole('button', { name: 'Monter' }).click();
    await expect(panel.getByText('2e sur 3')).toBeVisible();
    await panel.getByRole('button', { name: 'Monter' }).click();
    await expect(panel.getByRole('button', { name: 'Monter' })).toBeDisabled();
    expect(sql('SELECT name FROM costume ORDER BY position')).toBe('Marins\nJungle\nPaillettes');
  });

  test('on a tablet the list is a grid of two, and a gig takes the whole screen without the tab bar', async ({
    page,
  }) => {
    const first = addGig('Carnaval', { startsOn: day(12) });
    addGig('Fête de la soupe', { startsOn: day(14) });
    await page.setViewportSize({ width: 768, height: 1024 });
    await asMember(page, 'Zaza');
    await page.goto('/gigs');

    // Two cards side by side, and the tab bar under them.
    const cards = page.locator('.gigs-cardLink');
    await expect(cards).toHaveCount(2);
    const [left, right] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(left?.y).toBe(right?.y);
    expect(right?.x).toBeGreaterThan((left?.x ?? 0) + (left?.width ?? 0));
    await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();

    await cards.nth(0).click();
    await expect(page).toHaveURL(`/gigs/${first.gigId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Carnaval' })).toBeVisible();
    // The gig alone: the compact header, a way back, no list and no tab bar.
    await expect(page.locator('.GigHeader')).toHaveAttribute('data-size', 'compact');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Plans' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour aux plans' }).click();
    await expect(page).toHaveURL('/gigs');
  });

  test('on a desktop the list sits beside the gig, and a card opens its gig in place', async ({
    page,
  }) => {
    const first = addGig('Carnaval', { startsOn: day(12) });
    const second = addGig('Fête de la soupe', { startsOn: day(14) });
    await page.setViewportSize({ width: 1280, height: 900 });
    await asMember(page, 'Zaza');
    await page.goto('/gigs');

    // The first gig of the list opens beside it; the menu is on the left.
    await expect(page).toHaveURL(`/gigs/${first.gigId}`);
    await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
    const list = await page.locator('.gigs-list').boundingBox();
    const pane = await page.locator('.gigs-view').boundingBox();
    expect(list?.width).toBe(390);
    expect(pane?.x).toBeGreaterThanOrEqual((list?.x ?? 0) + 390);
    // No way back in the pane: the list is there.
    await expect(page.getByRole('button', { name: 'Retour aux plans' })).toHaveCount(0);

    await page.getByRole('link', { name: /Fête de la soupe/ }).click();
    await expect(page).toHaveURL(`/gigs/${second.gigId}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Fête de la soupe' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Fête de la soupe/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('link', { name: /Carnaval/ })).not.toHaveAttribute('aria-current');
    // Answering there updates the card of the list.
    await page.getByRole('radio', { name: 'Oui' }).click();
    await expect(
      page.getByRole('link', { name: /Fête de la soupe/ }).getByText('Oui'),
    ).toBeVisible();
  });

  test('“Y aller” opens the maps of the device on the coordinates, or on the address without them', async ({
    page,
  }) => {
    const { gigId } = addGig('Vide-grenier', {
      status: 'CONFIRMED',
      startsOn: day(5),
      meetingTime: '09:30',
      placeName: 'Métro Croix-Rousse',
      city: 'Lyon',
    });
    sql(`UPDATE gig SET placeUrl = 'https://example.org/lieu' WHERE id = ${gigId}`);
    // What the page asks the device to open is kept instead of opened.
    await page.addInitScript(() => {
      const opened: string[] = [];
      Object.assign(window, { opened, open: (address: string) => opened.push(address) });
    });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    const opened = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);

    await page.getByRole('button', { name: 'Y aller' }).click();
    const byAddress = (await opened())[0] ?? '';
    expect(byAddress).toMatch(/^(geo:0,0\?q=|https:\/\/maps\.apple\.com\/\?daddr=)/);
    expect(decodeURIComponent(byAddress)).toContain('Métro Croix-Rousse, Lyon');

    sql(`UPDATE gig SET latitude = 45.7743, longitude = 4.8320 WHERE id = ${gigId}`);
    await page.reload();
    await page.getByRole('button', { name: 'Y aller' }).click();
    expect(decodeURIComponent((await opened())[0] ?? '')).toContain('45.7743,4.832');

    await page.getByRole('button', { name: 'Voir le lieu' }).click();
    expect((await opened())[1]).toBe('https://example.org/lieu');
  });

  test('“Copier l’adresse” copies the address and says so, in sight and to screen readers', async ({
    page,
  }) => {
    const { gigId } = addGig('Vide-grenier', {
      status: 'CONFIRMED',
      startsOn: day(5),
      placeName: 'Métro Croix-Rousse',
      city: 'Lyon',
    });
    sql(
      `UPDATE gig SET streetAddress = 'Boulevard de la Croix-Rousse', postalCode = '69004' WHERE id = ${gigId}`,
    );
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.assign(window, { copied });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.push(text) },
      });
    });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);

    await page.getByRole('button', { name: 'Copier l’adresse' }).click();
    await expect(page.getByRole('button', { name: 'Adresse copiée.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Adresse copiée.' })).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
      'Boulevard de la Croix-Rousse, 69004 Lyon',
    ]);
  });

  test('a confirmed gig is “En cours” from 20 minutes after the meeting time, until its last day ends', async ({
    page,
  }) => {
    const { gigId } = addGig('Vide-grenier', {
      status: 'CONFIRMED',
      startsOn: day(0),
      meetingTime: '11:30',
      placeName: 'Métro Croix-Rousse',
    });
    const at = (time: string) => new Date(`${day(0)}T${time}:00`);
    await page.clock.install({ time: at('11:45') });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    const header = page.locator('.GigHeader');
    await expect(header.getByText('Validé')).toBeVisible();
    await expect(header.getByText('En cours')).toHaveCount(0);

    await page.clock.setFixedTime(at('11:50'));
    await page.reload();
    await expect(header.getByText('En cours')).toBeVisible();
    // The place stays in sight, and the answers stay open.
    await expect(header.getByText('Métro Croix-Rousse')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Ta réponse' })).toBeVisible();
    await page.goto('/gigs');
    await expect(page.getByRole('link', { name: /Vide-grenier/ })).toBeVisible();

    // Without a meeting time: from the start of the day.
    sql(`UPDATE gig SET meetingTime = NULL WHERE id = ${gigId}`);
    await page.clock.setFixedTime(at('00:05'));
    await page.goto(`/gigs/${gigId}`);
    await expect(header.getByText('En cours')).toBeVisible();
  });

  test('one reminder alone is written in the singular when it is one day before', async ({
    page,
  }) => {
    sql('UPDATE band SET gigFirstReminderDays = 1, gigSecondReminderDays = NULL');
    await signIn(page);
    await page.goto('/band');
    await expect(page.getByRole('link', { name: /Rappels des plans/ })).toContainText(
      '1 jour avant',
    );
  });
});
