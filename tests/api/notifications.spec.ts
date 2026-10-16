import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addGig, addSetlist, addSong, answerOf, day, organise } from '../support/gigs.ts';
import { emptyPushes, sentPushes, subscribe } from '../support/push.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';
import { museScore, pdf, sendFile, songRecord } from '../support/songFiles.ts';

// The notification settings of an account and the notifications of 0.2.0.
// Rules: model/members.md ("Notification settings"), model/gigs.md
// ("Notifications of a gig", entry 4 "Life cycle"), model/songs.md
// ("Notifications"). The test server writes the notifications to a file and
// sends none. The gigs and the songs are examples; nobody here is real.

// The band: Jibé the admin (Sax Ténor), Zaza, Riton and Lulu members
// (Trompette), Sissi who manages setlists, Sonia who manages songs, Dede who
// left. The Souba section has nobody: it blocks nothing.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyPushes();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  for (const nickname of ['Zaza', 'Riton', 'Lulu']) addMember({ nickname });
  addMember({ nickname: 'Sissi', roles: ['SETLIST_MANAGER'] });
  addMember({ nickname: 'Sonia', roles: ['SONG_MANAGER'] });
  addMember({ nickname: 'Dede', status: 'LEFT' });
});

// The made-up band of the tests (scenario.ts): the notifications start with its name.
const band = 'La Fanfare des Cuivres Déchaînés';
const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const settings = {
  notifyGigPlayable: 'PUSH',
  notifyGigConfirmed: 'PUSH',
  notifyLiveSetlist: 'PUSH',
  notifySongNew: 'PUSH',
  notifySongScore: 'PUSH',
  notifySongPart: 'PUSH',
};
/** "device: title", sorted: who received what. */
const received = () =>
  sentPushes()
    .map((push) => `${push.endpoint.split('/').pop()}: ${push.payload.title}`)
    .sort();
const turnOff = (nickname: string, setting: keyof typeof settings) =>
  sql(`UPDATE member SET ${setting} = 'OFF' WHERE id = ${memberId(nickname)}`);

test.describe('the settings of an account', () => {
  test('six settings, all on at first; the member changes them for every device', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const other = await deviceOf(playwright, email('Zaza'));

    expect(await (await zaza.get('/api/me/notifications')).json()).toEqual(settings);
    const changed = { ...settings, notifyGigPlayable: 'OFF', notifySongPart: 'OFF' };
    const saved = await zaza.put('/api/me/notifications', { data: changed });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual(changed);
    expect(await (await other.get('/api/me/notifications')).json()).toEqual(changed);
    expect(
      sql(`SELECT notifyGigPlayable, notifySongPart FROM member WHERE id = ${memberId('Zaza')}`),
    ).toBe('OFF\tOFF');
  });

  test('a value outside the list, a missing setting or another field is refused', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    for (const data of [
      { ...settings, notifyGigPlayable: 'EMAIL' },
      { ...settings, notifySongNew: undefined },
      { ...settings, colorScheme: 'DARK' },
    ]) {
      expect((await zaza.put('/api/me/notifications', { data })).status()).toBe(422);
    }
    expect(await (await zaza.get('/api/me/notifications')).json()).toEqual(settings);
  });

  test('seen and changed by the member only: the address names nobody, and /api/me holds none', async ({
    playwright,
    request,
  }) => {
    turnOff('Zaza', 'notifySongNew');
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    // The admin reads their own settings, never those of Zaza.
    expect((await (await jibe.get('/api/me/notifications')).json()).notifySongNew).toBe('PUSH');
    expect(
      JSON.stringify(await (await jibe.get(`/api/members/${memberId('Zaza')}`)).json()),
    ).not.toContain('notify');
    const zaza = await deviceOf(playwright, email('Zaza'));
    expect(JSON.stringify(await (await zaza.get('/api/me')).json())).not.toContain('notify');
    // Not signed in: nothing.
    expect((await request.get('/api/me/notifications')).status()).toBe(401);
    expect((await request.put('/api/me/notifications', { data: settings })).status()).toBe(401);
  });
});

