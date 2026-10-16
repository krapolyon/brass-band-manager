import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addGig, addSetlist, addSong, answerOf, day, organise } from '../support/gigs.ts';
import { emptyPushes, endpointOf, runReminders, sentPushes, subscribe } from '../support/push.ts';
import { addMember, deviceOf, install, memberId } from '../support/scenario.ts';

// Push notifications: the devices that accept them, the live setlist, the
// reminders of gigs. Rules: model/members.md (`pushSubscription`),
// model/gigs.md ("Reminder", "Automatic reminders", entry 4 "Life cycle").
// The test server writes the notifications to a file and sends none. The
// devices, the gigs and the songs are examples; nobody here is real.

// The band: Jibé the admin, Zaza and Riton members, Sissi who manages
// setlists, Gigi who manages gigs, Dede a power member.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyPushes();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Riton' });
  addMember({ nickname: 'Sissi', roles: ['SETLIST_MANAGER'] });
  addMember({ nickname: 'Gigi', roles: ['GIG_MANAGER'] });
  addMember({ nickname: 'Dede' });
  sql(`UPDATE member SET status = 'POWER_MEMBER' WHERE id = ${memberId('Dede')}`);
});

const email = (nickname: string) =>
  `${nickname
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')}@example.org`;
const titles = () =>
  sentPushes().map((push) => `${push.endpoint.split('/').pop()}: ${push.payload.title}`);

test.describe('a device and its notifications', () => {
  test('a member turns them on and off for the device they use; what the browser gave never comes back', async ({
    playwright,
  }) => {
    const phone = await deviceOf(playwright, email('Zaza'));
    const tablet = await deviceOf(playwright, email('Zaza'));

    const before = await phone.get('/api/push');
    expect(await before.json()).toEqual({ publicKey: expect.any(String), isSubscribed: false });

    const on = await subscribe(phone, 'zaza-phone');
    expect(on.status()).toBe(200);
    expect(await on.json()).toEqual({ publicKey: expect.any(String), isSubscribed: true });
    expect(JSON.stringify(await on.json())).not.toContain('zaza-phone');
    // Device by device: the tablet is not subscribed.
    expect((await (await tablet.get('/api/push')).json()).isSubscribed).toBe(false);
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('1');

    // Given again, by this session or by another one of the same browser: one row.
    await subscribe(phone, 'zaza-phone');
    await subscribe(tablet, 'zaza-phone');
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('1');
    expect((await (await phone.get('/api/push')).json()).isSubscribed).toBe(false);

    const off = await tablet.delete('/api/push/subscription');
    expect((await off.json()).isSubscribed).toBe(false);
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('0');
  });

  test('signing a device out ends its notifications', async ({ playwright }) => {
    const phone = await deviceOf(playwright, email('Zaza'));
    await subscribe(phone, 'zaza-phone');
    await phone.delete('/api/session');
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('0');
  });

  test('only an address of a push service of a browser is kept', async ({
    playwright,
    request,
  }) => {
    const phone = await deviceOf(playwright, email('Zaza'));
    const keys = {
      p256dhKey:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      authKey: 'tBHItJI5svbpez7KI4CCXg',
    };
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://example.org/push/x',
      'https://fcm.googleapis.com.example.org/x',
      'https://localhost/api/members',
      'not an address',
    ]) {
      const refused = await phone.put('/api/push/subscription', { data: { endpoint, ...keys } });
      expect(refused.status(), endpoint).toBe(422);
    }
    const badKey = await phone.put('/api/push/subscription', {
      data: { endpoint: endpointOf('x'), p256dhKey: 'a b', authKey: keys.authKey },
    });
    expect(badKey.status()).toBe(422);
    expect((await phone.put('/api/push/subscription', { data: {} })).status()).toBe(422);
    expect(sql('SELECT COUNT(*) FROM pushSubscription')).toBe('0');

    // Nobody signed out reads or changes anything.
    expect((await request.get('/api/push')).status()).toBe(401);
    expect((await request.put('/api/push/subscription', { data: {} })).status()).toBe(401);
  });
});

