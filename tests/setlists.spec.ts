import { expect, type Page, test } from '@playwright/test';
import { textSizeOfDevice } from './support/accessibility.ts';
import { emptyDatabase, sql } from './support/database.ts';
import { fakePush } from './support/fakePush.ts';
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
  // Signing in leads to the home screen; these tests start from the directory.
  await expect(page).toHaveURL('/');
  await page.goto('/members');
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
    // Over two lines: the field grows with its text.
    const description = page.getByLabel('Description');
    const before = (await description.boundingBox())?.height ?? 0;
    await description.fill('Place des Terreaux, 21 h\nPuis le défilé\njusqu’à la mairie');
    expect((await description.boundingBox())?.height ?? 0).toBeGreaterThan(before);

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

    // Valerie, Toxic, Valerie: the last one goes up, the first one goes
    // away, from the keyboard (Gigs v1.6: no more menu on a song).
    const rows = page.locator('.SetlistSongRow');
    await rows.nth(2).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(rows.nth(1)).toContainText('Valerie');
    await expect(rows.nth(1)).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Valerie passe en n° 2.' }),
    ).toHaveCount(1);
    await rows.nth(0).focus();
    await page.keyboard.press('Delete');
    await expect(rows).toHaveCount(2);
    await expect(
      page.getByRole('status').filter({ hasText: 'Valerie retiré de la setlist.' }),
    ).toHaveCount(1);
    // The row that took its place has the focus.
    await expect(rows.nth(0)).toBeFocused();
    expect(sql('SELECT COUNT(*) FROM setlist')).toBe('0');

    await page.getByRole('button', { name: 'Enregistrer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    // The line breaks are kept where the description is shown.
    const card = page.locator('.SetlistCard-description');
    expect(await card.innerText()).toBe(
      'Place des Terreaux, 21 h\nPuis le défilé\njusqu’à la mairie · 2 morceaux',
    );
    expect(sql("SELECT gigSlotId, number, REPLACE(description, '\\n', '|') FROM setlist")).toBe(
      `${slotIds[1]}\t1\tPlace des Terreaux, 21 h|Puis le défilé|jusqu’à la mairie`,
    );
    expect(sql('SELECT songId FROM setlistSong ORDER BY position')).toBe(`${valerie}\n${toxic}`);
  });

  test('on a phone, the song field goes to the top of the screen so that its suggestions show (#19)', async ({
    page,
  }) => {
    const { gigId, slotIds } = confirmed('Fête des Lumières', ['Vendredi soir']);
    const songs = Array.from({ length: 12 }, (_, index) => addSong(`Morceau ${index + 1}`));
    const setlistId = addSetlist(gigId, slotIds[0] as number, songs);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/${setlistId}`);

    // Far down the page, under a long setlist.
    const field = page.getByLabel('Ajouter un morceau');
    await expect(field).toBeVisible();
    await field.focus();

    await expect.poll(async () => (await field.boundingBox())?.y ?? -1).toBeLessThan(80);
    await field.fill('Morceau');
    const suggestions = page.getByRole('list', { name: 'Suggestions' });
    await expect(suggestions.getByRole('button').first()).toBeInViewport();
  });

  test('a song is dragged by its handle to its place; the handle is not a control of the keyboard', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const songs = ['Toxic', 'Valerie', 'Rasputin'].map((name) => addSong(name));
    const setlist = addSetlist(gigId, slotId, songs);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/${setlist}`);
    const rows = page.locator('.SetlistSongRow');
    await expect(rows).toHaveText([/Toxic/, /Valerie/, /Rasputin/]);

    const from = await rows.nth(0).locator('.SortableHandle').boundingBox();
    const to = await rows.nth(2).boundingBox();
    if (!from || !to) throw new Error('The songs are not shown');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 });
    await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 12 });
    await page.mouse.up();
    await expect(rows).toHaveText([/Valerie/, /Rasputin/, /Toxic/]);
    await expect(page.getByRole('status').filter({ hasText: 'Toxic' })).toBeAttached();

    // Hidden from assistive technology and from the keyboard: the row takes
    // Alt and the arrows instead, and its one button is “Retirer”.
    await expect(rows.nth(0).locator('.SortableHandle')).toHaveAttribute('aria-hidden', 'true');
    await expect(rows.nth(0).getByRole('button')).toHaveCount(1);
    await expect(rows.nth(0).getByRole('button')).toHaveAccessibleName('Retirer Valerie');

    await page.getByRole('button', { name: 'Enregistrer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    expect(
      sql(`SELECT songId FROM setlistSong WHERE setlistId = ${setlist} ORDER BY position`),
    ).toBe([songs[1], songs[2], songs[0]].join('\n'));
  });

  test('a song swiped to the left shows “Retirer”; swiped further, it goes (#20)', async ({
    page,
  }) => {
    const { gigId, slotId } = confirmed();
    const songs = ['Toxic', 'Valerie', 'Rasputin'].map((name) => addSong(name));
    const setlist = addSetlist(gigId, slotId, songs);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/${setlist}`);
    const rows = page.locator('.SetlistSongRow');
    await expect(rows).toHaveCount(3);

    const swipe = async (index: number, share: number) => {
      const box = await rows.nth(index).boundingBox();
      if (!box) throw new Error('The song is not shown');
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width * 0.8, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (0.8 - share), y, { steps: 10 });
      await page.mouse.up();
    };

    // A short swipe reveals “Retirer”, which removes the song.
    await swipe(1, 0.25);
    const remove = rows.nth(1).getByRole('button', { name: 'Retirer Valerie' });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(rows).toHaveText([/Toxic/, /Rasputin/]);
    // A long one removes it outright.
    await swipe(0, 0.7);
    await expect(rows).toHaveText([/Rasputin/]);
    await expect(
      page.getByRole('status').filter({ hasText: 'Toxic retiré de la setlist.' }),
    ).toHaveCount(1);
  });

  test('the list of every song: alphabetical, a tap appends and the list stays open, twice is twice (#20)', async ({
    page,
  }) => {
    const { gigId, slotIds } = confirmed('Fête des Lumières', ['Vendredi soir', 'Samedi soir']);
    const [rasputin, toxic, getLucky] = [
      addSong('Rasputin'),
      addSong('Toxic'),
      addSong('Get Lucky'),
    ];
    addSong('Valerie', 'TEMPORARY');
    addSong('Vesoul', 'PROPOSED');
    // Rasputin is in the setlist n° 1, on another day, and twice in the n° 2.
    addSetlist(gigId, slotIds[0] as number, [rasputin, toxic]);
    const second = addSetlist(gigId, slotIds[1] as number, [getLucky, rasputin, rasputin]);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/${second}`);

    // In the setlist, the dots count the other setlists of the gig: Rasputin
    // once, Get Lucky never.
    const rows = page.locator('.SetlistSongRow');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1).locator('.PlayedDots > span')).toHaveCount(1);
    await expect(rows.nth(1)).toContainText('aussi dans une autre setlist du plan');
    await expect(rows.nth(0).locator('.PlayedDots')).toHaveCount(0);

    await page.getByRole('button', { name: 'Tous les morceaux' }).click();
    const picker = page.getByRole('dialog', { name: 'Tous les morceaux' });
    const songs = picker.getByRole('listitem');
    // The songs a setlist can hold, from A to Z: no proposed song.
    await expect(songs).toHaveText(['Get Lucky', 'Rasputin', 'Toxic', 'Valerie']);
    // In the list, every setlist of the gig counts, this one included.
    await expect(songs.nth(1).locator('.PlayedDots > span')).toHaveCount(3);
    await expect(songs.nth(1).getByRole('button')).toHaveAccessibleName(
      'Ajouter encore Rasputin, déjà dans cette setlist, joué 3 fois sur ce plan',
    );
    await expect(songs.nth(3).getByRole('button')).toHaveAccessibleName('Ajouter Valerie');
    await expect(songs.nth(3).locator('[data-state="inSetlist"]')).toHaveCount(0);

    // A tap appends; the list stays open; a second tap appends again.
    await songs.nth(3).getByRole('button').click();
    await expect(picker).toBeVisible();
    await expect(songs.nth(3).locator('[data-state="inSetlist"]')).toHaveCount(1);
    await songs.nth(3).getByRole('button').click();
    await expect(songs.nth(3).locator('.PlayedDots > span')).toHaveCount(2);

    // The search narrows it; nothing found says what the list holds.
    await picker.getByLabel('Chercher').fill('bohemian');
    await expect(
      picker.getByText(
        'Aucun morceau ne s’appelle « bohemian ». La liste ne contient que les morceaux au répertoire et les temporaires.',
      ),
    ).toBeVisible();
    await picker.getByLabel('Chercher').fill('tox');
    await expect(songs).toHaveText(['Toxic']);
    await picker.getByRole('button', { name: 'Fermer' }).click();
    await expect(picker).toBeHidden();

    await expect(rows).toHaveText([/Get Lucky/, /Rasputin/, /Rasputin/, /Valerie/, /Valerie/]);
    await page.getByRole('button', { name: 'Enregistrer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    expect(
      sql(`SELECT COUNT(*) FROM setlistSong WHERE setlistId = ${second} AND songId <> ${getLucky}`),
    ).toBe('4');
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
    // The back button of the browser asks the same question.
    await page.goBack();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(/\/setlists\/\d+$/);
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

// A recogniser the test speaks through: the browser of the tests has none,
// and no microphone is ever opened.
async function fakeRecogniser(page: Page) {
  await page.addInitScript(() => {
    class Fake {
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { recogniser: Fake }).recogniser = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    (window as unknown as { SpeechRecognition: typeof Fake }).SpeechRecognition = Fake;
  });
}
const say = (page: Page, ...wordings: string[]) =>
  page.evaluate((heard) => {
    const result = Object.assign(
      heard.map((transcript) => ({ transcript })),
      { isFinal: true },
    );
    (
      window as unknown as { recogniser: { onresult: (event: unknown) => void } }
    ).recogniser.onresult({ resultIndex: 0, results: [result] });
  }, wordings);
const phrases = () =>
  sql(
    "SELECT CONCAT(s.name, '=', n.phrase) FROM songSpokenName n JOIN song s ON s.id = n.songId ORDER BY n.id",
  );

test.describe('dictating a setlist', () => {
  test('songs said one by one are added; two that sound alike are chosen between, and the choice is learned', async ({
    page,
  }) => {
    const { gigId } = confirmed();
    for (const name of ['Toxic', 'Crazy Train', 'Crazy Rain', 'Dance']) addSong(name);
    addSong('La danse des canards', 'ABANDONED');
    await fakeRecogniser(page);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/new`);
    await expect(page.getByText('Pas encore de morceau. Tape ou dicte le premier.')).toBeVisible();

    await page.getByRole('button', { name: 'Dicter les morceaux' }).click();
    await expect(page.getByRole('heading', { name: 'J’écoute…' })).toBeVisible();
    // The field that types is gone while it listens.
    await expect(page.getByLabel('Ajouter un morceau')).toHaveCount(0);

    // Heard exactly, and letters said one by one.
    await say(page, 'Toxic');
    await expect(page.getByText('Entendu : « toxic » → Toxic')).toBeVisible();
    await say(page, 'd a n c e');
    await expect(page.getByText('Entendu : « dance » → Dance')).toBeVisible();
    const rows = page.getByRole('list').first().getByRole('listitem');
    await expect(rows).toHaveText([/Toxic/, /Dance/]);

    // A song the band does not play is not added, and says so.
    await say(page, 'La danse des canards');
    await expect(
      page.getByText('« La danse des canards » : ni au répertoire ni temporaire. Pas ajouté.'),
    ).toBeVisible();
    await expect(rows).toHaveCount(2);

    // Two that sound alike: the member chooses, and the phrase is learned.
    await say(page, 'crazy brain');
    await expect(
      page.getByRole('heading', { name: 'Tu as dit « crazy brain » : lequel ?' }),
    ).toBeVisible();
    await expect(page.getByText('Entendu : « crazy brain »', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter Crazy Rain' }).click();
    await expect(rows).toHaveText([/Toxic/, /Dance/, /Crazy Rain/]);
    await expect.poll(phrases).toBe('Crazy Rain=crazy brain');

    // Learned: the same words now name that song at once.
    await say(page, 'Crazy brain');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(3)).toHaveText(/Crazy Rain/);

    // “Aucun des deux” adds nothing and learns nothing.
    await say(page, 'crazy drain');
    await page.getByRole('button', { name: 'Aucun des deux' }).click();
    await expect(rows).toHaveCount(4);
    expect(phrases()).toBe('Crazy Rain=crazy brain');

    await page.getByRole('button', { name: 'Arrêter' }).click();
    await expect(page.getByLabel('Ajouter un morceau')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer la setlist' }).click();
    await expect(page).toHaveURL(`/gigs/${gigId}`);
    expect(sql('SELECT COUNT(*) FROM setlistSong')).toBe('4');
  });

  test('a title heard the French way, or spelt with the names of its letters, still meets its song', async ({
    page,
  }) => {
    const { gigId } = confirmed();
    for (const name of ['Toxic', 'Dance', 'Get Lucky']) addSong(name);
    await fakeRecogniser(page);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/new`);
    await page.getByRole('button', { name: 'Dicter les morceaux' }).click();

    await say(page, 'toxique');
    await expect(page.getByText('Entendu : « toxique » → Toxic')).toBeVisible();
    await say(page, 'dé a enne cé e');
    await expect(page.getByText('Entendu : « de a enne ce e » → Dance')).toBeVisible();
    // Among the wordings of the recogniser, the one closest to a song is kept.
    await say(page, 'le queue', 'guette lucky');
    await expect(page.getByText('Entendu : « guette lucky » → Get Lucky')).toBeVisible();
    await expect(page.getByRole('list').first().getByRole('listitem')).toHaveText([
      /Toxic/,
      /Dance/,
      /Get Lucky/,
    ]);
    // Guessed, not chosen: nothing is learned.
    expect(phrases()).toBe('');
  });

  test('replacing at once the song the dictation added teaches the phrase to the right one', async ({
    page,
  }) => {
    const { gigId } = confirmed();
    for (const name of ['The Bay', 'Obey']) addSong(name);
    await fakeRecogniser(page);
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/new`);
    await page.getByRole('button', { name: 'Dicter les morceaux' }).click();
    // The recogniser gives several wordings: the first that names a song wins.
    await say(page, 'aubaine', 'obey');
    await expect(page.getByText('Entendu : « obey » → Obey')).toBeVisible();
    await page.getByRole('button', { name: 'Arrêter' }).click();

    await page.locator('.SetlistSongRow').filter({ hasText: 'Obey' }).focus();
    await page.keyboard.press('Delete');
    await page.getByLabel('Ajouter un morceau').fill('bay');
    await page.getByLabel('Ajouter un morceau').press('Enter');
    await expect.poll(phrases).toBe('The Bay=obey');

    // Typing alone never teaches anything.
    await page.getByLabel('Ajouter un morceau').fill('obe');
    await page.getByLabel('Ajouter un morceau').press('Enter');
    expect(phrases()).toBe('The Bay=obey');
  });

  test('a browser that cannot listen offers no microphone; a refused microphone says so', async ({
    page,
    browser,
  }) => {
    const { gigId } = confirmed();
    addSong('Toxic');
    await page.addInitScript(() => {
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
        Object.defineProperty(window, name, { value: undefined });
      }
    });
    await asMember(page, 'Sissi');
    await page.goto(`/gigs/${gigId}/setlists/new`);
    await expect(page.getByText('Pas encore de morceau. Tape le premier.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dicter les morceaux' })).toHaveCount(0);

    const other = await browser.newPage();
    await fakeRecogniser(other);
    await asMember(other, 'Sissi');
    await other.goto(`/gigs/${gigId}/setlists/new`);
    await other.getByRole('button', { name: 'Dicter les morceaux' }).click();
    await other.evaluate(() => {
      const recogniser = (
        window as unknown as {
          recogniser: { onerror: (event: unknown) => void; onend: () => void };
        }
      ).recogniser;
      recogniser.onerror({ error: 'not-allowed' });
      recogniser.onend();
    });
    await expect(other.getByText('Le micro est refusé pour l’app.')).toBeVisible();
    await expect(other.getByLabel('Ajouter un morceau')).toBeVisible();
    await other.close();
  });
});

test.describe('the ways to say a song, in its form', () => {
  test('who manages songs adds one, moves one from another song once asked, and deletes one', async ({
    page,
  }) => {
    const crazy = addSong('Crazy');
    const toxic = addSong('Toxic');
    await signIn(page);
    await page.goto(`/songs/${crazy}/edit`);
    await expect(page.getByRole('heading', { name: 'Dictée' })).toBeVisible();
    await page.getByRole('button', { name: 'Modifier les façons de le dire' }).click();
    let sheet = page.getByRole('dialog', { name: 'Façons de le dire' });
    await sheet.getByRole('button', { name: 'Ajouter une façon de le dire' }).click();
    await sheet.getByLabel('Nouvelle façon de le dire').fill('Crésy');
    await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(sheet.getByText('cresy', { exact: true })).toBeVisible();
    // Too short: refused in words, nothing saved.
    await sheet.getByLabel('Nouvelle façon de le dire').fill('x');
    await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(
      sheet.getByText('Une façon de le dire compte au moins 2 caractères.'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Fermer' }).click();
    // Saved at once, and shown on the card.
    await expect(page.locator('.ListRow-detail', { hasText: 'cresy' })).toBeVisible();
    expect(phrases()).toBe('Crazy=cresy');

    await page.goto(`/songs/${toxic}/edit`);
    await page.getByRole('button', { name: 'Modifier les façons de le dire' }).click();
    sheet = page.getByRole('dialog', { name: 'Façons de le dire' });
    await sheet.getByRole('button', { name: 'Ajouter une façon de le dire' }).click();
    await sheet.getByLabel('Nouvelle façon de le dire').fill('cresy');
    await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(
      sheet.getByText('Déjà apprise pour Crazy : la passer à ce morceau ?'),
    ).toBeVisible();
    expect(phrases()).toBe('Crazy=cresy');
    await sheet.getByRole('button', { name: 'La passer à ce morceau' }).click();
    await expect(sheet.getByRole('button', { name: 'Supprimer « cresy »' })).toBeVisible();
    expect(phrases()).toBe('Toxic=cresy');

    await sheet.getByRole('button', { name: 'Supprimer « cresy »' }).click();
    await expect(sheet.getByRole('button', { name: 'Supprimer « cresy »' })).toHaveCount(0);
    expect(phrases()).toBe('');
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
    sql(`UPDATE member SET hasLegibleFont = 1 WHERE id = ${memberId('Sissi')}`);
    await textSizeOfDevice(page, 200);
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
    await textSizeOfDevice(page, 200);
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

test.describe('notifications on a device', () => {
  test('a new device is asked once; yes turns them on, and the account says so and turns them off', async ({
    page,
  }) => {
    await fakePush(page);
    await asMember(page, 'Zaza');
    const sheet = page.getByRole('dialog', { name: 'Ok pour les notifs ?' });
    await expect(
      sheet.getByText('Quand un plan attend ta réponse, on te prévient sur cet appareil.'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Activer les rappels' }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => sql('SELECT COUNT(*) FROM pushSubscription')).toBe('1');

    // Not asked again on this device.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(sheet).toBeHidden();

    await page.goto('/settings');
    await page.getByRole('link', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(
      page.getByText('Cet appareil reçoit ou non. Ce que tu reçois se règle une fois'),
    ).toBeVisible();
    const reminders = page.getByRole('switch', { name: 'Recevoir les notifications' });
    await expect(reminders).toBeChecked();
    await reminders.click();
    await expect(reminders).not.toBeChecked();
    await expect.poll(() => sql('SELECT COUNT(*) FROM pushSubscription')).toBe('0');
    await reminders.click();
    await expect(reminders).toBeChecked();
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('1');
  });

  test('“Pas sur cet appareil” turns nothing on and is not asked again; a blocked device says so', async ({
    page,
    browser,
  }) => {
    await fakePush(page);
    await asMember(page, 'Zaza');
    const sheet = page.getByRole('dialog', { name: 'Ok pour les notifs ?' });
    await sheet.getByRole('button', { name: 'Pas sur cet appareil' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(sheet).toBeHidden();
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('0');

    const blocked = await browser.newPage();
    await fakePush(blocked, 'denied');
    await asMember(blocked, 'Zaza');
    await expect(blocked.getByRole('dialog')).toHaveCount(0);
    await blocked.goto('/settings/notifications');
    await expect(
      blocked.getByRole('switch', { name: 'Recevoir les notifications' }),
    ).not.toBeChecked();
    await expect(
      blocked.getByText('Les notifications sont bloquées pour l’app sur cet appareil.'),
    ).toBeVisible();
    await blocked.close();
  });

  test('“Relancer” is for who may edit the gig, and shows when the last reminder left', async ({
    page,
  }) => {
    const { gigId } = addGig('Fête de la soupe', { status: 'PROPOSED', startsOn: day(10) });
    await asMember(page, 'Zaza');
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Fête de la soupe' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Relancer' })).toHaveCount(0);

    await page.evaluate(() => fetch('/api/session', { method: 'DELETE' }));
    await signIn(page);
    await page.goto(`/gigs/${gigId}`);
    await expect(page.getByText('3 n’ont pas répondu')).toBeVisible();
    await expect(page.getByText(/Dernière relance/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Relancer' }).click();
    await expect(
      page.getByText(/^Dernière relance\s: \S+ \d{1,2} \S+, \d{1,2}\sh(\s\d\d)?\.$/),
    ).toBeVisible();
    expect(sql('SELECT remindedAt IS NOT NULL FROM gig')).toBe('1');
  });
});