test.describe('the live setlist', () => {
  test('the device that moved it is spared; another device of the same member is not; a member who turned it off gets nothing', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const sissiPhone = await deviceOf(playwright, email('Sissi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const riton = await deviceOf(playwright, email('Riton'));
    await subscribe(sissi, 'sissi');
    await subscribe(sissiPhone, 'sissiPhone');
    await subscribe(zaza, 'zaza');
    await subscribe(riton, 'riton');
    const { gigId, slotId } = addGig('Carnaval', { status: 'CONFIRMED', startsOn: day(0) });
    const setlist = addSetlist(gigId, slotId, [addSong('Toxic'), addSong('Valerie')]);
    for (const nickname of ['Sissi', 'Zaza', 'Riton']) answerOf(nickname, slotId, 'YES');
    turnOff('Riton', 'notifyLiveSetlist');

    await sissi.post(`/api/setlists/${setlist}/live`);
    expect(received()).toEqual([
      'sissiPhone: 1/2 · Prochain : Toxic',
      'zaza: 1/2 · Prochain : Toxic',
    ]);

    // “Suivant” from the phone: the phone is spared, the first device is told.
    emptyPushes();
    await sissiPhone.put(`/api/setlists/${setlist}/live`, { data: { position: 2 } });
    expect(received()).toEqual(['sissi: 2/2 · Dernier : Valerie', 'zaza: 2/2 · Dernier : Valerie']);
  });
});

test.describe('a gig that becomes playable or confirmed', () => {
  const answer = (
    device: Awaited<ReturnType<typeof deviceOf>>,
    gigId: number,
    slotId: number,
    value: string,
  ) => device.put(`/api/gigs/${gigId}/slots/${slotId}/answer`, { data: { answer: value } });

  test('playable: told to its organisers and to who said yes, maybe or if needed, never to the device that answered', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Fête des Lumières', {
      status: 'PROPOSED',
      startsOn: '2027-12-03',
    });
    const devices = {
      jibe: await deviceOf(playwright, admin.email, admin.password),
      zaza: await deviceOf(playwright, email('Zaza')),
      riton: await deviceOf(playwright, email('Riton')),
      lulu: await deviceOf(playwright, email('Lulu')),
      sissi: await deviceOf(playwright, email('Sissi')),
      sonia: await deviceOf(playwright, email('Sonia')),
    };
    for (const [name, device] of Object.entries(devices)) await subscribe(device, name);
    organise(gigId, 'Sissi');
    answerOf('Riton', slotId, 'IF_NEEDED');
    // Lulu said no, Sonia did not answer: not involved.
    answerOf('Lulu', slotId, 'NO');
    await answer(devices.zaza, gigId, slotId, 'YES');
    expect(sentPushes()).toEqual([]);

    // The saxophone was missing: Jibé's yes makes the gig playable.
    const playable = await answer(devices.jibe, gigId, slotId, 'YES');
    expect(await playable.json()).toMatchObject({ status: 'PROPOSED', isPlayable: true });
    expect(received()).toEqual([
      `riton: ${band} – Plan jouable`,
      `sissi: ${band} – Plan jouable`,
      `zaza: ${band} – Plan jouable`,
    ]);
    expect(sentPushes()[0]?.payload).toMatchObject({
      body: 'Fête des Lumières – ven. 3 déc. : chaque pupitre a un oui',
      url: `/gigs/${gigId}`,
    });

    // Already playable: nothing more.
    emptyPushes();
    await answer(devices.riton, gigId, slotId, 'YES');
    expect(sentPushes()).toEqual([]);

    // No longer playable, then playable again: told again. Riton turned it off.
    turnOff('Riton', 'notifyGigPlayable');
    await answer(devices.jibe, gigId, slotId, 'NO');
    await answer(devices.jibe, gigId, slotId, 'MAYBE');
    expect(sentPushes()).toEqual([]);
    await devices.sissi.put(`/api/gigs/${gigId}/slots/${slotId}/answers/${memberId('Jibé')}`, {
      data: { answer: 'YES' },
    });
    // Sissi answered for Jibé from her device: she is spared, Jibé is told.
    expect(received()).toEqual([`jibe: ${band} – Plan jouable`, `zaza: ${band} – Plan jouable`]);
  });

  test('confirmed by the app or by hand: “Plan validé” with the meeting time, and no “jouable” besides', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Vide-grenier', {
      status: 'ACCEPTED',
      startsOn: '2027-10-16',
      meetingTime: '09:30:00',
    });
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const zaza = await deviceOf(playwright, email('Zaza'));
    await subscribe(jibe, 'jibe');
    await subscribe(zaza, 'zaza');
    await answer(zaza, gigId, slotId, 'YES');

    expect(await (await answer(jibe, gigId, slotId, 'YES')).json()).toMatchObject({
      status: 'CONFIRMED',
    });
    expect(received()).toEqual([`zaza: ${band} – Plan validé`]);
    expect(sentPushes()[0]?.payload.body).toBe(
      'Vide-grenier – sam. 16 oct. – RDV 9\u00a0h\u00a030',
    );

    // Put back, then confirmed by hand: told again, the device that did it spared.
    emptyPushes();
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'PROPOSED' } });
    expect(sentPushes()).toEqual([]);
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'CONFIRMED' } });
    expect(received()).toEqual([`zaza: ${band} – Plan validé`]);

    // A member who turned it off is not told.
    emptyPushes();
    turnOff('Zaza', 'notifyGigConfirmed');
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'ACCEPTED' } });
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'CONFIRMED' } });
    expect(sentPushes()).toEqual([]);
  });

  test('a gig already over, or cancelled, is never notified', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Carnaval', { status: 'ACCEPTED', startsOn: day(5) });
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const zaza = await deviceOf(playwright, email('Zaza'));
    await subscribe(zaza, 'zaza');
    answerOf('Zaza', slotId, 'YES');
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'CANCELLED' } });
    await jibe.put(`/api/gigs/${gigId}/status`, { data: { status: 'DRAFT' } });
    expect(sentPushes()).toEqual([]);
  });
});

