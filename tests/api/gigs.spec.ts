import { type APIRequestContext, expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { png } from '../support/images.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';
import { emptyStorage, storedFiles } from '../support/storage.ts';

// Gigs, their slots, the answers of members and the costumes. Each test is a
// line of model/gigs.md: "Access rights", "Life cycle" and "Rules" of its
// entries 1 to 3. The gigs are examples; nobody here is real.

// The band of these tests: Jibé the admin (installed, Sax Ténor), Zaza and
// Lulu plain members, Gigi who manages gigs, Popo a power member. All but
// Jibé play the trumpet. The band has three sections; nobody plays in the
// third one, Souba.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Lulu' });
  addMember({ nickname: 'Gigi', roles: ['GIG_MANAGER'] });
  addMember({ nickname: 'Popo', status: 'POWER_MEMBER' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;

/** A day counted from today, as 2026-12-04. */
function day(fromToday: number): string {
  return new Date(Date.now() + fromToday * 86_400_000).toISOString().slice(0, 10);
}

/** What the form of a gig sends. */
function gigRecord(changes: Record<string, unknown> = {}) {
  return { name: 'Fête des Lumières', startsOn: day(30), ...changes };
}

/** Creates a gig straight in the database, with one slot. Returns its id and the id of its slot. */
function addGig(name: string, status = 'PROPOSED', startsOn = day(30)) {
  const gigId = Number(
    sql(
      `INSERT INTO gig (name, status, startsOn) VALUES ('${name}', '${status}', '${startsOn}'); SELECT LAST_INSERT_ID();`,
    ),
  );
  const slotId = Number(
    sql(`INSERT INTO gigSlot (gigId, position) VALUES (${gigId}, 1); SELECT LAST_INSERT_ID();`),
  );
  return { gigId, slotId };
}

function addCostume(name: string): number {
  return Number(
    sql(
      `INSERT INTO costume (name, position) SELECT '${name}', COUNT(*) + 1 FROM costume; SELECT LAST_INSERT_ID();`,
    ),
  );
}

function organise(gigId: number, nickname: string) {
  sql(`INSERT INTO gigOrganizer (gigId, memberId) VALUES (${gigId}, ${memberId(nickname)})`);
}

function answerOf(nickname: string, slotId: number, answer: string) {
  sql(
    `REPLACE INTO gigSlotAttendance (gigSlotId, memberId, answer) VALUES (${slotId}, ${memberId(nickname)}, '${answer}')`,
  );
}

const statusOf = (gigId: number) => sql(`SELECT status FROM gig WHERE id = ${gigId}`);

async function answer(device: APIRequestContext, gigId: number, slotId: number, value: string) {
  return device.put(`/api/gigs/${gigId}/slots/${slotId}/answer`, { data: { answer: value } });
}

test.describe('who may do what', () => {
  test('nothing about gigs is served, and nothing is changed, without signing in', async ({
    request,
  }) => {
    const { gigId, slotId } = addGig('Carnaval');
    for (const address of ['/api/gigs', `/api/gigs/${gigId}`, '/api/costumes']) {
      expect((await request.get(address)).status(), address).toBe(401);
    }

    const writes = [
      await request.post('/api/gigs', { data: gigRecord() }),
      await request.put(`/api/gigs/${gigId}`, { data: gigRecord() }),
      await request.put(`/api/gigs/${gigId}/status`, { data: { status: 'CANCELLED' } }),
      await request.delete(`/api/gigs/${gigId}`),
      await request.post(`/api/gigs/${gigId}/slots`, { data: { name: 'Samedi' } }),
      await request.delete(`/api/gigs/${gigId}/slots/${slotId}`),
      await answer(request, gigId, slotId, 'YES'),
      await request.post('/api/costumes', { data: { name: 'Jungle' } }),
    ];
    for (const response of writes) {
      expect(response.status(), response.url()).toBe(401);
    }
    expect(sql('SELECT name, status FROM gig')).toBe('Carnaval\tPROPOSED');
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');
  });

  test('a member sees every gig but the drafts, the nearest first, and not the Discord channel', async ({
    playwright,
  }) => {
    addGig('Brouillon', 'DRAFT', day(5));
    addGig('Loin', 'CONFIRMED', day(60));
    const { gigId } = addGig('Proche', 'PROPOSED', day(10));
    sql(`UPDATE gig SET discordChannelId = '1203984756120394875' WHERE id = ${gigId}`);
    const zaza = await deviceOf(playwright, email('Zaza'));

    const gigs = await (await zaza.get('/api/gigs')).json();
    expect(gigs.map((gig: { name: string }) => gig.name)).toEqual(['Proche', 'Loin']);
    expect(Object.keys(gigs[0]).sort()).toEqual(
      [
        'canEdit',
        'city',
        'endsOn',
        'id',
        'isPlayable',
        'meetingTime',
        'name',
        'placeName',
        'postalCode',
        'proposedAt',
        'slots',
        'startsOn',
        'status',
      ].sort(),
    );
    expect(gigs[0]).toMatchObject({ status: 'PROPOSED', canEdit: false, isPlayable: false });

    const gig = await (await zaza.get(`/api/gigs/${gigId}`)).json();
    expect(gig).toMatchObject({ name: 'Proche', canEdit: false, organizers: [], costumes: [] });
    expect(gig).not.toHaveProperty('discordChannelId');

    // Who manages gigs sees it, and the drafts.
    const gigi = await deviceOf(playwright, email('Gigi'));
    expect(await (await gigi.get(`/api/gigs/${gigId}`)).json()).toMatchObject({
      canEdit: true,
      discordChannelId: '1203984756120394875',
    });
    const all = await (await gigi.get('/api/gigs')).json();
    expect(all.map((one: { name: string }) => one.name)).toEqual(['Brouillon', 'Proche', 'Loin']);
  });

  test('a draft does not exist for a member: neither read nor answered', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Brouillon', 'DRAFT');
    const zaza = await deviceOf(playwright, email('Zaza'));

    expect((await zaza.get(`/api/gigs/${gigId}`)).status()).toBe(404);
    expect((await answer(zaza, gigId, slotId, 'YES')).status()).toBe(404);
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');
  });

  test('cancelled gigs and gigs already played are listed on request only', async ({
    playwright,
  }) => {
    addGig('Annulé', 'CANCELLED', day(10));
    addGig('Joué', 'CONFIRMED', day(-10));
    addGig('À venir', 'CONFIRMED', day(10));
    const zaza = await deviceOf(playwright, email('Zaza'));

    const names = async (address: string) =>
      (await (await zaza.get(address)).json()).map((gig: { name: string }) => gig.name);
    expect(await names('/api/gigs')).toEqual(['À venir']);
    expect(await names('/api/gigs?all')).toEqual(['Joué', 'Annulé', 'À venir']);
  });

  test('a member cannot create, edit, change the status, delete, touch a slot, nor answer for another', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval');
    const costumeId = addCostume('Jungle');
    const zaza = await deviceOf(playwright, email('Zaza'));

    const refused = [
      await zaza.post('/api/gigs', { data: gigRecord() }),
      await zaza.put(`/api/gigs/${gigId}`, { data: gigRecord() }),
      await zaza.put(`/api/gigs/${gigId}/status`, { data: { status: 'CANCELLED' } }),
      await zaza.delete(`/api/gigs/${gigId}`),
      await zaza.post(`/api/gigs/${gigId}/slots`, { data: { name: 'Samedi' } }),
      await zaza.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: { name: 'Samedi' } }),
      await zaza.delete(`/api/gigs/${gigId}/slots/${slotId}`),
      await zaza.put(`/api/gigs/${gigId}/slots/${slotId}/answers/${memberId('Lulu')}`, {
        data: { answer: 'YES' },
      }),
      await zaza.post('/api/costumes', { data: { name: 'Paillettes' } }),
      await zaza.put(`/api/costumes/${costumeId}`, { data: { name: 'Paillettes' } }),
      await zaza.delete(`/api/costumes/${costumeId}`),
    ];
    for (const response of refused) {
      expect(response.status(), response.url()).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect(sql('SELECT name, status FROM gig')).toBe('Carnaval\tPROPOSED');
    expect(sql('SELECT name FROM gigSlot')).toBe('NULL');
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');
    expect(sql('SELECT name FROM costume')).toBe('Jungle');
  });

  test('an organiser sees, edits and moves their gig, draft included, and no other', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Mon plan', 'DRAFT');
    const other = addGig('Autre plan', 'PROPOSED');
    organise(gigId, 'Zaza');
    const zaza = await deviceOf(playwright, email('Zaza'));

    expect(await (await zaza.get(`/api/gigs/${gigId}`)).json()).toMatchObject({
      canEdit: true,
      discordChannelId: null,
      organizers: [{ id: memberId('Zaza'), nickname: 'Zaza' }],
    });
    const edited = await zaza.put(`/api/gigs/${gigId}`, {
      data: gigRecord({
        name: 'Mon plan, revu',
        organizerIds: [memberId('Zaza'), memberId('Lulu')],
      }),
    });
    expect(edited.status()).toBe(200);
    expect(
      (await edited.json()).organizers.map((one: { nickname: string }) => one.nickname),
    ).toEqual(['Lulu', 'Zaza']);
    expect(
      (await zaza.put(`/api/gigs/${gigId}/status`, { data: { status: 'PROPOSED' } })).status(),
    ).toBe(200);
    // Lulu told them she comes.
    const forLulu = await zaza.put(
      `/api/gigs/${gigId}/slots/${slotId}/answers/${memberId('Lulu')}`,
      { data: { answer: 'YES' } },
    );
    expect(forLulu.status()).toBe(200);
    expect(sql('SELECT answer FROM gigSlotAttendance')).toBe('YES');

    // Creating and deleting stay with who manages gigs; another gig is not theirs.
    const refused = [
      await zaza.post('/api/gigs', { data: gigRecord() }),
      await zaza.delete(`/api/gigs/${gigId}`),
      await zaza.put(`/api/gigs/${other.gigId}`, { data: gigRecord() }),
      await zaza.put(`/api/gigs/${other.gigId}/status`, { data: { status: 'CANCELLED' } }),
      await zaza.put(`/api/gigs/${other.gigId}/slots/${other.slotId}/answers/${memberId('Lulu')}`, {
        data: { answer: 'NO' },
      }),
    ];
    for (const response of refused) {
      expect(response.status(), response.url()).toBe(403);
    }
    expect(sql(`SELECT name FROM gig WHERE id = ${other.gigId}`)).toBe('Autre plan');
  });
});