test.describe('the live setlist', () => {
  test('each change tells the members who said yes to the slot: the song, the two after, the last, the end', async ({
    playwright,
  }) => {
    // Sissi moves the setlist from her tablet, and follows it on her phone:
    // the device that pressed is spared (Gigs v1.6).
    const tablet = await deviceOf(playwright, email('Sissi'));
    const sissi = await deviceOf(playwright, email('Sissi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const riton = await deviceOf(playwright, email('Riton'));
    await subscribe(sissi, 'sissi');
    await subscribe(zaza, 'zaza');
    await subscribe(riton, 'riton');
    const { gigId, slotId } = addGig('Carnaval', { status: 'CONFIRMED', startsOn: day(0) });
    const songs = ['Get Lucky', 'Hey Ya', 'Toxic', 'Valerie'].map((name) => addSong(name));
    const setlist = addSetlist(gigId, slotId, songs);
    answerOf('Sissi', slotId, 'YES');
    answerOf('Zaza', slotId, 'YES');
    // Riton said maybe: he follows nothing.
    answerOf('Riton', slotId, 'MAYBE');

    await tablet.post(`/api/setlists/${setlist}/live`);
    let sent = sentPushes();
    expect(sent.map((push) => push.endpoint).sort()).toEqual([
      endpointOf('sissi'),
      endpointOf('zaza'),
    ]);
    const toZaza = sent.find((push) => push.endpoint === endpointOf('zaza'));
    expect(toZaza?.payload).toMatchObject({
      title: '1/4 · Prochain\u00a0: Get Lucky',
      body: 'Puis\u00a0: Hey Ya · Toxic',
      tag: 'liveSetlist',
      url: `/setlists/${setlist}/live`,
    });
    // “Suivant” is offered to who manages setlists only.
    expect(toZaza?.payload.actions).toBeUndefined();
    const toSissi = sent.find((push) => push.endpoint === endpointOf('sissi'));
    expect(toSissi?.payload.actions).toEqual([{ action: 'next', title: 'Suivant' }]);
    expect(toSissi?.payload.data).toEqual({ setlistId: setlist, position: 1 });
    expect(toSissi?.options).toMatchObject({ TTL: 600, topic: 'liveSetlist' });

    // Pressed twice, or moved to where it is: nothing new is sent.
    emptyPushes();
    await tablet.post(`/api/setlists/${setlist}/live`);
    await tablet.put(`/api/setlists/${setlist}/live`, { data: { position: 1 } });
    expect(sentPushes()).toEqual([]);

    await tablet.put(`/api/setlists/${setlist}/live`, { data: { position: 3 } });
    sent = sentPushes().filter((push) => push.endpoint === endpointOf('zaza'));
    expect(sent[0]?.payload).toMatchObject({
      title: '3/4 · Prochain\u00a0: Toxic',
      body: 'Puis\u00a0: Valerie',
    });

    emptyPushes();
    await tablet.put(`/api/setlists/${setlist}/live`, { data: { position: 4 } });
    sent = sentPushes();
    expect(sent.every((push) => push.payload.title === '4/4 · Dernier\u00a0: Valerie')).toBe(true);
    expect(
      sent.every((push) => push.payload.body === '' && push.payload.actions === undefined),
    ).toBe(true);

    emptyPushes();
    await tablet.delete(`/api/setlists/${setlist}/live`);
    expect(titles().sort()).toEqual(['sissi: Setlist terminée', 'zaza: Setlist terminée']);
    // Ended twice: said once.
    emptyPushes();
    await tablet.delete(`/api/setlists/${setlist}/live`);
    expect(sentPushes()).toEqual([]);
  });

  test('a device the push service says is gone is forgotten', async ({ playwright }) => {
    const tablet = await deviceOf(playwright, email('Sissi'));
    const sissi = await deviceOf(playwright, email('Sissi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    await subscribe(sissi, 'sissi');
    await subscribe(zaza, 'gone/zaza');
    const { gigId, slotId } = addGig('Carnaval', { status: 'CONFIRMED', startsOn: day(0) });
    const setlist = addSetlist(gigId, slotId, [addSong('Toxic')]);
    answerOf('Sissi', slotId, 'YES');
    answerOf('Zaza', slotId, 'YES');

    await tablet.post(`/api/setlists/${setlist}/live`);
    await expect.poll(() => sql('SELECT COUNT(*) FROM pushSubscription')).toBe('1');
    expect(titles()).toEqual(['sissi: 1/1 · Dernier\u00a0: Toxic']);
  });
});

test.describe('“Relancer”', () => {
  test('who may edit the gig reminds at once the active members without an answer; the gig keeps when', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    for (const nickname of ['Zaza', 'Riton', 'Dede', 'Gigi']) {
      await subscribe(
        await deviceOf(playwright, email(nickname)),
        email(nickname).split('@')[0] ?? '',
      );
    }
    const { gigId, slotIds } = addGig('Anniversaire de Margaux', {
      status: 'PROPOSED',
      startsOn: '2026-10-24',
      meetingTime: '17:30',
      slots: ['Après-midi', 'Soir'],
    });
    sql(`UPDATE gig SET startsOn = '${day(10)}' WHERE id = ${gigId}`);
    // Zaza answered one slot of two: still waited for. Riton answered both.
    answerOf('Zaza', slotIds[0] as number, 'YES');
    answerOf('Riton', slotIds[0] as number, 'NO');
    answerOf('Riton', slotIds[1] as number, 'YES');

    const reminded = await gigi.post(`/api/gigs/${gigId}/reminder`);
    expect(reminded.status()).toBe(200);
    expect((await reminded.json()).remindedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

    // Neither Riton, who answered, nor Dede, a power member; the admin has no device.
    const sent = sentPushes();
    expect(sent.map((push) => push.endpoint.split('/').pop()).sort()).toEqual(['gigi', 'zaza']);
    expect(sent[0]?.payload.title).toBe(
      'La Fanfare Exemple – Présence manquante'.replace(
        'La Fanfare Exemple',
        sql('SELECT name FROM band'),
      ),
    );
    expect(sent[0]?.payload.body).toMatch(
      /^Anniversaire de Margaux – (lun|mar|mer|jeu|ven|sam|dim)\. \d{1,2} \S+ – 17\u00a0h\u00a030$/,
    );
    expect(sent[0]?.payload).toMatchObject({ tag: 'gigReminder', url: `/gigs/${gigId}` });
    expect(sent[0]?.options.TTL).toBe(86400);
    // It does not say who sent it.
    expect(JSON.stringify(sent)).not.toContain('Gigi');
  });

  test('an organiser reminds for their gig; a member and who manages setlists do not', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const riton = await deviceOf(playwright, email('Riton'));
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId } = addGig('Fête de la soupe', { status: 'ACCEPTED', startsOn: day(10) });
    const other = addGig('Marché de Noël', { status: 'ACCEPTED', startsOn: day(20) }).gigId;
    organise(gigId, 'Zaza');

    expect((await riton.post(`/api/gigs/${gigId}/reminder`)).status()).toBe(403);
    expect((await sissi.post(`/api/gigs/${gigId}/reminder`)).status()).toBe(403);
    expect((await zaza.post(`/api/gigs/${other}/reminder`)).status()).toBe(403);
    expect(sql('SELECT COUNT(*) FROM gig WHERE remindedAt IS NOT NULL')).toBe('0');
    expect((await zaza.post(`/api/gigs/${gigId}/reminder`)).status()).toBe(200);
    expect(sql('SELECT COUNT(*) FROM gig WHERE remindedAt IS NOT NULL')).toBe('1');
  });

  test('offered on a gig proposed, accepted or confirmed that is not past', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const refusedFor = async (gig: Parameters<typeof addGig>[1]) => {
      const { gigId } = addGig('Plan', gig);
      const answer = await gigi.post(`/api/gigs/${gigId}/reminder`);
      return answer.status() === 409 ? (await answer.json()).error : answer.status();
    };
    expect(await refusedFor({ status: 'DRAFT', startsOn: day(5) })).toBe('gigNotReminded');
    expect(await refusedFor({ status: 'CANCELLED', startsOn: day(5) })).toBe('gigNotReminded');
    expect(await refusedFor({ status: 'CONFIRMED', startsOn: day(-3) })).toBe('gigNotReminded');
    expect(await refusedFor({ status: 'CONFIRMED', startsOn: day(5) })).toBe(200);
    expect((await gigi.post('/api/gigs/9999/reminder')).status()).toBe(404);
  });
});

test.describe('the automatic reminders', () => {
  const at = (hour: number) => `${day(0)} ${String(hour).padStart(2, '0')}:05`;

  test('two per gig, a number of days before it, from the hour of the band, one notification per member', async ({
    playwright,
  }) => {
    await subscribe(await deviceOf(playwright, email('Zaza')), 'zaza');
    await subscribe(await deviceOf(playwright, email('Dede')), 'dede');
    // 15 and 5 days before, from 18 h: the values the band starts with.
    const first = addGig('Fête des Lumières', {
      status: 'PROPOSED',
      startsOn: day(15),
      meetingTime: '18:00',
    });
    const second = addGig('Marché de Noël', { status: 'ACCEPTED', startsOn: day(5) });
    addGig('Trop tôt', { status: 'PROPOSED', startsOn: day(14) });
    addGig('Déjà validé', { status: 'CONFIRMED', startsOn: day(5) });
    addGig('Brouillon', { status: 'DRAFT', startsOn: day(15) });

    // Before the hour: nothing.
    expect(runReminders(at(17))).toContain('0 gig(s)');
    expect(sentPushes()).toEqual([]);

    expect(runReminders(at(18))).toContain('2 gig(s)');
    const sent = sentPushes();
    // One notification for Zaza, with a line per gig, the nearest first; none for the power member.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.endpoint).toBe(endpointOf('zaza'));
    const lines = sent[0]?.payload.body.split('\n') ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Marché de Noël – \S+ \d{1,2} \S+$/);
    expect(lines[1]).toMatch(/^Fête des Lumières – \S+ \d{1,2} \S+ – 18\u00a0h$/);
    expect(sent[0]?.payload.url).toBe('/gigs');
    expect(sql('SELECT COUNT(*) FROM gig WHERE remindedAt IS NOT NULL')).toBe('2');

    // The task runs every hour: nothing more that day.
    emptyPushes();
    expect(runReminders(at(19))).toContain('0 gig(s)');
    expect(sentPushes()).toEqual([]);
    expect(first.gigId).not.toBe(second.gigId);
  });

  test('none on a day someone already reminded for the gig; an empty number of days sends none', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    await subscribe(await deviceOf(playwright, email('Zaza')), 'zaza');
    const { gigId } = addGig('Fête des Lumières', { status: 'PROPOSED', startsOn: day(15) });
    const later = addGig('Marché de Noël', { status: 'PROPOSED', startsOn: day(5) }).gigId;
    await gigi.post(`/api/gigs/${gigId}/reminder`);
    emptyPushes();

    sql('UPDATE band SET gigSecondReminderDays = NULL');
    expect(runReminders(`${day(0)} 23:30`)).toContain('0 gig(s)');
    expect(sentPushes()).toEqual([]);
    expect(sql(`SELECT remindedAt IS NULL FROM gig WHERE id = ${later}`)).toBe('1');

    // Reminded yesterday: today's reminder leaves.
    sql(`UPDATE gig SET remindedAt = remindedAt - INTERVAL 2 DAY WHERE id = ${gigId}`);
    expect(runReminders(`${day(0)} 23:30`)).toContain('1 gig(s)');
    expect(titles()).toHaveLength(1);
  });

  test('the task is not an address of the app', async ({ request }) => {
    expect((await request.get('/api/tasks/gigReminders.php')).status()).toBe(404);
  });
});
