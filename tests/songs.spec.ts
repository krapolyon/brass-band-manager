import { expect, type Page, test } from '@playwright/test';
import { textSizeOfDevice } from './support/accessibility.ts';
import { emptyDatabase, sql } from './support/database.ts';
import {
  botUser,
  channel,
  discordAnswers,
  discordMessages,
  discordServer,
  emptyDiscord,
  roles,
  server,
  tagApp,
} from './support/discord.ts';
import { addMember, admin, deviceOf, install, memberPassword } from './support/scenario.ts';
import {
  addSong,
  cover,
  instrumentId,
  midi,
  mp3,
  museScore,
  readablePdf,
  readableScore,
  sendFile,
} from './support/songFiles.ts';
import { emptyStorage } from './support/storage.ts';

// The screens of songs: the list, the song in its modes, the levels a member
// gives it, and what whoever manages songs does (import, edit, status,
// delete, the table). Rules: model/songs.md; screens: Figma, page Songs.
// The songs are well-known ones taken as examples; nobody here is real.

// The band: Jibé the admin (Sax Ténor), Zaza a plain member (Trompette),
// Sisi who manages songs (Trompette).
let seven = 0;

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  const sisi = await deviceOf(playwright, addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER'] }));

  addSong('Crazy');
  addSong('Toxic', 'IN_PROGRESS');
  addSong('Le Bal masqué', 'PROPOSED');
  addSong('Rasputin', 'ABANDONED');
  seven = addSong('Seven Nation');
  await sisi.put(`/api/songs/${seven}`, {
    data: {
      name: 'Seven Nation',
      originalTitle: 'Seven Nation Army',
      originalArtist: 'The White Stripes',
      status: 'IN_REPERTOIRE',
      bpm: 124,
      versionOn: '2026-09-14',
      versionNote: 'Nouveau pont avant le dernier refrain.',
      clipUrl: 'https://youtu.be/0J2QdDbelmY',
    },
  });
  await sendFile(sisi, `/api/songs/${seven}/cover`, cover);
  await sendFile(sisi, `/api/songs/${seven}/midi`, midi);
  await sendFile(sisi, `/api/songs/${seven}/museScore`, museScore);
  for (const name of ['Trompette', 'Sax Ténor']) {
    await sendFile(sisi, `/api/songs/${seven}/parts/${instrumentId(name)}`, readablePdf());
  }
  await sisi.dispose();
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

const rows = (page: Page) => page.locator('.SongRow');
const names = (page: Page) => rows(page).locator('.SongRow-name').allTextContents();
const noOverflow = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

test.describe('the list of songs', () => {
  test('shows what the band plays or is learning, by name; the proposed and abandoned ones behind two filters', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('link', { name: 'Morceaux' })
      .click();

    await expect(page.getByRole('heading', { name: 'Morceaux', level: 1 })).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
    expect(await names(page)).toEqual(['Crazy', 'Seven Nation', 'Toxic']);
    await expect(page.getByText('3 morceaux, de A à Z.')).toBeVisible();
    // A status is shown only when it is not the ordinary one.
    await expect(rows(page).filter({ hasText: 'Toxic' })).toContainText('Montage en cours');
    await expect(rows(page).filter({ hasText: 'Crazy' }).locator('.Chip')).toHaveCount(0);

    // Both filters are off when the screen opens.
    const proposed = page.getByRole('button', { name: 'Proposés' });
    await expect(proposed).toHaveAttribute('aria-pressed', 'false');
    await proposed.click();
    await expect
      .poll(() => names(page))
      .toEqual(['Crazy', 'Le Bal masqué', 'Seven Nation', 'Toxic']);
    await page.getByRole('button', { name: 'Abandonnés' }).click();
    await expect(rows(page)).toHaveCount(5);
    await expect(rows(page).filter({ hasText: 'Rasputin' })).toContainText('Abandonné');
  });

  test('the search reads the name, the original title and the artist, without regard to accents', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');
    const search = page.getByLabel('Chercher un morceau');

    // The list follows the search after a render: waited for, not read at once.
    await search.fill('white stripes');
    await expect.poll(() => names(page)).toEqual(['Seven Nation']);
    await search.fill('ARMY');
    await expect.poll(() => names(page)).toEqual(['Seven Nation']);

    // A proposed song is not found until its filter is on: the screen says so.
    await search.fill('bal masque');
    await expect(page.getByRole('heading', { name: 'Aucun morceau à ce nom' })).toBeVisible();
    await expect(page.getByText('active le filtre')).toBeVisible();
    await page.getByRole('button', { name: 'Proposés' }).click();
    await expect.poll(() => names(page)).toEqual(['Le Bal masqué']);
  });

  test('rows or grid: the button shows the other view, and the choice stays on the device', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');

    await page.getByRole('button', { name: 'Afficher en grille' }).click();
    await expect(page.locator('.SongCard')).toHaveCount(3);
    await expect(rows(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.SongCard')).toHaveCount(3);
    await page.getByRole('button', { name: 'Afficher en liste' }).click();
    await expect(rows(page)).toHaveCount(3);
  });

  test('an empty repertoire says what to do to who manages songs, and that it happens to the others', async ({
    page,
  }) => {
    sql('DELETE FROM song');
    await asMember(page, 'Zaza');
    await page.goto('/songs');

    await expect(page.getByRole('heading', { name: 'Le répertoire est vide' })).toBeVisible();
    await expect(page.getByText('n’en ont pas encore ajouté')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ajouter/ })).toHaveCount(0);

    // Another member, on the same device.
    await page.context().clearCookies();
    await asMember(page, 'Sisi');
    await page.goto('/songs');
    await expect(page.getByText('Ajoute le premier morceau')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un morceau' }).click();
    await expect(page).toHaveURL('/songs/new');
  });

  test('download everything: one archive per kind, for the songs shown', async ({ page }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');
    await page.getByLabel('Chercher un morceau').fill('seven');
    await page.getByRole('button', { name: 'Plus d’actions' }).click();

    const panel = page.getByRole('dialog', { name: 'Tout télécharger' });
    // Zaza plays the trumpet: her parts.
    const parts = panel.getByRole('link', { name: /Toutes mes partitions/ });
    await expect(parts).toContainText('Trompette · 1 PDF');
    await expect(parts).toHaveAttribute('href', `/api/songs/archive?kind=parts&songs=${seven}`);
    await expect(panel.getByRole('link', { name: /Tous les fichiers MIDI/ })).toContainText(
      '1 fichier',
    );
    // No recording among the songs shown: nothing to download, and it is said.
    await expect(panel.getByText('Tous les enregistrements')).toBeVisible();
    await expect(panel.getByRole('link', { name: /Tous les enregistrements/ })).toHaveCount(0);
    await expect(panel.getByText('la recherche et les filtres comptent')).toBeVisible();

    const download = page.waitForEvent('download');
    await parts.click();
    expect((await download).suggestedFilename()).toBe('Partitions - Trompette.zip');
  });
});