test.describe('the record of a gig', () => {
  test('who manages gigs creates a draft with one slot, without a name', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const jungle = addCostume('Jungle');

    const created = await gigi.post('/api/gigs', {
      data: gigRecord({
        endsOn: day(32),
        meetingTime: '18:30',
        placeName: 'Place des Terreaux',
        placeUrl: 'https://example.org/lieu',
        streetAddress: '12 rue des Capucins',
        postalCode: '69001',
        city: 'Lyon',
        latitude: 45.7673004,
        longitude: 4.8344,
        notes: 'Parking derrière la mairie\nRepas prévu',
        organizerIds: [memberId('Zaza')],
        costumeIds: [jungle],
      }),
    });
    expect(created.status()).toBe(201);
    expect(await created.json()).toMatchObject({
      name: 'Fête des Lumières',
      status: 'DRAFT',
      startsOn: day(30),
      endsOn: day(32),
      meetingTime: '18:30',
      city: 'Lyon',
      latitude: 45.7673,
      longitude: 4.8344,
      notes: 'Parking derrière la mairie\nRepas prévu',
      remindedAt: null,
      organizers: [{ nickname: 'Zaza' }],
      costumes: [{ id: jungle, name: 'Jungle', pictureUrl: null }],
      slots: [{ name: null, position: 1, costumeId: null, ownAnswer: null, answers: [] }],
    });
    expect(sql('SELECT updatedByMemberId FROM gig')).toBe(String(memberId('Gigi')));
  });

  test('a gig of one day has no end date, and only a postal code and a city is enough', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const created = await gigi.post('/api/gigs', {
      data: gigRecord({ endsOn: day(30), postalCode: '69001', city: 'Lyon' }),
    });
    expect(await created.json()).toMatchObject({
      endsOn: null,
      postalCode: '69001',
      city: 'Lyon',
      streetAddress: null,
    });
  });

  test('a faulty record is refused field by field, and nothing is saved', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    addMember({ nickname: 'Parti', status: 'LEFT' });
    const faults: [Record<string, unknown>, Record<string, string>][] = [
      [{ name: '   ' }, { name: 'required' }],
      [{ name: 'x'.repeat(81) }, { name: 'tooLong' }],
      [{ startsOn: '2026-02-30' }, { startsOn: 'invalid' }],
      [{ endsOn: day(29) }, { endsOn: 'invalid' }],
      [{ meetingTime: '25:00' }, { meetingTime: 'invalid' }],
      [{ placeUrl: 'http://example.org' }, { placeUrl: 'invalid' }],
      [{ placeUrl: 'javascript:alert(1)' }, { placeUrl: 'invalid' }],
      [{ latitude: 45.7 }, { longitude: 'required' }],
      [{ latitude: 91, longitude: 4.8 }, { latitude: 'invalid' }],
      [{ latitude: 45.7, longitude: 181 }, { longitude: 'invalid' }],
      [{ discordChannelId: 'abc' }, { discordChannelId: 'invalid' }],
      [{ organizerIds: [9999] }, { organizerIds: 'invalid' }],
      // Only a current member organises a gig.
      [{ organizerIds: [memberId('Parti')] }, { organizerIds: 'invalid' }],
      [{ costumeIds: [9999] }, { costumeIds: 'invalid' }],
    ];
    for (const [changes, fields] of faults) {
      const response = await gigi.post('/api/gigs', { data: gigRecord(changes) });
      expect(response.status(), JSON.stringify(changes)).toBe(422);
      expect(await response.json()).toEqual({ error: 'invalidInput', fields });
    }
    expect(sql('SELECT COUNT(*) FROM gig')).toBe('0');
    expect(sql('SELECT COUNT(*) FROM gigSlot')).toBe('0');
  });

  test('two gigs can bear the same name, not the same Discord channel', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const channel = { discordChannelId: '1203984756120394875' };
    expect((await gigi.post('/api/gigs', { data: gigRecord(channel) })).status()).toBe(201);
    expect((await gigi.post('/api/gigs', { data: gigRecord() })).status()).toBe(201);

    const second = await gigi.post('/api/gigs', { data: gigRecord(channel) });
    expect(second.status()).toBe(422);
    expect(await second.json()).toEqual({
      error: 'invalidInput',
      fields: { discordChannelId: 'duplicate' },
    });
  });

  test('taking a costume off a gig empties it on the slots that had it', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const { gigId, slotId } = addGig('Carnaval');
    const jungle = addCostume('Jungle');
    const glitter = addCostume('Paillettes');
    await gigi.put(`/api/gigs/${gigId}`, { data: gigRecord({ costumeIds: [jungle, glitter] }) });
    await gigi.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: { costumeId: jungle } });
    expect(sql('SELECT costumeId FROM gigSlot')).toBe(String(jungle));

    const saved = await gigi.put(`/api/gigs/${gigId}`, {
      data: gigRecord({ costumeIds: [glitter] }),
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({
      costumes: [{ name: 'Paillettes' }],
      slots: [{ costumeId: null }],
    });
  });

  test('only a draft is deleted, by who manages gigs, with its slots', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const draft = addGig('Brouillon', 'DRAFT');
    const seen = addGig('Carnaval', 'PROPOSED');
    const jungle = addCostume('Jungle');
    sql(`INSERT INTO gigCostume (gigId, costumeId) VALUES (${draft.gigId}, ${jungle})`);
    sql(`UPDATE gigSlot SET costumeId = ${jungle} WHERE id = ${draft.slotId}`);
    organise(draft.gigId, 'Zaza');

    const refused = await gigi.delete(`/api/gigs/${seen.gigId}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'gigNotDraft' });

    expect((await gigi.delete(`/api/gigs/${draft.gigId}`)).status()).toBe(200);
    expect(sql('SELECT name FROM gig')).toBe('Carnaval');
    expect(sql('SELECT gigId FROM gigSlot')).toBe(String(seen.gigId));
    expect(sql('SELECT COUNT(*) FROM gigOrganizer')).toBe('0');
    expect(sql('SELECT name FROM costume')).toBe('Jungle');
    expect((await gigi.delete('/api/gigs/9999')).status()).toBe(404);
  });
});

test.describe('the life cycle of a gig', () => {
  test('each status goes to those the model allows, and to no other', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const allowed: Record<string, string[]> = {
      DRAFT: ['PROPOSED', 'CANCELLED'],
      PROPOSED: ['ACCEPTED', 'CONFIRMED', 'CANCELLED'],
      ACCEPTED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['ACCEPTED', 'PROPOSED', 'CANCELLED'],
      CANCELLED: ['DRAFT', 'PROPOSED'],
    };
    const { gigId } = addGig('Carnaval');
    for (const [from, nexts] of Object.entries(allowed)) {
      for (const to of Object.keys(allowed)) {
        sql(`UPDATE gig SET status = '${from}' WHERE id = ${gigId}`);
        const response = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: to } });
        if (nexts.includes(to)) {
          expect(response.status(), `${from} to ${to}`).toBe(200);
          expect(statusOf(gigId)).toBe(to);
        } else {
          expect(response.status(), `${from} to ${to}`).toBe(409);
          expect(await response.json()).toEqual({ error: 'invalidTransition' });
          expect(statusOf(gigId)).toBe(from);
        }
      }
    }
    const unknown = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'PAST' } });
    expect(unknown.status()).toBe(422);
  });

  test('an accepted gig is confirmed by the app as soon as an answer makes it playable', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', 'ACCEPTED');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    // The trumpets have a yes, the saxophones have not.
    expect(await (await answer(zaza, gigId, slotId, 'YES')).json()).toMatchObject({
      status: 'ACCEPTED',
      isPlayable: false,
    });
    expect(await (await answer(jibe, gigId, slotId, 'YES')).json()).toMatchObject({
      status: 'CONFIRMED',
      isPlayable: true,
    });
    // The app did it: no author.
    expect(sql(`SELECT updatedByMemberId FROM gig WHERE id = ${gigId}`)).toBe('NULL');

    // It stays confirmed when an answer changes afterwards.
    expect(await (await answer(jibe, gigId, slotId, 'NO')).json()).toMatchObject({
      status: 'CONFIRMED',
      isPlayable: false,
    });
  });

  test('a gig already playable is confirmed the moment it is accepted', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Carnaval', 'PROPOSED');
    answerOf('Zaza', slotId, 'YES');
    answerOf('Jibé', slotId, 'YES');
    const gigi = await deviceOf(playwright, email('Gigi'));

    // Playable does not confirm a gig still under discussion.
    expect(await (await answer(gigi, gigId, slotId, 'YES')).json()).toMatchObject({
      status: 'PROPOSED',
      isPlayable: true,
    });
    const accepted = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'ACCEPTED' } });
    expect(await accepted.json()).toMatchObject({ status: 'CONFIRMED' });
  });

  test('a confirmed gig put back to accepted while playable is confirmed again at the next answer', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', 'CONFIRMED');
    answerOf('Zaza', slotId, 'YES');
    answerOf('Jibé', slotId, 'YES');
    const gigi = await deviceOf(playwright, email('Gigi'));

    // Put back by hand: the app does not confirm it again on the spot.
    const back = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'ACCEPTED' } });
    expect(await back.json()).toMatchObject({ status: 'ACCEPTED', isPlayable: true });
    expect(sql(`SELECT COUNT(*) FROM gigSlotAttendance WHERE gigSlotId = ${slotId}`)).toBe('2');

    // The rule "confirmed by the app" applies again at the next answer.
    expect(await (await answer(gigi, gigId, slotId, 'MAYBE')).json()).toMatchObject({
      status: 'CONFIRMED',
    });
  });

  test('a confirmed gig put back to proposed stays proposed, whatever the answers', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', 'CONFIRMED');
    answerOf('Zaza', slotId, 'YES');
    answerOf('Jibé', slotId, 'YES');
    const gigi = await deviceOf(playwright, email('Gigi'));

    const back = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'PROPOSED' } });
    expect(await back.json()).toMatchObject({ status: 'PROPOSED', isPlayable: true });
    expect(await (await answer(gigi, gigId, slotId, 'YES')).json()).toMatchObject({
      status: 'PROPOSED',
    });
  });

  test('who may edit a gig forces it to confirmed although a section has no yes', async ({
    playwright,
  }) => {
    const { gigId } = addGig('Carnaval', 'PROPOSED');
    const gigi = await deviceOf(playwright, email('Gigi'));

    const forced = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'CONFIRMED' } });
    expect(await forced.json()).toMatchObject({ status: 'CONFIRMED', isPlayable: false });
    expect(sql(`SELECT updatedByMemberId FROM gig WHERE id = ${gigId}`)).toBe(
      String(memberId('Gigi')),
    );
  });

  test('a cancelled gig is reopened with the answers it had', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Carnaval', 'PROPOSED');
    answerOf('Zaza', slotId, 'YES');
    const gigi = await deviceOf(playwright, email('Gigi'));

    await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'CANCELLED' } });
    const reopened = await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'PROPOSED' } });
    expect((await reopened.json()).slots[0].answers).toMatchObject([
      { nickname: 'Zaza', answer: 'YES' },
    ]);
  });

  test('a gig is proposed the first time members see it, and never again', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const { gigId } = addGig('Carnaval', 'DRAFT');
    const move = (status: string) => gigi.put(`/api/gigs/${gigId}/status`, { data: { status } });
    const proposedAt = () => sql(`SELECT proposedAt FROM gig WHERE id = ${gigId}`);

    // A draft was never proposed, even cancelled then reopened as a draft.
    expect((await (await gigi.get(`/api/gigs/${gigId}`)).json()).proposedAt).toBeNull();
    await move('CANCELLED');
    await move('DRAFT');
    expect(proposedAt()).toBe('NULL');

    const proposed = await move('PROPOSED');
    const first = (await proposed.json()).proposedAt;
    expect(Math.abs(Date.now() - Date.parse(first))).toBeLessThan(60_000);
    const listed = await (await zaza.get('/api/gigs')).json();
    expect(listed).toMatchObject([{ id: gigId, proposedAt: first }]);

    // Said twenty days ago: no later change of status moves it.
    sql(`UPDATE gig SET proposedAt = UTC_TIMESTAMP() - INTERVAL 20 DAY WHERE id = ${gigId}`);
    const before = proposedAt();
    for (const status of [
      'ACCEPTED',
      'CANCELLED',
      'PROPOSED',
      'CONFIRMED',
      'CANCELLED',
      'DRAFT',
      'PROPOSED',
    ]) {
      expect((await move(status)).status(), status).toBe(200);
      expect(proposedAt(), status).toBe(before);
    }
  });
});

test.describe('answers and playability', () => {
  test('a slot is playable once every section that has a member has a yes', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const sections = (name: string) => Number(sql(`SELECT id FROM section WHERE name = '${name}'`));

    // Nobody answered: the two sections that have members are missing. Souba,
    // which has none, blocks nothing.
    let gig = await (await zaza.get(`/api/gigs/${gigId}`)).json();
    expect(gig.slots[0]).toMatchObject({
      isPlayable: false,
      isPlayableIfNeeded: false,
      missingSectionIds: [sections('Trompette'), sections('Saxophone')],
      ownAnswer: null,
      ownYesMakesPlayable: false,
    });

    // "Maybe" and "if needed" are not a yes.
    answerOf('Jibé', slotId, 'YES');
    answerOf('Lulu', slotId, 'MAYBE');
    gig = await (await answer(zaza, gigId, slotId, 'IF_NEEDED')).json();
    expect(gig).toMatchObject({ isPlayable: false });
    expect(gig.slots[0]).toMatchObject({
      isPlayable: false,
      // It would be, if Zaza came.
      isPlayableIfNeeded: true,
      missingSectionIds: [sections('Trompette')],
      ownAnswer: 'IF_NEEDED',
      // Her section is the last one without a yes.
      ownYesMakesPlayable: true,
    });

    gig = await (await answer(zaza, gigId, slotId, 'YES')).json();
    expect(gig).toMatchObject({ isPlayable: true });
    expect(gig.slots[0]).toMatchObject({
      isPlayable: true,
      missingSectionIds: [],
      ownAnswer: 'YES',
      ownYesMakesPlayable: false,
    });
    // The list says the same.
    expect((await (await zaza.get('/api/gigs')).json())[0]).toMatchObject({
      isPlayable: true,
      slots: [{ ownAnswer: 'YES', isPlayable: true }],
    });
  });

  test('a power member counts like an active one; a member who left does not', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval');
    answerOf('Jibé', slotId, 'YES');
    const popo = await deviceOf(playwright, email('Popo'));
    expect(await (await answer(popo, gigId, slotId, 'YES')).json()).toMatchObject({
      isPlayable: true,
    });

    // Popo leaves: the yes stays written, and no longer counts.
    sql(`UPDATE member SET status = 'LEFT' WHERE id = ${memberId('Popo')}`);
    const zaza = await deviceOf(playwright, email('Zaza'));
    const gig = await (await zaza.get(`/api/gigs/${gigId}`)).json();
    expect(gig).toMatchObject({ isPlayable: false });
    expect(gig.slots[0].answers).toEqual([
      expect.objectContaining({ nickname: 'Jibé', answer: 'YES', isCurrentMember: true }),
      expect.objectContaining({ nickname: 'Popo', answer: 'YES', isCurrentMember: false }),
    ]);
  });

  test('a gig is playable as soon as one of its slots is', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Fête des Lumières');
    sql(`UPDATE gigSlot SET name = 'Vendredi soir' WHERE id = ${slotId}`);
    const second = Number(
      sql(
        `INSERT INTO gigSlot (gigId, name, position) VALUES (${gigId}, 'Samedi midi', 2); SELECT LAST_INSERT_ID();`,
      ),
    );
    answerOf('Jibé', second, 'YES');
    answerOf('Zaza', second, 'YES');
    const lulu = await deviceOf(playwright, email('Lulu'));

    const gig = await (await lulu.get(`/api/gigs/${gigId}`)).json();
    expect(gig).toMatchObject({
      isPlayable: true,
      slots: [
        { name: 'Vendredi soir', isPlayable: false },
        { name: 'Samedi midi', isPlayable: true },
      ],
    });
  });

  test('an answer is changed, not taken back, and is one of the four', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Carnaval');
    const zaza = await deviceOf(playwright, email('Zaza'));

    for (const value of ['YES', 'NO', 'MAYBE', 'IF_NEEDED']) {
      expect((await answer(zaza, gigId, slotId, value)).status()).toBe(200);
      expect(sql('SELECT answer FROM gigSlotAttendance')).toBe(value);
    }
    for (const value of [null, '', 'PERHAPS']) {
      expect((await answer(zaza, gigId, slotId, value as string)).status()).toBe(422);
    }
    expect(sql('SELECT answer, updatedByMemberId FROM gigSlotAttendance')).toBe(
      `IF_NEEDED\t${memberId('Zaza')}`,
    );
  });

  test('nobody answers for a draft, a cancelled gig or a gig that is over', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const closed = [
      addGig('Brouillon', 'DRAFT'),
      addGig('Annulé', 'CANCELLED'),
      addGig('Joué', 'CONFIRMED', day(-3)),
    ];
    for (const { gigId, slotId } of closed) {
      const response = await answer(gigi, gigId, slotId, 'YES');
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual({ error: 'gigNotOpen' });
    }
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');

    // A gig of several days stays open until its last day.
    const long = addGig('Festival', 'CONFIRMED', day(-3));
    sql(`UPDATE gig SET endsOn = '${day(1)}' WHERE id = ${long.gigId}`);
    expect((await answer(gigi, long.gigId, long.slotId, 'YES')).status()).toBe(200);
  });

  test('who manages gigs answers for a current member, on a slot of the gig', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval');
    const other = addGig('Autre plan');
    addMember({ nickname: 'Parti', status: 'LEFT' });
    const gigi = await deviceOf(playwright, email('Gigi'));
    const forMember = (slot: number, member: number) =>
      gigi.put(`/api/gigs/${gigId}/slots/${slot}/answers/${member}`, { data: { answer: 'YES' } });

    expect((await forMember(slotId, memberId('Lulu'))).status()).toBe(200);
    expect(sql('SELECT memberId, answer, updatedByMemberId FROM gigSlotAttendance')).toBe(
      `${memberId('Lulu')}\tYES\t${memberId('Gigi')}`,
    );
    for (const response of [
      await forMember(slotId, memberId('Parti')),
      await forMember(slotId, 9999),
      await forMember(other.slotId, memberId('Lulu')),
    ]) {
      expect(response.status()).toBe(404);
    }
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('1');
  });
});

test.describe('the slots of a gig', () => {
  test('the only slot is named before a second one is added, and names differ', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Fête des Lumières');
    const gigi = await deviceOf(playwright, email('Gigi'));
    const add = (data: Record<string, unknown>) => gigi.post(`/api/gigs/${gigId}/slots`, { data });

    const tooSoon = await add({ name: 'Samedi midi' });
    expect(tooSoon.status()).toBe(409);
    expect(await tooSoon.json()).toEqual({ error: 'slotWithoutName' });

    await gigi.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: { name: 'Vendredi soir' } });
    expect(await (await add({})).json()).toEqual({
      error: 'invalidInput',
      fields: { name: 'required' },
    });
    // Compared without case, as the database does.
    expect(await (await add({ name: 'vendredi SOIR' })).json()).toEqual({
      error: 'invalidInput',
      fields: { name: 'duplicate' },
    });
    expect(await (await add({ name: 'x'.repeat(41) })).json()).toEqual({
      error: 'invalidInput',
      fields: { name: 'tooLong' },
    });

    const added = await add({ name: 'Samedi midi', note: 'Parade, on marche deux heures' });
    expect(added.status()).toBe(201);
    expect((await added.json()).slots).toMatchObject([
      { name: 'Vendredi soir', position: 1 },
      { name: 'Samedi midi', position: 2, note: 'Parade, on marche deux heures' },
    ]);

    // Once a gig has several slots, none loses its name.
    const unnamed = await gigi.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: {} });
    expect(await unnamed.json()).toEqual({ error: 'invalidInput', fields: { name: 'required' } });

    // Moved to the first place.
    const first = await add({ name: 'Jeudi', position: 1 });
    expect((await first.json()).slots.map((slot: { name: string }) => slot.name)).toEqual([
      'Jeudi',
      'Vendredi soir',
      'Samedi midi',
    ]);
  });

  test('the costume of a slot is one of the costumes of its gig', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Carnaval');
    const jungle = addCostume('Jungle');
    const glitter = addCostume('Paillettes');
    sql(`INSERT INTO gigCostume (gigId, costumeId) VALUES (${gigId}, ${jungle})`);
    const gigi = await deviceOf(playwright, email('Gigi'));
    const wear = (costumeId: number) =>
      gigi.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: { costumeId } });

    expect(await (await wear(glitter)).json()).toEqual({
      error: 'invalidInput',
      fields: { costumeId: 'invalid' },
    });
    expect((await (await wear(jungle)).json()).slots[0]).toMatchObject({ costumeId: jungle });
  });

  test('deleting a slot deletes its answers; the last slot stays', async ({ playwright }) => {
    const { gigId, slotId } = addGig('Fête des Lumières');
    sql(`UPDATE gigSlot SET name = 'Vendredi soir' WHERE id = ${slotId}`);
    const second = Number(
      sql(
        `INSERT INTO gigSlot (gigId, name, position) VALUES (${gigId}, 'Samedi midi', 2); SELECT LAST_INSERT_ID();`,
      ),
    );
    const other = addGig('Autre plan');
    answerOf('Zaza', slotId, 'YES');
    answerOf('Zaza', second, 'NO');
    const gigi = await deviceOf(playwright, email('Gigi'));

    // A slot of another gig is not one of this gig.
    expect((await gigi.delete(`/api/gigs/${gigId}/slots/${other.slotId}`)).status()).toBe(404);

    const deleted = await gigi.delete(`/api/gigs/${gigId}/slots/${slotId}`);
    expect((await deleted.json()).slots).toMatchObject([{ name: 'Samedi midi', position: 1 }]);
    expect(sql('SELECT gigSlotId, answer FROM gigSlotAttendance')).toBe(`${second}\tNO`);

    const last = await gigi.delete(`/api/gigs/${gigId}/slots/${second}`);
    expect(last.status()).toBe(409);
    expect(await last.json()).toEqual({ error: 'lastSlot' });
  });
});

test.describe('costumes', () => {
  test('every member lists the costumes; only the admin manages them', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const gigi = await deviceOf(playwright, email('Gigi'));
    const zaza = await deviceOf(playwright, email('Zaza'));

    // Who manages gigs does not manage costumes.
    expect((await gigi.post('/api/costumes', { data: { name: 'Jungle' } })).status()).toBe(403);

    expect((await jibe.post('/api/costumes', { data: { name: 'Jungle' } })).status()).toBe(201);
    await jibe.post('/api/costumes', { data: { name: 'Paillettes' } });
    const moved = await jibe.post('/api/costumes', { data: { name: ' Libre ', position: 1 } });
    const costume = { id: expect.any(Number), pictureUrl: null, gigCount: 0 };
    expect(await moved.json()).toEqual([
      { ...costume, name: 'Libre', position: 1 },
      { ...costume, name: 'Jungle', position: 2 },
      { ...costume, name: 'Paillettes', position: 3 },
    ]);
    expect(await (await zaza.get('/api/costumes')).json()).toHaveLength(3);

    const duplicate = await jibe.post('/api/costumes', { data: { name: 'jungle' } });
    expect(await duplicate.json()).toEqual({
      error: 'invalidInput',
      fields: { name: 'duplicate' },
    });

    const id = Number(sql("SELECT id FROM costume WHERE name = 'Paillettes'"));
    const renamed = await jibe.put(`/api/costumes/${id}`, { data: { name: 'Éphémère' } });
    expect((await renamed.json())[2]).toMatchObject({ name: 'Éphémère' });
    expect((await jibe.put('/api/costumes/9999', { data: { name: 'Rien' } })).status()).toBe(404);
  });

  test('a costume a gig has cannot be deleted', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const { gigId } = addGig('Joué', 'CONFIRMED', day(-40));
    const jungle = addCostume('Jungle');
    const free = addCostume('Libre');
    sql(`INSERT INTO gigCostume (gigId, costumeId) VALUES (${gigId}, ${jungle})`);

    const refused = await jibe.delete(`/api/costumes/${jungle}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'costumeInUse' });

    expect(await (await jibe.delete(`/api/costumes/${free}`)).json()).toMatchObject([
      { name: 'Jungle' },
    ]);
  });
});