test.describe('songs', () => {
  test('a song created is told to every current member, whatever its status, but not to the device that created it', async ({
    playwright,
  }) => {
    const sonia = await deviceOf(playwright, email('Sonia'));
    const soniaPhone = await deviceOf(playwright, email('Sonia'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const riton = await deviceOf(playwright, email('Riton'));
    for (const [name, device] of Object.entries({ sonia, soniaPhone, zaza, riton }))
      await subscribe(device, name);
    turnOff('Riton', 'notifySongNew');

    const created = await sonia.post('/api/songs', {
      data: songRecord({ name: 'Rasputin', originalArtist: 'Boney M.', status: 'PROPOSED' }),
    });
    expect(created.status()).toBe(201);
    expect(received()).toEqual([
      `soniaPhone: ${band} – Nouveau morceau`,
      `zaza: ${band} – Nouveau morceau`,
    ]);
    const songId = (await created.json()).id;
    expect(sentPushes()[0]?.payload).toMatchObject({
      body: 'Rasputin – Boney M.',
      url: `/songs/${songId}`,
    });

    // Saving it again is not news.
    emptyPushes();
    await sonia.put(`/api/songs/${songId}`, {
      data: songRecord({ name: 'Rasputin', originalArtist: 'Boney M.' }),
    });
    expect(sentPushes()).toEqual([]);
  });

  test('the files of a new song notify nothing: the import sends them one by one', async ({
    playwright,
  }) => {
    const sonia = await deviceOf(playwright, email('Sonia'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    await subscribe(zaza, 'zaza');
    const songId = (
      await (await sonia.post('/api/songs', { data: songRecord({ name: 'Rasputin' }) })).json()
    ).id;
    emptyPushes();

    const trumpet = Number(sql("SELECT id FROM instrument WHERE name = 'Trompette'"));
    await sendFile(sonia, `/api/songs/${songId}/museScore`, museScore);
    await sendFile(sonia, `/api/songs/${songId}/museScore`, museScore);
    await sendFile(sonia, `/api/songs/${songId}/parts/${trumpet}`, pdf);
    expect(sentPushes()).toEqual([]);
  });

  test('later, a MuseScore that replaces another is told to all; a part only to who plays its instrument', async ({
    playwright,
  }) => {
    const sonia = await deviceOf(playwright, email('Sonia'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const riton = await deviceOf(playwright, email('Riton'));
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    for (const [name, device] of Object.entries({ zaza, riton, jibe }))
      await subscribe(device, name);
    const songId = addSong('Rasputin');
    const trumpet = Number(sql("SELECT id FROM instrument WHERE name = 'Trompette'"));

    // A first MuseScore file on an existing song replaces nothing.
    await sendFile(sonia, `/api/songs/${songId}/museScore`, museScore);
    expect(sentPushes()).toEqual([]);
    // Replaced, an hour or more after the song was created.
    sql(`UPDATE song SET createdAt = UTC_TIMESTAMP() - INTERVAL 2 HOUR WHERE id = ${songId}`);
    await sendFile(sonia, `/api/songs/${songId}/museScore`, museScore);
    expect(received()).toEqual([
      `jibe: ${band} – Nouveau MuseScore`,
      `riton: ${band} – Nouveau MuseScore`,
      `zaza: ${band} – Nouveau MuseScore`,
    ]);
    expect(sentPushes()[0]?.payload.body).toBe('Rasputin : la partition a changé');

    // A part for the trumpets: Zaza and Riton, not Jibé who plays the sax.
    emptyPushes();
    turnOff('Riton', 'notifySongPart');
    await sendFile(sonia, `/api/songs/${songId}/parts/${trumpet}`, pdf);
    expect(received()).toEqual([`zaza: ${band} – Nouvelle partition pour toi`]);
    expect(sentPushes()[0]?.payload.body).toBe('Rasputin – Trompette');

    // Removing a part is not news.
    emptyPushes();
    await sonia.delete(`/api/songs/${songId}/parts/${trumpet}`);
    expect(sentPushes()).toEqual([]);
  });

  test('a member who left is never told', async ({ playwright }) => {
    const sonia = await deviceOf(playwright, email('Sonia'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    await subscribe(zaza, 'zaza');
    sql(`UPDATE member SET status = 'LEFT' WHERE id = ${memberId('Zaza')}`);
    await sonia.post('/api/songs', { data: songRecord({ name: 'Rasputin' }) });
    expect(sentPushes()).toEqual([]);
  });
});