test.describe('a song', () => {
  test('shows what the band says of it, and opens in the mode last used on the device', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');
    await rows(page).filter({ hasText: 'Seven Nation' }).click();

    await expect(page).toHaveURL(`/songs/${seven}`);
    await expect(page.getByRole('heading', { name: 'Seven Nation', level: 1 })).toBeVisible();
    await expect(page.getByText('The White Stripes')).toBeVisible();
    await expect(page.getByText('Version du 14 septembre 2026')).toBeVisible();
    await expect(page.getByText('Nouveau pont avant le dernier refrain.')).toBeVisible();
    await expect(page.getByText('Seven Nation Army')).toBeVisible();
    await expect(page.getByText('124 bpm')).toBeVisible();

    // The five modes are always there.
    const modes = page.getByRole('group', { name: 'Modes du morceau' });
    await expect(modes.getByRole('button')).toHaveText(['MP3', 'MIDI', 'PDF', 'Clip', 'Live']);
    await expect(modes.getByRole('button', { name: 'MP3' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await modes.getByRole('button', { name: 'Clip' }).click();
    await page.reload();
    await expect(modes.getByRole('button', { name: 'Clip' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.getByRole('link', { name: 'Retour' }).click();
    await expect(page).toHaveURL('/songs');
  });

  test('a song without tempo, version or cover shows no such line', async ({ page }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');
    await rows(page).filter({ hasText: 'Crazy' }).click();

    await expect(page.getByText('Titre original')).toBeVisible();
    await expect(page.getByText('Tempo', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Version du/)).toHaveCount(0);
  });

  test('MP3: without a recording, a member is told so and who manages songs is offered to add it', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}?mode=mp3`);
    await expect(page.getByRole('heading', { name: 'Pas encore d’enregistrement' })).toBeVisible();
    await expect(page.getByText('On ne l’a pas encore mis en boîte.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter l’enregistrement' })).toHaveCount(0);

    // Another member, on the same device.
    await page.context().clearCookies();
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}?mode=mp3`);
    await expect(page.getByText('Un mp3 ou un m4a de la fanfare')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter l’enregistrement' }).click();
    await expect(page).toHaveURL(`/songs/${seven}/edit`);
  });

  test('MP3: the recording is a slider with its position in words; one that does not load says so and can be retried', async ({
    page,
    playwright,
  }) => {
    // The made-up recording of the tests holds no sound: it cannot be played.
    const sisi = await deviceOf(playwright, email('Sisi'));
    const sent = await (await sendFile(sisi, `/api/songs/${seven}/audio`, mp3)).json();
    await sisi.put(`/api/songs/${seven}/audio/peaks`, {
      data: { peaks: [10, 80, 40, 100], version: sent.audio.url.split('v=')[1] },
    });
    await sisi.dispose();

    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}?mode=mp3`);
    const slider = page.getByRole('slider', { name: 'Position dans l’enregistrement' });
    await expect(slider).toHaveAttribute('aria-valuetext', '0:00 sur 0:00');
    await expect(page.getByRole('button', { name: 'Reculer de 10 secondes' })).toBeDisabled();

    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(page.getByText('L’enregistrement ne se charge pas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();

    // What is loaded follows the member from a screen to another, above the tab bar.
    await page.getByRole('link', { name: 'Retour' }).click();
    const mini = page.locator('.SongMention');
    await expect(mini).toContainText('Seven Nation');
    await mini.getByRole('button', { name: 'Arrêter la lecture' }).click();
    await expect(mini).toHaveCount(0);
  });

  test('MP3: a recording without its outline gets it from the browser of who manages songs, not of a member (#29)', async ({
    page,
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    await sendFile(sisi, `/api/songs/${seven}/audio`, mp3);
    await sisi.dispose();
    const fetched = (page: Page) => {
      const asked: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes(`/api/songs/${seven}/audio`)) asked.push(request.method());
      });
      return asked;
    };

    // A member: the screen draws plain bars and asks for nothing.
    let asked = fetched(page);
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}?mode=mp3`);
    await expect(
      page.getByRole('slider', { name: 'Position dans l’enregistrement' }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);

    // Who manages songs: the recording is read to compute it. The made-up
    // recording holds no sound, so nothing comes of it here.
    await page.context().clearCookies();
    asked = fetched(page);
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}?mode=mp3`);
    await expect.poll(() => asked).toContain('GET');
  });

  test('PDF: the part of the member’s instrument comes first; another is one tap away, a missing one cannot be chosen', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}?mode=pdf`);

    // Zaza plays the trumpet. No word says "your part".
    const picker = page.getByRole('button', { name: 'Choisir une autre partition' });
    await expect(picker).toHaveText('Trompette');
    await expect(page.getByRole('img', { name: 'Page 1 de la partition' }).first()).toBeVisible();

    await picker.click();
    const panel = page.getByRole('dialog', { name: 'Partitions' });
    await expect(panel.locator('.SongPartRow, .ListRow')).toHaveText([
      /Trompette.*Affichée/,
      /Sax Alto.*Pas de partition pour ce morceau/,
      /Sax Ténor/,
      /Souba.*Pas de partition pour ce morceau/,
    ]);
    await expect(panel.getByRole('button', { name: /Sax Alto/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await panel.getByRole('button', { name: /Sax Ténor/ }).click();
    await expect(picker).toHaveText('Sax Ténor');

    // Read over the whole screen, from its own button.
    await page.getByRole('button', { name: 'Lire en plein écran' }).click();
    await expect(page.getByRole('button', { name: 'Quitter le plein écran' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Quitter le plein écran' })).toBeHidden();
  });

  test('Clip: nothing is asked of YouTube before the member presses play', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => asked.push(new URL(request.url()).hostname));
    // The player itself is not loaded by the tests.
    await page.route(/youtube/, (route) =>
      route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
    );

    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}?mode=clip`);
    const play = page.getByRole('button', { name: 'Lire le clip' });
    await expect(play).toBeVisible();
    // The thumbnail is the one the server keeps.
    await expect(play.locator('img')).toHaveAttribute(
      'src',
      new RegExp(`^/api/songs/${seven}/clipThumbnail`),
    );
    await expect(page.getByRole('link', { name: 'Ouvrir sur YouTube' })).toHaveAttribute(
      'href',
      'https://youtu.be/0J2QdDbelmY',
    );
    expect(asked.every((host) => host === 'localhost')).toBe(true);

    await play.click();
    await expect(page.locator('iframe')).toHaveAttribute(
      'src',
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/0J2QdDbelmY/,
    );
  });

  test('a member gives their two levels, sees the average of the band, and can empty a level', async ({
    page,
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    await sisi.put(`/api/songs/${seven}/levels`, { data: { masteryLevel: 2, enjoymentLevel: 5 } });
    await sisi.dispose();

    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    const mastery = page.getByRole('radiogroup', { name: 'Maîtrise' });
    await expect(mastery.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(page.getByText('Fanfare : 2,0 sur 5 · 1 réponse')).toBeVisible();
    await expect(
      page.getByText('Personne ne voit tes notes : la fanfare ne voit que la moyenne.'),
    ).toBeVisible();

    await mastery.getByRole('radio', { name: '4' }).check({ force: true });
    await expect(page.getByText('Fanfare : 3,0 sur 5 · 2 réponses')).toBeVisible();
    expect(
      sql(
        'SELECT masteryLevel FROM memberSong m JOIN member p ON p.id = m.memberId WHERE p.nickname = "Zaza"',
      ),
    ).toBe('4');

    await page.reload();
    await expect(mastery.getByRole('radio', { name: '4' })).toBeChecked();
    // Pressing the level already chosen empties it.
    await mastery.getByRole('radio', { name: '4' }).click({ force: true });
    await expect(page.getByText('Fanfare : 2,0 sur 5 · 1 réponse')).toBeVisible();
    expect(
      sql(
        'SELECT COUNT(*) FROM memberSong m JOIN member p ON p.id = m.memberId WHERE p.nickname = "Zaza"',
      ),
    ).toBe('0');
  });

  test('a song not rated yet says so at the top and outlines the card; the message sends to it (#44)', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    const card = page.getByRole('region', { name: 'Toi et ce morceau' });
    const nudge = page.getByRole('button', { name: /Tu n’as pas encore noté/ });

    await expect(nudge).toBeVisible();
    await expect(card).toHaveAttribute('data-outlined', 'true');
    await nudge.click();
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();

    // One level is enough: the message and the outline go.
    await card
      .getByRole('radiogroup', { name: 'Kif' })
      .getByRole('radio', { name: '5' })
      .check({ force: true });
    await expect(nudge).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-outlined');
  });

  test('a rating more than a year old is asked again; "Toujours d’accord" confirms it (#44)', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    const zaza = sql('SELECT id FROM member WHERE nickname = "Zaza"');
    sql(
      `INSERT INTO memberSong (memberId, songId, masteryLevel, enjoymentLevel, ratedOn) VALUES (${zaza}, ${seven}, 4, 5, DATE_SUB(UTC_DATE(), INTERVAL 13 MONTH))`,
    );
    await page.goto(`/songs/${seven}`);
    const card = page.getByRole('region', { name: 'Toi et ce morceau' });

    // Rated: no message at the top, but the card asks again.
    await expect(page.getByRole('button', { name: /Tu n’as pas encore noté/ })).toHaveCount(0);
    await expect(card).toHaveAttribute('data-outlined', 'true');
    await expect(
      card.getByText('Ta note a plus d’un an. Toujours d’accord ? Change-la, ou confirme-la.'),
    ).toBeVisible();

    await card.getByRole('button', { name: 'Toujours d’accord' }).click();
    await expect(card.getByRole('button', { name: 'Toujours d’accord' })).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-outlined');
    // Nothing else changed.
    expect(
      sql(
        `SELECT masteryLevel, enjoymentLevel, ratedOn = UTC_DATE() FROM memberSong WHERE memberId = ${zaza}`,
      ),
    ).toBe('4\t5\t1');

    // A rating of eleven months is not asked again.
    sql(`UPDATE memberSong SET ratedOn = DATE_SUB(UTC_DATE(), INTERVAL 11 MONTH)`);
    await page.reload();
    await expect(
      card.getByRole('radiogroup', { name: 'Kif' }).getByRole('radio', { name: '5' }),
    ).toBeChecked();
    await expect(card).not.toHaveAttribute('data-outlined');
  });

  test('more actions: a member downloads; only who manages songs is offered to edit or change the status', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    const panel = page.getByRole('dialog', { name: 'Seven Nation' });

    await expect(panel.getByRole('link', { name: /Ma partition/ })).toContainText(
      'Trompette · PDF',
    );
    await expect(panel.getByRole('link', { name: /Fichier MuseScore/ })).toContainText(
      'Pour imprimer le conducteur',
    );
    await expect(panel.getByRole('link', { name: /Fichier MIDI/ })).toHaveAttribute(
      'href',
      /\/midi\?v=.*&download$/,
    );
    await expect(panel.getByText('Gérer le morceau')).toHaveCount(0);
    await expect(panel.getByRole('link', { name: 'Modifier le morceau' })).toHaveCount(0);

    // The address of the form is closed to her too.
    await page.goto(`/songs/${seven}/edit`);
    await expect(page.getByRole('heading', { name: 'Pas par ici' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour au morceau' }).click();
    await expect(page).toHaveURL(`/songs/${seven}`);
  });

  test('the list and a song hold at a text size of 200 %, without scrolling sideways', async ({
    page,
  }) => {
    await textSizeOfDevice(page, 200);
    await asMember(page, 'Zaza');
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '200');

    await page.goto('/songs');
    await expect(rows(page)).toHaveCount(3);
    await noOverflow(page);
    await page.goto(`/songs/${seven}`);
    await expect(page.getByText('Toi et ce morceau')).toBeVisible();
    await noOverflow(page);
  });
});

test.describe('the MIDI player', () => {
  // A song imported with a MuseScore file the app can read: two staves,
  // "Trompette" and "Tuba", four measures at 120.
  async function withScore(
    playwright: Parameters<typeof deviceOf>[0],
    page: Page,
    variant: '' | 'hiddenPart' = '',
  ) {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      {
        name: 'Hey Ya.mscz',
        mimeType: 'application/octet-stream',
        buffer: readableScore(variant),
      },
    ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    void playwright;
  }
  const openMidi = (page: Page) =>
    page
      .getByRole('group', { name: 'Modes du morceau' })
      .getByRole('button', { name: 'MIDI' })
      .click();

  test('without a MIDI file, a member is told so and who manages songs is offered to add the MuseScore file', async ({
    page,
  }) => {
    const crazy = sql("SELECT id FROM song WHERE name = 'Crazy'");
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${crazy}`);
    await openMidi(page);
    await expect(page.getByRole('heading', { name: 'Pas encore de fichier MIDI' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter le fichier MuseScore' })).toHaveCount(0);

    await page.context().clearCookies();
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${crazy}`);
    await openMidi(page);
    await expect(page.getByRole('button', { name: 'Ajouter le fichier MuseScore' })).toBeVisible();
  });

  test('a MIDI file that cannot be read says so', async ({ page }) => {
    // The song of the tests holds a MIDI file with no note.
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    await openMidi(page);
    await expect(
      page.getByText('Le fichier MIDI ne se charge pas.', { exact: false }),
    ).toBeVisible();
  });

  test('a file written by MuseScore 4.4, with a line the engine does not know, is read all the same', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      {
        name: 'Sledge.mscz',
        mimeType: 'application/octet-stream',
        buffer: readableScore('lastEid'),
      },
    ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Sledge');
    await page.getByLabel('Interprète original').fill('Dance with the Dead');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Sledge', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await openMidi(page);
    await expect(page.getByText('Mesure 1 sur 4')).toBeVisible();
  });

  test('a part hidden in MuseScore, and a staff without any note, are not shown (#35)', async ({
    page,
    playwright,
  }) => {
    // "Cornet" plays but is hidden in the MuseScore file; "Clairon" is empty.
    await withScore(playwright, page, 'hiddenPart');
    await openMidi(page);

    const tracks = page.getByRole('region', { name: 'Pistes' });
    await expect(tracks.locator('.SongPartTrack-name')).toHaveText([/^Trompette/, 'Souba']);
    await expect(page.getByText('Mesure 1 sur 4')).toBeVisible();
  });

  test('one lane per staff, named after its instrument; a track is cut, the tempo slowed, a range looped', async ({
    page,
    playwright,
  }) => {
    await withScore(playwright, page);
    await openMidi(page);

    // "Trompette" is the instrument; "Tuba" is a known spelling of the Souba.
    const tracks = page.getByRole('region', { name: 'Pistes' });
    await expect(tracks.locator('.SongPartTrack-name')).toHaveText([/^Trompette/, 'Souba']);
    await expect(page.getByText('Mesure 1 sur 4')).toBeVisible();
    // Sisi plays the trumpet: its track is her own.
    await expect(tracks.locator('.SongPartTrack').first()).toHaveAttribute('data-own', 'true');
    await expect(tracks.locator('.SongPartTrack').nth(1)).toHaveAttribute('data-own', 'false');

    // Cutting a track: the button says it is pressed, and all can be put back.
    const cut = page.getByRole('button', { name: 'Couper Souba' });
    await expect(page.getByRole('button', { name: 'Tout réactiver' })).toHaveCount(0);
    await cut.click();
    await expect(cut).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tout réactiver' }).click();
    await expect(cut).toHaveAttribute('aria-pressed', 'false');

    // The member's own track is said, not only coloured.
    await expect(tracks.locator('.SongPartTrack-name').first()).toContainText('ton instrument');

    // The tempo starts at the one of the file, and moves by steps.
    await expect(page.getByText('Celui de la fanfare : 120')).toBeVisible();
    await page.getByRole('button', { name: 'Ralentir' }).click();
    await expect(page.getByLabel('116 battements par minute')).toBeVisible();
    await page.getByRole('button', { name: 'Accélérer' }).click();

    // How loud the cut tracks stay.
    const volume = page.getByRole('slider', { name: 'Volume des pistes coupées' });
    await volume.focus();
    await page.keyboard.press('ArrowRight');
    await expect(volume).toHaveAttribute('aria-valuetext', /^5\s%$/);

    // A range of measures, typed; one outside the song cannot be chosen.
    await page
      .getByRole('button', { name: /^En boucle/ })
      .last()
      .click();
    const panel = page.getByRole('dialog', { name: 'Lecture en boucle' });
    await panel.getByLabel('De la mesure').fill('3');
    await panel.getByLabel('À la mesure').fill('9');
    await expect(panel.getByRole('button', { name: 'Boucler' })).toBeDisabled();
    await panel.getByLabel('À la mesure').fill('4');
    await panel.getByRole('button', { name: 'Boucler les mesures 3 à 4' }).click();
    await expect(page.getByText('Mesures 3 à 4')).toBeVisible();
    await expect(page.getByText('Mesure 3 sur 4')).toBeVisible();

    // Playing: the sounds of the app load, the song moves, and pause stops it.
    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();
    await expect(page.getByText('Mesure 4 sur 4')).toBeVisible({ timeout: 20_000 });
    // The range is played again: the song comes back to its start.
    await expect(page.getByText('Mesure 3 sur 4')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Mettre en pause' }).click();
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeVisible();

    await noOverflow(page);
  });

  test('a clock left interrupted by the device is replaced when the member presses play (#22)', async ({
    page,
    playwright,
  }) => {
    // As an iPhone does after the app was left alone: the first clock of the
    // sound says "interrupted", and resume() never brings it back.
    await page.addInitScript(() => {
      const Real = window.AudioContext;
      let created = 0;
      class Device extends Real {
        private readonly isStuck = created++ === 0;
        get state() {
          return this.isStuck ? ('interrupted' as AudioContextState) : super.state;
        }
        resume() {
          return this.isStuck ? new Promise<void>(() => {}) : super.resume();
        }
      }
      Object.assign(window, { AudioContext: Device, clocks: () => created });
    });
    await withScore(playwright, page);
    await openMidi(page);
    await expect(page.getByText('Mesure 1 sur 4')).toBeVisible();

    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(page.getByText('Mesure 2 sur 4')).toBeVisible({ timeout: 20_000 });
    expect(
      await page.evaluate(() => (window as unknown as { clocks: () => number }).clocks()),
    ).toBe(2);
    await page.getByRole('button', { name: 'Mettre en pause' }).click();
  });

  test('the rehearsal marks of the score are offered for the loop, each with its measures', async ({
    page,
    playwright,
  }) => {
    await withScore(playwright, page);
    await openMidi(page);
    await page
      .getByRole('button', { name: /^En boucle/ })
      .last()
      .click();
    const panel = page.getByRole('dialog', { name: 'Lecture en boucle' });

    // The score has one mark, "Refrain", on its third measure of four: a box
    // to tick (0.3.0: one mark or several that follow each other).
    const mark = panel.getByRole('checkbox', { name: /Refrain/ });
    await expect(mark).toHaveAccessibleName(/Refrain\s*Mesures 3 à 4/);
    await expect(mark).not.toBeChecked();
    await mark.check();
    await expect(panel.getByLabel('De la mesure')).toHaveValue('3');
    await expect(panel.getByLabel('À la mesure')).toHaveValue('4');
    // Typing measures unticks a mark that no longer matches.
    await panel.getByLabel('À la mesure').fill('3');
    await expect(mark).not.toBeChecked();
    await panel.getByLabel('À la mesure').fill('4');
    await expect(mark).toBeChecked();
    await panel.getByRole('button', { name: 'Boucler les mesures 3 à 4' }).click();

    await expect(page.getByText('Mesures 3 à 4, Refrain')).toBeVisible();
    await expect(page.getByText('Mesure 3 sur 4')).toBeVisible();
  });

  test('the tempo of the band is the one the player starts at, and stays within reach', async ({
    page,
    playwright,
  }) => {
    await withScore(playwright, page);
    // Far above what the file says (120), and above one and a half times it.
    sql("UPDATE song SET bpm = 200 WHERE name = 'Hey Ya'");
    await page.reload();
    await openMidi(page);

    await expect(page.getByText('Celui de la fanfare : 200')).toBeVisible();
    await expect(page.getByLabel('200 battements par minute')).toBeVisible();
    await page.getByRole('button', { name: 'Accélérer' }).click();
    await expect(page.getByLabel('200 battements par minute')).toBeVisible();
    await page.getByRole('button', { name: 'Ralentir' }).click();
    await expect(page.getByLabel('196 battements par minute')).toBeVisible();
  });

  test('with less motion asked, the lanes move once per measure', async ({ page, playwright }) => {
    await withScore(playwright, page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMidi(page);
    const lane = page.locator('.SongPartTrack-lane canvas').first();
    const drawn = () => lane.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(page.getByText('Mesure 2 sur 4')).toBeVisible({ timeout: 20_000 });
    // Two looks within the same measure show the same lane.
    const first = await drawn();
    await page.waitForTimeout(300);
    const second = await drawn();
    if (await page.getByText('Mesure 2 sur 4').isVisible()) expect(second).toBe(first);
  });

  test('nothing is asked of another site: the engine and the sounds are files of the app', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      if (
        !request.url().startsWith(baseURL ?? '') &&
        !request.url().startsWith('data:') &&
        !request.url().startsWith('blob:')
      ) {
        elsewhere.push(request.url());
      }
    });
    await withScore(playwright, page);
    await openMidi(page);
    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(page.getByText(/Mesure [2-4] sur 4/)).toBeVisible({ timeout: 20_000 });

    expect(elsewhere).toEqual([]);
  });
});

test.describe('the Live mode', () => {
  // A song imported with a MuseScore file the app can read: "Trompette" and
  // "Tuba", four measures of four beats at 120, a mark "Refrain" on the third.
  async function withScore(page: Page, variant: '' | 'repeat' | 'hiddenPart' = '') {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      {
        name: 'Hey Ya.mscz',
        mimeType: 'application/octet-stream',
        buffer: readableScore(variant),
      },
    ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  }
  const openLive = (page: Page) =>
    page
      .getByRole('group', { name: 'Modes du morceau' })
      .getByRole('button', { name: 'Live' })
      .click();
  const measure = (page: Page) => page.locator('[data-tile="measure"]');

  test('without a score, a member is told so and who manages songs is offered to add the MuseScore file', async ({
    page,
  }) => {
    const crazy = sql("SELECT id FROM song WHERE name = 'Crazy'");
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${crazy}`);
    await openLive(page);
    await expect(
      page.getByRole('heading', { name: 'Pas encore de partition à suivre' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter le fichier MuseScore' })).toHaveCount(0);

    await page.context().clearCookies();
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${crazy}`);
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Ajouter le fichier MuseScore' })).toBeVisible();
  });

  test('shows the part of the member’s instrument, starts where asked, follows the tempo and comes back at the end', async ({
    page,
    baseURL,
  }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        elsewhere.push(url);
      }
    });
    await withScore(page);
    await openLive(page);

    // Sisi plays the trumpet: its part, drawn by the app, every measure of it.
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible();
    await expect(page.getByText('Mode live')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Changer de partition : Trompette' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.locator('.songs-liveSheet g.measure')).toHaveCount(4);
    await expect(page.locator('[data-tile="tempo"]')).toContainText('120');

    // Where to start: a measure that does not exist is refused, a mark fills the number.
    await page.getByRole('button', { name: /On démarre à/ }).click();
    const panel = page.getByRole('dialog', { name: 'On démarre où ?' });
    await panel.getByRole('textbox', { name: 'Mesure' }).fill('9');
    await expect(panel.getByRole('button', { name: 'Démarrer', exact: true })).toBeDisabled();
    await panel.getByRole('button', { name: 'Refrain · 3' }).click();
    await expect(panel.getByRole('textbox', { name: 'Mesure' })).toHaveValue('3');
    await panel.getByRole('button', { name: 'Mesure suivante' }).click();
    await panel.getByRole('button', { name: 'Mesure précédente' }).click();
    await panel.getByRole('button', { name: 'Démarrer à la mesure 3' }).click();
    await expect(page.getByRole('button', { name: /On démarre à/ })).toContainText(
      'Mesure 3 · Refrain',
    );

    // Playing: a measure of four beats at 120 lasts two seconds.
    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await expect(measure(page)).toContainText('3');
    await expect(
      page.getByText('Décalé ? Fais glisser la partition pour te recaler.'),
    ).toBeVisible();
    await expect(measure(page)).toContainText('4', { timeout: 4000 });
    // The end of the score: ready again, from its start.
    await expect(page.getByRole('button', { name: /On démarre à/ })).toContainText('Mesure 1', {
      timeout: 6000,
    });

    // Pause keeps the place.
    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    await page.getByRole('button', { name: 'Mettre en pause' }).click();
    await expect(page.getByRole('button', { name: /On démarre à/ })).toContainText('Mesure 1');

    await noOverflow(page);
    expect(elsewhere).toEqual([]);
  });

  test('another part can be chosen, and leaving comes back to the mode before', async ({
    page,
  }) => {
    await withScore(page);
    await page
      .getByRole('group', { name: 'Modes du morceau' })
      .getByRole('button', { name: 'PDF' })
      .click();
    await openLive(page);
    await page.getByRole('button', { name: 'Changer de partition : Trompette' }).click();
    // "Tuba" is a known spelling of the Souba.
    await page.getByRole('dialog').getByRole('button', { name: 'Souba' }).click();
    await expect(page.getByRole('button', { name: 'Changer de partition : Souba' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeEnabled({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Quitter le mode live' }).click();
    await expect(
      page.getByRole('group', { name: 'Modes du morceau' }).getByRole('button', { name: 'PDF' }),
    ).toHaveAttribute('aria-current', 'true');
  });

  test('a part hidden in MuseScore, and a staff without any note, are not offered (#35)', async ({
    page,
  }) => {
    await withScore(page, 'hiddenPart');
    await openLive(page);
    await page.getByRole('button', { name: 'Changer de partition : Trompette' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('button', { name: 'Souba' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Cornet|Clairon/ })).toHaveCount(0);
  });

  test('a repeat is followed: the measures come again, and the score with them', async ({
    page,
  }) => {
    // The first two measures are played twice: 1 2 1 2 3 4.
    await withScore(page, 'repeat');
    // Fast, so that the test is short: a measure lasts one second.
    sql("UPDATE song SET bpm = 240 WHERE name = 'Hey Ya'");
    await page.reload();
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    // The tempo of the band comes before the one written in the score (120).
    await expect(page.locator('[data-tile="tempo"]')).toContainText('240');

    const seen: string[] = [];
    await page.getByRole('button', { name: 'Lire', exact: true }).click();
    const tile = page.locator('[data-tile="measure"] .textTitle');
    for (let look = 0; look < 80 && (await tile.count()) > 0; look++) {
      const now = await tile.textContent().catch(() => null);
      if (now && seen[seen.length - 1] !== now) seen.push(now);
      await page.waitForTimeout(100);
    }
    expect(seen).toEqual(['1', '2', '1', '2', '3', '4']);
  });

  test('driven by the MIDI player: the settings of the MIDI mode, then the score follows the player through the repeat (#10)', async ({
    page,
  }) => {
    // The first two measures are played twice: 1 2 1 2 3 4.
    await withScore(page, 'repeat');
    sql("UPDATE song SET bpm = 240 WHERE name = 'Hey Ya'");
    await page.reload();

    // A track cut in the MIDI mode is cut in the sheet of the Live mode: one state.
    await page
      .getByRole('group', { name: 'Modes du morceau' })
      .getByRole('button', { name: 'MIDI' })
      .click();
    await page.getByRole('button', { name: 'Couper Souba' }).click();
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeEnabled({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Lire avec le MIDI' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lire avec le MIDI' });
    await expect(
      sheet.getByText('La partition suit le lecteur, reprises et codas comprises.'),
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Couper Souba', pressed: true })).toBeVisible();
    // The tempo of the band, shared with the MIDI mode; the loop is not offered.
    await expect(sheet.getByLabel('240 battements par minute')).toBeVisible();
    await expect(sheet.getByText('En boucle')).toHaveCount(0);

    const seen: string[] = [];
    await sheet.getByRole('button', { name: 'Lire avec le MIDI' }).click();
    await expect(sheet).toBeHidden();
    const chip = page.getByRole('button', { name: 'Suit le MIDI · 240 · 1 piste' });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    const tile = page.locator('[data-tile="measure"] .textTitle');
    for (let look = 0; look < 120 && (await tile.count()) > 0; look++) {
      const now = await tile.textContent().catch(() => null);
      if (now && seen[seen.length - 1] !== now) seen.push(now);
      await page.waitForTimeout(100);
    }
    expect(seen).toEqual(['1', '2', '1', '2', '3', '4']);
    // The end of the song: ready again.
    await expect(page.getByRole('button', { name: /On démarre à/ })).toBeVisible();

    // The chip pauses the player and opens the sheet again.
    await page.getByRole('button', { name: 'Lire avec le MIDI' }).click();
    await sheet.getByRole('button', { name: 'Lire avec le MIDI' }).click();
    await page.getByRole('button', { name: /Suit le MIDI/ }).click();
    await expect(sheet).toBeVisible();
  });

  test('a song without a MIDI file shows the piano button disabled, with the reason', async ({
    page,
  }) => {
    await withScore(page);
    sql("UPDATE song SET midiPath = NULL WHERE name = 'Hey Ya'");
    await page.reload();
    await openLive(page);
    const piano = page.getByRole('button', { name: 'Lire avec le MIDI' });
    await expect(piano).toBeDisabled();
    await expect(piano).toHaveAccessibleDescription('Pas de fichier MIDI pour ce morceau.');
    await expect(page.getByText('Pas de fichier MIDI pour ce morceau.')).toBeVisible();
  });

  test('the part shown first is the one of the member’s instrument, wherever it is in the score', async ({
    page,
  }) => {
    await withScore(page);
    // Zaza now plays the Souba: the second staff of the score, named "Tuba".
    sql(
      "UPDATE member SET instrumentId = (SELECT id FROM instrument WHERE name = 'Souba') WHERE nickname = 'Zaza'",
    );
    const song = sql("SELECT id FROM song WHERE name = 'Hey Ya'");
    await page.context().clearCookies();
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${song}`);
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Changer de partition : Souba' })).toBeVisible();
  });

  test('the page behind cannot be reached, Escape leaves, and the focus comes back to the mode bar', async ({
    page,
  }) => {
    await withScore(page);
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Quitter le mode live' })).toBeFocused();
    // The mode is a modal dialog: nothing of the song screen is offered behind it.
    await expect(page.getByRole('dialog', { name: 'Mode live : Hey Ya' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Modes du morceau' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('group', { name: 'Modes du morceau' }).getByRole('button', { name: 'MP3' }),
    ).toBeFocused();
    // The Live mode is never the mode a song opens in.
    await page.reload();
    await expect(page.getByRole('group', { name: 'Modes du morceau' })).toBeVisible();
  });

  test('the tempo is given by tapping one measure: the song starts on the next beat, at that tempo', async ({
    page,
  }) => {
    await withScore(page);
    await openLive(page);
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Donner le tempo' }).click();

    const zone = page.getByRole('button', { name: /Tape le tempo/ });
    await expect(page.getByText('Tape 4 fois, et ça part sur le 1 suivant.')).toBeVisible();
    // Four taps, half a second apart: 120 to the minute, give or take.
    for (let beat = 0; beat < 3; beat++) {
      await zone.click();
      await page.waitForTimeout(480);
    }
    await expect(page.getByText(/bpm pour l’instant\. Encore un temps/)).toBeVisible();
    await zone.click();

    await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeVisible();
    // The score is still there once the tempo is given.
    await expect(page.locator('.songs-liveSheet g.measure')).toHaveCount(4);
    const tempo = Number(await page.locator('[data-tile="tempo"] .textTitle').textContent());
    expect(tempo).toBeGreaterThan(95);
    expect(tempo).toBeLessThan(135);

    // Cancelling gives the tempo up and changes nothing.
    await page.getByRole('button', { name: 'Mettre en pause' }).click();
    await page.getByRole('button', { name: 'Donner le tempo' }).click();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('button', { name: 'Lire', exact: true })).toBeVisible();
  });
});

test.describe('Discord and the setlists (0.3.0)', () => {
  const sectionId = (name: string) => sql(`SELECT id FROM section WHERE name = '${name}'`);
  // Seven Nation with what the setlist generator reads, its channel, and the
  // Trompette section tagged by a role of the server of the band.
  function withSetlistDetails() {
    sql(
      `UPDATE song SET durationSeconds = 232, inRepertoireOn = '2015-01-01', mood = 'PARTY', copyright = 'Jack White' WHERE id = ${seven}`,
    );
    sql(
      `DELETE FROM songPosition WHERE songId = ${seven}; INSERT INTO songPosition (songId, position) VALUES (${seven}, 'END'), (${seven}, 'SECOND_HALF')`,
    );
    sql(
      `INSERT INTO songTiringSection (songId, sectionId) VALUES (${seven}, ${sectionId('Trompette')})`,
    );
    sql(
      `INSERT INTO songTrickySection (songId, sectionId) VALUES (${seven}, ${sectionId('Saxophone')})`,
    );
  }
  function withChannel() {
    emptyDiscord();
    discordServer();
    sql(`UPDATE band SET discordServerId = '${server}'`);
    sql(`UPDATE section SET discordRoleId = '${roles.trumpets}' WHERE name = 'Trompette'`);
    sql(`UPDATE song SET discordChannelId = '${channel}' WHERE id = ${seven}`);
  }

  test('“À propos” says the length, the year, the mood, the positions, the sections and the copyright (#47)', async ({
    page,
  }) => {
    withSetlistDetails();
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    const about = page.getByRole('region', { name: 'À propos' }).or(page.locator('.songs-facts'));
    await expect(about.getByText('Au répertoire depuis')).toBeVisible();
    await expect(about).toContainText('2015');
    await expect(about).toContainText('3:52');
    // Figma, Songs, section 15: in this order, the copyright last.
    await expect(about).toContainText(
      /Durée\s*3:52\s*Ambiance\s*Teuf\s*Positions\s*2e moitié, fin\s*Fatigant pour\s*Trompette\s*Ça tricote pour\s*Saxophone\s*Droits d’auteur\s*Jack White/,
    );
    // Crazy has only what every song has: its mood and its positions.
    await page.goto(`/songs/${sql("SELECT id FROM song WHERE name = 'Crazy'")}`);
    const crazy = page.locator('.songs-facts').or(page.getByRole('region', { name: 'À propos' }));
    await expect(crazy).toContainText(
      /Ambiance\s*Normal\s*Positions\s*1re moitié, milieu, 2e moitié/,
    );
    await expect(page.getByText('Durée', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Droits d’auteur', { exact: true })).toHaveCount(0);
  });

  test('the Discord card shows the messages that tag the app and the section of the member, without the tag of the app, then opens the channel (#45)', async ({
    page,
  }) => {
    withChannel();
    discordMessages(channel, [
      {
        id: '9003',
        author: 'Fanfan',
        day: '2026-10-01',
        content: `${tagApp} <@&${roles.trumpets}> mesures 36-37`,
        roles: [roles.trumpets],
        users: [botUser],
      },
      {
        id: '9002b',
        author: 'Lulu',
        day: '2026-09-30',
        // The section without the app: between members, not for the app.
        content: `<@&${roles.trumpets}> on boit un coup après ?`,
        roles: [roles.trumpets],
      },
      {
        id: '9002',
        author: 'Gégé',
        day: '2026-09-28',
        content: `${tagApp} <@&${roles.saxophones}> pour les saxos`,
        roles: [roles.saxophones],
        users: [botUser],
      },
    ]);
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);

    const card = page.locator('.DiscordChannelCard');
    await expect(card.getByRole('heading', { name: 'Discussion' })).toBeVisible();
    await expect(card).toContainText(
      'Les messages du salon Discord qui taguent l’app et @trompettiste.',
    );
    const message = card.getByRole('link', { name: /Fanfan/ });
    await expect(message).toContainText('@trompettiste mesures 36-37');
    await expect(message).not.toContainText('App Les Cuivres');
    await expect(card).not.toContainText('on boit un coup');
    await expect(message).toHaveAttribute(
      'href',
      `https://discord.com/channels/${server}/${channel}/9003`,
    );
    await expect(card).not.toContainText('pour les saxos');
    await expect(card.getByRole('link', { name: 'Ouvrir dans Discord' })).toHaveAttribute(
      'href',
      `https://discord.com/channels/${server}/${channel}`,
    );
  });

  test('nothing that tags the section, or a Discord that does not answer: the button only, no error', async ({
    page,
  }) => {
    withChannel();
    discordMessages(channel, []);
    await asMember(page, 'Zaza');
    await page.goto(`/songs/${seven}`);
    const card = page.locator('.DiscordChannelCard');
    await expect(card).toContainText(
      'Personne n’a encore tagué l’app et @trompettiste dans le salon de ce morceau.',
    );
    await expect(card.getByRole('link', { name: 'Ouvrir dans Discord' })).toBeVisible();

    emptyDiscord();
    discordAnswers(`/guilds/${server}/roles`, { message: 'Missing Access' }, 403);
    await page.reload();
    await expect(card).toContainText('Rien à afficher, consulte le salon Discord');
    await expect(card.getByRole('link', { name: /Fanfan|Gégé/ })).toHaveCount(0);

    // No channel: no card.
    sql(`UPDATE song SET discordChannelId = NULL`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seven Nation', level: 1 })).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('who manages songs fills “Pour les setlists” and the link of the channel; a wrong length or link is said', async ({
    page,
  }) => {
    sql(`UPDATE band SET discordServerId = '${server}'`);
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}/edit`);
    await expect(page.getByRole('heading', { name: 'Pour les setlists' })).toBeVisible();

    await page.getByLabel('Droits d’auteur').fill('Jack White');
    await page.getByLabel('Durée').fill('352');
    await page
      .getByRole('group', { name: 'Ambiance' })
      .getByRole('radio', { name: 'Teuf' })
      .check();
    // A new song can go in the three middle zones; this one closes.
    const positions = page.getByRole('group', { name: 'Positions possibles' });
    for (const zone of ['1re moitié', 'Milieu', '2e moitié']) {
      await expect(positions.getByRole('checkbox', { name: zone })).toBeChecked();
    }
    for (const zone of ['1re moitié', 'Milieu', '2e moitié']) {
      await positions.getByRole('checkbox', { name: zone }).uncheck();
    }
    await page
      .getByRole('group', { name: 'Fatigant pour' })
      .getByRole('button', { name: 'Trompette' })
      .click();
    await page
      .getByLabel('Lien du salon Discord')
      .fill(`https://discord.com/channels/1000999999999999999/${channel}`);
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(
      page.getByText('Une durée en minutes et secondes, de 0:10 à 20:00, comme 3:52.'),
    ).toBeVisible();

    await page.getByLabel('Durée').fill('3:52');
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    // No position left: said on the group.
    await expect(positions.getByText('Coche au moins une position.')).toBeVisible();
    await positions.getByRole('checkbox', { name: 'Fin' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(
      page.getByText('Ce salon est sur un autre serveur Discord que celui de la fanfare.'),
    ).toBeVisible();
    await page
      .getByLabel('Lien du salon Discord')
      .fill(`https://discord.com/channels/${server}/${channel}`);
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page).toHaveURL(`/songs/${seven}`);
    expect(
      sql(
        `SELECT durationSeconds, mood, copyright, discordChannelId FROM song WHERE id = ${seven}`,
      ),
    ).toBe(`232\tPARTY\tJack White\t${channel}`);
    expect(sql(`SELECT GROUP_CONCAT(position) FROM songPosition WHERE songId = ${seven}`)).toBe(
      'END',
    );
    expect(sql(`SELECT sectionId FROM songTiringSection WHERE songId = ${seven}`)).toBe(
      sectionId('Trompette'),
    );
  });

  test('without a Discord server, the card is “Clip” and says nothing of Discord; with one, “Clip et Discord” (#49)', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}/edit`);
    await expect(page.getByRole('heading', { name: 'Pour les setlists' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clip', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clip et Discord' })).toHaveCount(0);
    await expect(page.getByLabel('Clip YouTube')).toBeVisible();
    await expect(page.getByLabel('Lien du salon Discord')).toHaveCount(0);
    await expect(page.getByText('Discord')).toHaveCount(0);

    sql(`UPDATE band SET discordServerId = '${server}'`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Clip et Discord' })).toBeVisible();
    await expect(page.getByLabel('Lien du salon Discord')).toBeVisible();
  });

  test('the import proposes the length read from the MIDI file the MuseScore file gives', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    // Four measures at 120, the first two played twice: six measures, 12 seconds.
    await page.locator('input[type=file]').setInputFiles([
      {
        name: 'Hey Ya.mscz',
        mimeType: 'application/octet-stream',
        buffer: readableScore('repeat'),
      },
    ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByLabel('Durée')).toHaveValue('0:12', { timeout: 30_000 });
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    expect(sql("SELECT durationSeconds FROM song WHERE name = 'Hey Ya'")).toBe('12');
  });
});

test.describe('who manages songs', () => {
  test('changes the status from the song: it changes at once', async ({ page }) => {
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}`);
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('button', { name: /Changer le statut/ }).click();

    const panel = page.getByRole('dialog', { name: 'Statut' });
    await expect(panel.getByRole('radio')).toHaveCount(5);
    await expect(panel.getByRole('radio', { name: /Au répertoire/ })).toBeChecked();
    await expect(panel.getByText('Appris pour une occasion, pas fait pour rester')).toBeVisible();
    await panel.getByRole('radio', { name: /Temporaire/ }).click({ force: true });

    await expect(panel.getByRole('radio', { name: /Temporaire/ })).toBeChecked();
    await expect.poll(() => sql(`SELECT status FROM song WHERE id = ${seven}`)).toBe('TEMPORARY');
  });

  test('imports a song in two steps: the files are placed, a question is asked, then the record is saved with them', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

    await expect(page.getByText('Étape 1 sur 2 · les fichiers')).toBeVisible();
    const next = page.getByRole('button', { name: 'Continuer' });
    await expect(next).toBeDisabled();
    await expect(page.getByText('Dépose les fichiers pour continuer.')).toBeVisible();

    await page.locator('input[type=file]').setInputFiles([
      { name: 'freed-cover.png', mimeType: 'image/png', buffer: cover },
      {
        name: 'Freed from Desire.mscz',
        mimeType: 'application/octet-stream',
        buffer: readableScore(),
      },
      { name: 'Freed_sxt.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      { name: 'Freed_tutti B.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      {
        name: 'notes-de-repete.docx',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('x'),
      },
    ]);

    await expect(page.getByText('3 fichiers rangés')).toBeVisible();
    await expect(page.getByText('1 question', { exact: true })).toBeVisible();
    await expect(page.getByText('1 fichier ignoré')).toBeVisible();
    await expect(
      page.getByText('Ignoré : notes-de-repete.docx n’est pas un fichier de morceau.'),
    ).toBeVisible();
    await expect(page.getByText('freed-cover.png · recadrée en carré')).toBeVisible();
    // The alias "sxt" names the Sax Ténor.
    await expect(page.getByText('Freed_sxt.pdf')).toBeVisible();

    // Continue stays off until the question is answered.
    await expect(page.getByText('Pour quel instrument est « Freed_tutti B.pdf » ?')).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(page.getByText('Réponds à la question pour continuer.')).toBeVisible();
    await page.getByLabel('Instrument de Freed_tutti B.pdf').selectOption({ label: 'Souba' });
    await expect(page.getByRole('heading', { name: 'Rangés · 4 fichiers' })).toBeVisible();

    // A second file for the same place asks nothing: the last one wins.
    await page
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'Freed_souba_v2.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      ]);
    await expect(page.getByRole('heading', { name: 'Rangés · 4 fichiers' })).toBeVisible();
    await expect(page.getByText('Freed_souba_v2.pdf')).toBeVisible();
    await expect(page.getByText('Freed_tutti B.pdf')).toHaveCount(0);
    expect(sql('SELECT COUNT(*) FROM song')).toBe('5');

    await next.click();
    await expect(page.getByText('Étape 2 sur 2 · la fiche')).toBeVisible();
    await expect(page.getByText('4 fichiers rangés, 1 ignoré.')).toBeVisible();
    // The name comes from the MuseScore file; the status of a new song is "Proposé".
    await expect(page.getByLabel('Nom interne')).toHaveValue('Freed from Desire');
    await expect(page.getByLabel('Statut')).toHaveValue('PROPOSED');

    // Going back keeps what was done.
    // On a phone the way back is the button at the top: it leads to the first step, not out of the import.
    await page.locator('.AppLayout-backButton').getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByRole('heading', { name: 'Rangés · 4 fichiers' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // A record with a fault is not sent, and nothing is saved.
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByText('2 champs sont à corriger.')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM song')).toBe('5');

    await page.getByLabel('Titre original').fill('Freed from Desire');
    await page.getByLabel('Interprète original').fill('Gala');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();

    await expect(page.getByRole('heading', { name: 'Freed from Desire', level: 1 })).toBeVisible();
    const songId = sql("SELECT id FROM song WHERE name = 'Freed from Desire'");
    await expect(page).toHaveURL(`/songs/${songId}`);
    expect(
      sql(
        `SELECT status, coverPath IS NOT NULL, museScorePath IS NOT NULL FROM song WHERE id = ${songId}`,
      ),
    ).toBe('PROPOSED\t1\t1');
    // The MuseScore file gave the MIDI file and the score as MusicXML.
    expect(
      sql(
        `SELECT midiPath LIKE '%song.mid', musicXmlPath LIKE '%score.mxl' FROM song WHERE id = ${songId}`,
      ),
    ).toBe('1\t1');
    expect(
      sql(
        `SELECT i.name FROM songPart p JOIN instrument i ON i.id = p.instrumentId WHERE p.songId = ${songId} ORDER BY i.name`,
      ),
    ).toBe('Sax Ténor\nSouba');
  });

  test('a MuseScore file the app cannot read is kept, and the import says what is missing', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'Hey Ya.mscz', mimeType: 'application/octet-stream', buffer: museScore },
      ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();

    await expect(page.getByText(/l’app n’a pas réussi à le lire/)).toBeVisible({ timeout: 30_000 });
    expect(
      sql(
        "SELECT museScorePath IS NOT NULL, midiPath IS NULL, musicXmlPath IS NULL FROM song WHERE name = 'Hey Ya'",
      ),
    ).toBe('1\t1\t1');
    await page.getByRole('button', { name: 'Voir le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible();
  });

  test('a MIDI file dropped by hand counts only when the MuseScore file gives none', async ({
    page,
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    await asMember(page, 'Sisi');
    const drop = async (name: string, score: Buffer) => {
      await page.goto('/songs/new');
      await page.locator('input[type=file]').setInputFiles([
        { name: `${name}.mscz`, mimeType: 'application/octet-stream', buffer: score },
        { name: `${name}.mid`, mimeType: 'audio/midi', buffer: midi },
      ]);
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByLabel('Titre original').fill(name);
      await page.getByLabel('Interprète original').fill('OutKast');
      await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 30_000 });
      const id = sql(`SELECT id FROM song WHERE name = '${name}'`);
      return (await (await sisi.get(`/api/songs/${id}`)).json()) as {
        midi: { size: number } | null;
        musicXml: object | null;
      };
    };

    // A score the app reads: its own MIDI file is kept, not the one dropped.
    const read = await drop('Hey Ya', readableScore());
    expect(read.midi?.size).toBeGreaterThan(midi.length);
    expect(read.musicXml).not.toBeNull();

    // A score it cannot read: the MIDI file dropped by hand is the one of the
    // song, and the import says the reading mode has nothing.
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      { name: 'Roses.mscz', mimeType: 'application/octet-stream', buffer: museScore },
      { name: 'Roses.mid', mimeType: 'audio/midi', buffer: midi },
    ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Roses');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByText(/l’app n’a pas réussi à le lire/)).toBeVisible({ timeout: 30_000 });
    expect(
      sql("SELECT midiPath IS NOT NULL, musicXmlPath IS NULL FROM song WHERE name = 'Roses'"),
    ).toBe('1\t1');
    await sisi.dispose();
  });

  test('a new MuseScore file the app cannot read takes away the MIDI file of the one it replaces', async ({
    page,
  }) => {
    // The song of the tests holds a MIDI file.
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}/edit`);
    await page
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'Seven v2.mscz', mimeType: 'application/octet-stream', buffer: museScore },
      ]);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

    await expect(page.getByText(/l’app n’a pas réussi à le lire/)).toBeVisible({ timeout: 30_000 });
    expect(
      sql(`SELECT museScorePath IS NOT NULL, midiPath IS NULL FROM song WHERE id = ${seven}`),
    ).toBe('1\t1');
  });

  test('a name that cannot be remembered is said, and the song is saved all the same', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      // Once the name of the song is taken out, "tp" is left: the trumpet has it.
      { name: 'Hey Ya tp.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
    ]);
    // Placed by its name: corrected by hand to another instrument.
    await page.getByRole('button', { name: 'Corriger où va Hey Ya tp.pdf' }).click();
    await page.getByLabel('Instrument de Hey Ya tp.pdf').selectOption({ label: 'Souba' });
    await page.getByRole('checkbox', { name: 'Retenir ce nom pour la prochaine fois' }).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Nom interne').fill('Hey Ya');
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();

    await expect(
      page.getByText('Le nom de « Hey Ya tp.pdf » n’a pas été retenu.', { exact: false }),
    ).toBeVisible();
    expect(sql("SELECT COUNT(*) FROM instrumentAlias WHERE alias = 'tp'")).toBe('1');
    expect(
      sql("SELECT COUNT(*) FROM songPart p JOIN song s ON s.id = p.songId WHERE s.name = 'Hey Ya'"),
    ).toBe('1');
  });

  test('an instrument chosen by hand can be remembered: the words of the file become a known spelling', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page.locator('input[type=file]').setInputFiles([
      { name: 'Hey Ya tutti B.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      { name: 'Hey Ya grave.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
    ]);
    await page.getByLabel('Instrument de Hey Ya tutti B.pdf').selectOption({ label: 'Souba' });
    await page.getByLabel('Instrument de Hey Ya grave.pdf').selectOption({ label: 'Sax Ténor' });

    // Off unless ticked; a file placed by its name is not offered the box.
    const boxes = page.getByRole('checkbox', { name: /Retenir ce nom pour la prochaine fois/ });
    await expect(boxes).toHaveCount(2);
    await expect(boxes.first()).not.toBeChecked();
    await boxes.first().check();

    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Nom interne').fill('Hey Ya');
    await page.getByLabel('Titre original').fill('Hey Ya!');
    await page.getByLabel('Interprète original').fill('OutKast');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();
    await expect(page.getByRole('heading', { name: 'Hey Ya', level: 1 })).toBeVisible();

    // The words of the name of the song are left out; the box left empty adds nothing.
    expect(
      sql(
        "SELECT i.name, a.alias FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId WHERE a.alias IN ('tutti b', 'grave', 'hey ya tutti b')",
      ),
    ).toBe('Souba\ttutti b');
  });

  test('a name already taken is said under its field, and the files are not sent', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto('/songs/new');
    await page
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'Crazy.mscz', mimeType: 'application/octet-stream', buffer: museScore },
      ]);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre original').fill('Crazy in Love');
    await page.getByLabel('Interprète original').fill('Beyoncé');
    await page.getByRole('button', { name: 'Enregistrer le morceau' }).click();

    await expect(page.getByText('Un autre morceau porte déjà ce nom.')).toBeVisible();
    expect(sql('SELECT COUNT(*) FROM song')).toBe('5');
  });

  test('edits the record and replaces a file by dropping it: nothing changes before the form is saved', async ({
    page,
  }) => {
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}`);
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('link', { name: 'Modifier le morceau' }).click();

    await expect(page.getByRole('heading', { name: 'Modifier le morceau' })).toBeVisible();
    await expect(page.getByLabel('Nom interne')).toHaveValue('Seven Nation');
    await expect(page.getByText('5 fichiers en place, mis à jour le 14 sept.')).toBeVisible();
    const before = sql(
      `SELECT pdfPath FROM songPart WHERE songId = ${seven} ORDER BY instrumentId`,
    );

    await page.locator('input[type=file]').setInputFiles([
      { name: 'Seven_tp_v2.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      { name: 'Seven_souba.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
      { name: 'Seven_sxt_v2.pdf', mimeType: 'application/pdf', buffer: readablePdf() },
    ]);
    await expect(page.getByText('Seven_tp_v2.pdf · remplace le fichier en place')).toBeVisible();
    await expect(page.getByText('Seven_souba.pdf · nouveau')).toBeVisible();
    // Each file waiting can be withdrawn.
    await page.getByRole('button', { name: 'Retirer Seven_sxt_v2.pdf' }).click();
    await expect(page.getByText('Seven_sxt_v2.pdf')).toHaveCount(0);
    expect(sql(`SELECT pdfPath FROM songPart WHERE songId = ${seven} ORDER BY instrumentId`)).toBe(
      before,
    );

    await page.getByLabel('Nom interne').fill('Seven');
    await page.getByLabel('Tempo de la fanfare (bpm)').fill('');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page).toHaveURL(`/songs/${seven}`);
    await expect(page.getByRole('heading', { name: 'Seven', level: 1 })).toBeVisible();
    expect(sql(`SELECT name, bpm IS NULL FROM song WHERE id = ${seven}`)).toBe('Seven\t1');
    const after = sql(
      `SELECT pdfPath FROM songPart WHERE songId = ${seven} ORDER BY instrumentId`,
    ).split('\n');
    expect(after).toHaveLength(3);
    // The trumpet was replaced, the tenor sax was left alone.
    expect(after[0]).not.toBe(before.split('\n')[0]);
    expect(after).toContain(before.split('\n')[1]);
  });

  test('deleting a song asks first, and offers to abandon it instead', async ({ page }) => {
    await asMember(page, 'Sisi');
    await page.goto(`/songs/${seven}/edit`);
    await page.getByRole('button', { name: 'Supprimer le morceau' }).click();

    const panel = page.getByRole('dialog', { name: 'Supprimer Seven Nation ?' });
    await expect(panel.getByText('On ne pourra pas revenir en arrière.')).toBeVisible();
    await expect(panel.getByText('passe-le plutôt en « Abandonné »')).toBeVisible();
    expect(sql(`SELECT COUNT(*) FROM song WHERE id = ${seven}`)).toBe('1');

    await panel.getByRole('button', { name: 'Le passer en Abandonné' }).click();
    await expect(page).toHaveURL(`/songs/${seven}`);
    expect(sql(`SELECT status FROM song WHERE id = ${seven}`)).toBe('ABANDONED');

    await page.goto(`/songs/${seven}/edit`);
    await page.getByRole('button', { name: 'Supprimer le morceau' }).click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page).toHaveURL('/songs');
    expect(sql(`SELECT COUNT(*) FROM song WHERE id = ${seven}`)).toBe('0');
    expect(sql('SELECT COUNT(*) FROM songPart')).toBe('0');
  });

  test('a member is not offered to add a song, and the import sends them back to the list', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toHaveCount(0);

    await page.goto('/songs/new');
    await expect(page).toHaveURL('/songs');
    await page.goto('/songs/manage');
    await expect(page).toHaveURL('/songs');
  });
});

test.describe('on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('the list sits beside the song: the first one, then the one that is chosen', async ({
    page,
  }) => {
    await asMember(page, 'Zaza');
    await page.goto('/songs');

    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).filter({ hasText: 'Crazy' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.songs-pane').getByRole('heading', { name: 'Crazy' })).toBeVisible();

    await rows(page).filter({ hasText: 'Seven Nation' }).click();
    await expect(page).toHaveURL(`/songs/${seven}`);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).filter({ hasText: 'Seven Nation' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.locator('.songs-pane').getByText('Seven Nation Army')).toBeVisible();
    // A panel is a dialog from this width.
    await page.locator('.songs-pane').getByRole('button', { name: 'Plus d’actions' }).click();
    await expect(page.getByRole('dialog', { name: 'Seven Nation' })).toBeVisible();
  });

  test('who manages songs gets a table: parts, averages and version, sorted by a press on a column', async ({
    page,
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    await sisi.put(`/api/songs/${seven}/levels`, { data: { masteryLevel: 3, enjoymentLevel: 4 } });
    await sisi.dispose();

    await asMember(page, 'Sisi');
    await page.goto('/songs');
    await page.getByRole('button', { name: 'Gérer' }).click();
    await expect(page).toHaveURL('/songs/manage');

    const table = page.getByRole('table');
    const line = (name: string) => table.getByRole('row').filter({ hasText: name });
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(
      page.getByText('3 morceaux. Les moyennes viennent des fanfarons qui ont répondu.'),
    ).toBeVisible();
    // The band has four instruments, and the song two parts.
    await expect(line('Seven Nation')).toContainText('2 sur 4');
    await expect(line('Seven Nation')).toContainText('3,0 · 1 rép.');
    await expect(line('Seven Nation')).toContainText('14 sept.');
    await expect(line('Crazy')).toContainText('pas de réponse');
    await expect(line('Toxic')).toContainText('Montage en cours');

    await page.getByRole('button', { name: 'Proposés' }).click();
    await expect(page.getByText('4 morceaux, dont 1 proposés.')).toBeVisible();

    const header = table.getByRole('columnheader', { name: 'Maîtrise' });
    await expect(table.getByRole('columnheader', { name: 'Morceau' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    // The songs nobody answered for go last.
    await expect(table.getByRole('row').nth(1)).toContainText('Seven Nation');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    await line('Seven Nation').getByRole('link').first().click();
    await expect(page).toHaveURL(`/songs/${seven}/edit`);
  });
});