test('a member who leaves stays organiser of the gigs already played, with their answers', async ({
  playwright,
}) => {
  const played = addGig('Joué', 'CONFIRMED', day(-40));
  const coming = addGig('À venir', 'PROPOSED', day(40));
  organise(played.gigId, 'Zaza');
  organise(coming.gigId, 'Zaza');
  organise(coming.gigId, 'Lulu');
  answerOf('Zaza', played.slotId, 'YES');
  const jibe = await deviceOf(playwright, admin.email, admin.password);

  const left = await jibe.put(`/api/members/${memberId('Zaza')}/status`, {
    data: { status: 'LEFT' },
  });
  expect(left.status()).toBe(200);

  expect(await (await jibe.get(`/api/gigs/${coming.gigId}`)).json()).toMatchObject({
    organizers: [{ nickname: 'Lulu' }],
  });
  const gig = await (await jibe.get(`/api/gigs/${played.gigId}`)).json();
  expect(gig.organizers).toEqual([{ id: memberId('Zaza'), nickname: 'Zaza' }]);
  expect(gig.slots[0].answers).toMatchObject([{ nickname: 'Zaza', answer: 'YES' }]);
});

// What the independent review of the API found, each with its test.
test.describe('found by the review', () => {
  test('a gig already played is saved again without losing the organiser who left', async ({
    playwright,
  }) => {
    const { gigId } = addGig('Joué', 'CONFIRMED', day(-40));
    organise(gigId, 'Zaza');
    sql(`UPDATE member SET status = 'LEFT' WHERE id = ${memberId('Zaza')}`);
    const gigi = await deviceOf(playwright, email('Gigi'));
    const record = gigRecord({ name: 'Joué', startsOn: day(-40), notes: 'Corrigé après coup' });

    const saved = await gigi.put(`/api/gigs/${gigId}`, {
      data: { ...record, organizerIds: [memberId('Zaza')] },
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({
      notes: 'Corrigé après coup',
      organizers: [{ nickname: 'Zaza' }],
    });

    // Once taken off, she is not put back: she is no longer a current member.
    await gigi.put(`/api/gigs/${gigId}`, { data: record });
    const back = await gigi.put(`/api/gigs/${gigId}`, {
      data: { ...record, organizerIds: [memberId('Zaza')] },
    });
    expect(await back.json()).toEqual({
      error: 'invalidInput',
      fields: { organizerIds: 'invalid' },
    });
  });

  test('a gig is over once the day after its last day has ended, for the answers, the list and a member who leaves', async ({
    playwright,
  }) => {
    const yesterday = addGig('Hier', 'CONFIRMED', day(-1));
    const before = addGig('Avant-hier', 'CONFIRMED', day(-2));
    organise(yesterday.gigId, 'Lulu');
    organise(before.gigId, 'Lulu');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    expect((await answer(zaza, yesterday.gigId, yesterday.slotId, 'YES')).status()).toBe(200);
    expect((await answer(zaza, before.gigId, before.slotId, 'YES')).status()).toBe(409);
    const listed = await (await zaza.get('/api/gigs')).json();
    expect(listed.map((gig: { name: string }) => gig.name)).toEqual(['Hier']);

    await jibe.put(`/api/members/${memberId('Lulu')}/status`, { data: { status: 'LEFT' } });
    expect(sql('SELECT gigId FROM gigOrganizer')).toBe(String(before.gigId));
  });

  test('a draft members answered for, cancelled then reopened, is not deleted', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', 'PROPOSED');
    answerOf('Zaza', slotId, 'YES');
    const gigi = await deviceOf(playwright, email('Gigi'));
    await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'CANCELLED' } });
    await gigi.put(`/api/gigs/${gigId}/status`, { data: { status: 'DRAFT' } });

    const refused = await gigi.delete(`/api/gigs/${gigId}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'gigHasAnswers' });
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('1');
  });

  test('an organiser who takes themself off a draft is answered, and no longer sees it', async ({
    playwright,
  }) => {
    const { gigId } = addGig('Mon plan', 'DRAFT');
    organise(gigId, 'Zaza');
    const zaza = await deviceOf(playwright, email('Zaza'));

    const saved = await zaza.put(`/api/gigs/${gigId}`, {
      data: gigRecord({ organizerIds: [memberId('Lulu')] }),
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ id: gigId, canEdit: false });
    expect((await zaza.get(`/api/gigs/${gigId}`)).status()).toBe(404);
    expect(sql('SELECT memberId FROM gigOrganizer')).toBe(String(memberId('Lulu')));
  });

  test('an accepted gig made playable by a member leaving is confirmed at the next answer', async ({
    playwright,
  }) => {
    const { gigId, slotId } = addGig('Carnaval', 'ACCEPTED');
    answerOf('Zaza', slotId, 'YES');
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    // Jibé, the only saxophone, moves to the trumpets: the saxophones no longer count.
    sql(
      `UPDATE member SET instrumentId = (SELECT MIN(id) FROM instrument) WHERE id = ${memberId('Jibé')}`,
    );
    expect(statusOf(gigId)).toBe('ACCEPTED');

    expect(await (await answer(jibe, gigId, slotId, 'NO')).json()).toMatchObject({
      status: 'CONFIRMED',
      isPlayable: true,
    });
  });

  test('a gig not played whose date has passed stays listed for who may edit it', async ({
    playwright,
  }) => {
    addGig('Brouillon périmé', 'DRAFT', day(-10));
    const toClose = addGig('À clore', 'PROPOSED', day(-8));
    addGig('Accepté jamais joué', 'ACCEPTED', day(-6));
    addGig('Joué', 'CONFIRMED', day(-4));
    addGig('À venir', 'PROPOSED', day(10));
    organise(toClose.gigId, 'Lulu');
    const names = async (nickname: string) =>
      (await (await (await deviceOf(playwright, email(nickname))).get('/api/gigs')).json()).map(
        (gig: { name: string }) => gig.name,
      );

    expect(await names('Gigi')).toEqual([
      'Brouillon périmé',
      'À clore',
      'Accepté jamais joué',
      'À venir',
    ]);
    // An organiser: their own only. A member: none of them.
    expect(await names('Lulu')).toEqual(['À clore', 'À venir']);
    expect(await names('Zaza')).toEqual(['À venir']);
  });

  test('an organiser manages the slots of their gig, and of no other, and lists their draft', async ({
    playwright,
  }) => {
    const mine = addGig('Mon plan', 'DRAFT');
    const other = addGig('Autre brouillon', 'DRAFT');
    const seen = addGig('Autre plan', 'PROPOSED');
    organise(mine.gigId, 'Zaza');
    const zaza = await deviceOf(playwright, email('Zaza'));

    const listed = await (await zaza.get('/api/gigs')).json();
    expect(listed.map((gig: { name: string }) => gig.name).sort()).toEqual([
      'Autre plan',
      'Mon plan',
    ]);
    expect((await zaza.get(`/api/gigs/${other.gigId}`)).status()).toBe(404);

    const slots = `/api/gigs/${mine.gigId}/slots`;
    expect(
      (await zaza.put(`${slots}/${mine.slotId}`, { data: { name: 'Vendredi' } })).status(),
    ).toBe(200);
    const added = await zaza.post(slots, { data: { name: 'Samedi' } });
    expect(added.status()).toBe(201);
    const addedId = (await added.json()).slots[1].id;
    expect((await zaza.delete(`${slots}/${addedId}`)).status()).toBe(200);

    for (const response of [
      await zaza.post(`/api/gigs/${seen.gigId}/slots`, { data: { name: 'Samedi' } }),
      await zaza.put(`/api/gigs/${seen.gigId}/slots/${seen.slotId}`, { data: { name: 'Samedi' } }),
      await zaza.delete(`/api/gigs/${seen.gigId}/slots/${seen.slotId}`),
    ]) {
      expect(response.status(), response.url()).toBe(403);
    }
    // A slot of another gig, reached through the gig they may edit.
    expect((await zaza.put(`${slots}/${seen.slotId}`, { data: { name: 'Samedi' } })).status()).toBe(
      404,
    );
    expect(sql(`SELECT name FROM gigSlot WHERE id = ${seen.slotId}`)).toBe('NULL');
  });

  test('a member answers neither through another gig, nor for a cancelled gig or one that is over', async ({
    playwright,
  }) => {
    const open = addGig('Carnaval', 'PROPOSED');
    const draft = addGig('Brouillon', 'DRAFT');
    const cancelled = addGig('Annulé', 'CANCELLED');
    const played = addGig('Joué', 'CONFIRMED', day(-5));
    const zaza = await deviceOf(playwright, email('Zaza'));

    expect((await answer(zaza, open.gigId, draft.slotId, 'YES')).status()).toBe(404);
    expect((await answer(zaza, cancelled.gigId, cancelled.slotId, 'YES')).status()).toBe(409);
    expect((await answer(zaza, played.gigId, played.slotId, 'YES')).status()).toBe(409);
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('0');
  });

  test('a gig keeps its own Discord channel when it is saved again, and long texts are refused', async ({
    playwright,
  }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const channel = { discordChannelId: '1203984756120394875' };
    const gigId = (await (await gigi.post('/api/gigs', { data: gigRecord(channel) })).json()).id;
    expect((await gigi.put(`/api/gigs/${gigId}`, { data: gigRecord(channel) })).status()).toBe(200);

    const tooLong: Record<string, number> = {
      placeName: 81,
      placeUrl: 501,
      streetAddress: 201,
      postalCode: 13,
      city: 81,
      notes: 4001,
    };
    for (const [field, length] of Object.entries(tooLong)) {
      const response = await gigi.put(`/api/gigs/${gigId}`, {
        data: gigRecord({ [field]: 'x'.repeat(length) }),
      });
      expect((await response.json()).fields, field).toMatchObject({ [field]: 'tooLong' });
    }
    const slotId = Number(sql(`SELECT id FROM gigSlot WHERE gigId = ${gigId}`));
    const note = await gigi.put(`/api/gigs/${gigId}/slots/${slotId}`, {
      data: { note: 'x'.repeat(1001) },
    });
    expect(await note.json()).toEqual({ error: 'invalidInput', fields: { note: 'tooLong' } });
  });

  test('the list of costumes starts empty; a name is required, short, and a costume is moved', async ({
    playwright,
    request,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    expect(await (await jibe.get('/api/costumes')).json()).toEqual([]);

    for (const [name, problem] of [
      ['  ', 'required'],
      ['x'.repeat(41), 'tooLong'],
    ]) {
      const response = await jibe.post('/api/costumes', { data: { name } });
      expect(await response.json()).toEqual({ error: 'invalidInput', fields: { name: problem } });
    }

    const jungle = addCostume('Jungle');
    const glitter = addCostume('Paillettes');
    const moved = await jibe.put(`/api/costumes/${glitter}`, {
      data: { name: 'Paillettes', position: 1 },
    });
    expect((await moved.json()).map((costume: { name: string }) => costume.name)).toEqual([
      'Paillettes',
      'Jungle',
    ]);
    expect((await jibe.delete('/api/costumes/9999')).status()).toBe(404);

    // Without signing in, nothing of it.
    const { gigId, slotId } = addGig('Carnaval');
    for (const response of [
      await request.put(`/api/gigs/${gigId}/slots/${slotId}`, { data: { name: 'Samedi' } }),
      await request.put(`/api/gigs/${gigId}/slots/${slotId}/answers/${memberId('Zaza')}`, {
        data: { answer: 'YES' },
      }),
      await request.put(`/api/costumes/${jungle}`, { data: { name: 'Autre' } }),
      await request.delete(`/api/costumes/${jungle}`),
    ]) {
      expect(response.status(), response.url()).toBe(401);
    }
    expect(sql('SELECT COUNT(*) FROM costume')).toBe('2');
  });
});

test.describe('the picture of a costume', () => {
  const picture = (width: number, height = width) => ({
    data: { image: png(width, height).toString('base64') },
  });

  test('only the admin gives, replaces and removes it; every member sees it', async ({
    playwright,
    request,
  }) => {
    const jungle = addCostume('Jungle');
    const { gigId } = addGig('Carnaval');
    sql(`INSERT INTO gigCostume (gigId, costumeId) VALUES (${gigId}, ${jungle})`);
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const gigi = await deviceOf(playwright, email('Gigi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const address = `/api/costumes/${jungle}/picture`;

    // Who manages gigs does not manage costumes; nobody without signing in.
    expect((await gigi.put(address, picture(64))).status()).toBe(403);
    expect((await gigi.delete(address)).status()).toBe(403);
    expect((await request.put(address, picture(64))).status()).toBe(401);
    expect((await request.get(address)).status()).toBe(401);
    expect((await zaza.get(address)).status()).toBe(404);

    const given = await jibe.put(address, picture(64, 48));
    expect(given.status()).toBe(200);
    const [costume] = await given.json();
    expect(costume).toMatchObject({ name: 'Jungle', gigCount: 1 });
    expect(costume.pictureUrl).toMatch(new RegExp(`^/api/costumes/${jungle}/picture\\?v=`));
    expect(storedFiles('costumes')).toHaveLength(1);

    // Served to members only, and the gig names it.
    const served = await zaza.get(costume.pictureUrl);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('image/png');
    expect((await (await zaza.get(`/api/gigs/${gigId}`)).json()).costumes).toEqual([
      { id: jungle, name: 'Jungle', pictureUrl: costume.pictureUrl },
    ]);

    // Replacing leaves one file; removing leaves none.
    await jibe.put(address, picture(32));
    expect(storedFiles('costumes')).toHaveLength(1);
    expect((await (await jibe.delete(address)).json())[0].pictureUrl).toBeNull();
    expect(storedFiles('costumes')).toEqual([]);
    expect((await jibe.put('/api/costumes/9999/picture', picture(64))).status()).toBe(404);
  });

  test('what is not a small enough image is refused, and a deleted costume takes its file with it', async ({
    playwright,
  }) => {
    const free = addCostume('Libre');
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const address = `/api/costumes/${free}/picture`;

    for (const image of [
      Buffer.from('not an image').toString('base64'),
      png(8).toString('base64'),
      png(1201, 16).toString('base64'),
      '***',
    ]) {
      const refused = await jibe.put(address, { data: { image } });
      expect(await refused.json()).toEqual({
        error: 'invalidInput',
        fields: { picture: 'invalid' },
      });
    }
    expect(storedFiles('costumes')).toEqual([]);

    await jibe.put(address, picture(64));
    expect(storedFiles('costumes')).toHaveLength(1);
    expect((await jibe.delete(`/api/costumes/${free}`)).status()).toBe(200);
    expect(storedFiles('costumes')).toEqual([]);
  });
});

test.describe('the reminders of the band', () => {
  test('only the admin sets them, within the bounds of the model', async ({
    playwright,
    request,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const gigi = await deviceOf(playwright, email('Gigi'));
    const reminders = (data: Record<string, unknown>) => ({ data });

    // Install gives the defaults: 15 days, 5 days, from 18.
    expect(await (await jibe.get('/api/band/gigReminders')).json()).toEqual({
      gigFirstReminderDays: 15,
      gigSecondReminderDays: 5,
      gigReminderHour: 18,
    });
    // Read by who sets them only: the public answer of the band does not hold them.
    expect((await gigi.get('/api/band/gigReminders')).status()).toBe(403);
    expect((await request.get('/api/band/gigReminders')).status()).toBe(401);
    expect(await (await request.get('/api/band')).json()).not.toHaveProperty('gigReminderHour');
    const asked = reminders({
      gigFirstReminderDays: 10,
      gigSecondReminderDays: 2,
      gigReminderHour: 9,
    });
    expect((await gigi.put('/api/band/gigReminders', asked)).status()).toBe(403);
    expect((await request.put('/api/band/gigReminders', asked)).status()).toBe(401);

    expect(await (await jibe.put('/api/band/gigReminders', asked)).json()).toMatchObject(
      asked.data,
    );
    // A number of days left out: this reminder is not sent.
    const none = await jibe.put('/api/band/gigReminders', reminders({ gigReminderHour: 0 }));
    expect(await none.json()).toMatchObject({
      gigFirstReminderDays: null,
      gigSecondReminderDays: null,
      gigReminderHour: 0,
    });

    const faults: [Record<string, unknown>, string][] = [
      [{ gigFirstReminderDays: 0, gigReminderHour: 18 }, 'gigFirstReminderDays'],
      [{ gigFirstReminderDays: 91, gigReminderHour: 18 }, 'gigFirstReminderDays'],
      [{ gigSecondReminderDays: 0, gigReminderHour: 18 }, 'gigSecondReminderDays'],
      // The second reminder comes after the first.
      [
        { gigFirstReminderDays: 5, gigSecondReminderDays: 5, gigReminderHour: 18 },
        'gigSecondReminderDays',
      ],
      [{ gigFirstReminderDays: 5, gigReminderHour: 24 }, 'gigReminderHour'],
    ];
    for (const [data, field] of faults) {
      const refused = await jibe.put('/api/band/gigReminders', reminders(data));
      expect(await refused.json(), JSON.stringify(data)).toEqual({
        error: 'invalidInput',
        fields: { [field]: 'invalid' },
      });
    }
    expect(
      sql('SELECT gigFirstReminderDays, gigSecondReminderDays, gigReminderHour FROM band'),
    ).toBe('NULL\tNULL\t0');
  });
});
