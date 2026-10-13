import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addGig, addSetlist, addSong, day } from '../support/gigs.ts';
import { addMember, admin, deviceOf, install } from '../support/scenario.ts';

// The setlists of a gig and their live session. Rules: model/gigs.md, entry 4.
// The songs and the gigs are examples; nobody here is real.

// The band: Jibé the admin, Zaza a member, Sissi who manages setlists, Gigi
// who manages gigs.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sissi', roles: ['SETLIST_MANAGER'] });
  addMember({ nickname: 'Gigi', roles: ['GIG_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const confirmed = (name = 'Carnaval', slots?: string[]) =>
  addGig(name, { status: 'CONFIRMED', startsOn: day(3), slots });
const songsOf = (setlistId: number) =>
  sql(`SELECT songId FROM setlistSong WHERE setlistId = ${setlistId} ORDER BY position`);

test.describe('writing a setlist', () => {
  test('who manages setlists writes one: numbered by the app, its songs in order, one twice', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const [toxic, valerie] = [addSong('Toxic'), addSong('Valerie', 'TEMPORARY')];

    const created = await sissi.post(`/api/gigs/${gigId}/setlists`, {
      data: { description: '  Parade, 45 minutes ', songIds: [toxic, valerie, toxic] },
    });
    expect(created.status()).toBe(201);
    const gig = await created.json();
    expect(gig.setlists).toEqual([
      {
        id: expect.any(Number),
        gigId,
        // The only slot of the gig: not asked.
        gigSlotId: slotId,
        number: 1,
        description: 'Parade, 45 minutes',
        liveStartedAt: null,
        livePosition: null,
        songs: [
          { position: 1, songId: toxic, name: 'Toxic' },
          { position: 2, songId: valerie, name: 'Valerie' },
          { position: 3, songId: toxic, name: 'Toxic' },
        ],
      },
    ]);

    // Saved again: the songs are replaced, the number stays.
    const setlistId = gig.setlists[0].id;
    const saved = await sissi.put(`/api/setlists/${setlistId}`, { data: { songIds: [valerie] } });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).setlists[0]).toMatchObject({ number: 1, description: null });
    expect(songsOf(setlistId)).toBe(String(valerie));
  });

  test('setlists are numbered within their gig, and a deleted one does not renumber the others', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const first = confirmed('Carnaval');
    const second = confirmed('Fête de la soupe');
    const write = async (gigId: number) =>
      (await (await sissi.post(`/api/gigs/${gigId}/setlists`, { data: { songIds: [] } })).json())
        .setlists;

    await write(first.gigId);
    const two = await write(first.gigId);
    expect(two.map((one: { number: number }) => one.number)).toEqual([1, 2]);
    expect((await write(second.gigId))[0].number).toBe(1);

    const deleted = await sissi.delete(`/api/setlists/${two[0].id}`);
    expect((await deleted.json()).setlists.map((one: { number: number }) => one.number)).toEqual([
      2,
    ]);
    expect((await write(first.gigId)).map((one: { number: number }) => one.number)).toEqual([2, 3]);
  });

  test('a gig of several slots asks which slot, and takes one of its own only', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotIds } = confirmed('Fête des Lumières', ['Vendredi soir', 'Samedi midi']);
    const other = confirmed('Carnaval');

    const without = await sissi.post(`/api/gigs/${gigId}/setlists`, { data: { songIds: [] } });
    expect(without.status()).toBe(422);
    expect((await without.json()).fields).toEqual({ gigSlotId: 'required' });
    const foreign = await sissi.post(`/api/gigs/${gigId}/setlists`, {
      data: { songIds: [], gigSlotId: other.slotId },
    });
    expect((await foreign.json()).fields).toEqual({ gigSlotId: 'invalid' });

    const created = await sissi.post(`/api/gigs/${gigId}/setlists`, {
      data: { songIds: [], gigSlotId: slotIds[1] },
    });
    expect((await created.json()).setlists[0].gigSlotId).toBe(slotIds[1]);
  });

  test('only a song the band plays is added; one already in the setlist stays whatever it became', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const refusedSongs = [addSong('Bella Ciao', 'PROPOSED'), addSong('Crazy', 'ABANDONED'), 9999];

    for (const songId of refusedSongs) {
      const refused = await sissi.post(`/api/gigs/${gigId}/setlists`, {
        data: { songIds: [toxic, songId] },
      });
      expect(refused.status(), String(songId)).toBe(422);
      expect((await refused.json()).fields).toEqual({ songIds: 'invalid' });
    }
    expect(sql('SELECT COUNT(*) FROM setlist')).toBe('0');

    const setlistId = addSetlist(gigId, slotId, [toxic]);
    sql(`UPDATE song SET status = 'ABANDONED' WHERE id = ${toxic}`);
    const kept = await sissi.put(`/api/setlists/${setlistId}`, {
      data: { songIds: [toxic, toxic] },
    });
    expect(kept.status()).toBe(200);
    expect(songsOf(setlistId)).toBe(`${toxic}\n${toxic}`);

    const long = await sissi.put(`/api/setlists/${setlistId}`, {
      data: { songIds: [], description: 'x'.repeat(61) },
    });
    expect((await long.json()).fields).toEqual({ description: 'tooLong' });
  });

  test('setlists exist from “Validé” on: not written before, not shown before', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const accepted = addGig('Carnaval', { status: 'ACCEPTED', startsOn: day(3) });
    const refused = await sissi.post(`/api/gigs/${accepted.gigId}/setlists`, {
      data: { songIds: [] },
    });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'gigNotConfirmed' });

    // A gig cancelled after its setlist was written keeps it, hidden.
    const { gigId, slotId } = confirmed('Fête de la soupe');
    const setlistId = addSetlist(gigId, slotId, [addSong('Toxic')]);
    expect((await (await zaza.get(`/api/gigs/${gigId}`)).json()).setlists).toHaveLength(1);
    expect((await zaza.get(`/api/setlists/${setlistId}`)).status()).toBe(200);
    sql(`UPDATE gig SET status = 'CANCELLED' WHERE id = ${gigId}`);
    expect((await (await zaza.get(`/api/gigs/${gigId}`)).json()).setlists).toEqual([]);
    expect((await zaza.get(`/api/setlists/${setlistId}`)).status()).toBe(404);
    // A past gig is still confirmed: its setlists say what was played.
    sql(`UPDATE gig SET status = 'CONFIRMED', startsOn = '${day(-30)}' WHERE id = ${gigId}`);
    expect((await (await zaza.get(`/api/gigs/${gigId}`)).json()).setlists).toHaveLength(1);
  });

  test('a slot that has setlists is not deleted', async ({ playwright }) => {
    const gigi = await deviceOf(playwright, email('Gigi'));
    const { gigId, slotIds } = confirmed('Fête des Lumières', ['Vendredi soir', 'Samedi midi']);
    addSetlist(gigId, slotIds[1] as number, []);

    const refused = await gigi.delete(`/api/gigs/${gigId}/slots/${slotIds[1]}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'slotHasSetlists' });
    expect((await gigi.delete(`/api/gigs/${gigId}/slots/${slotIds[0]}`)).status()).toBe(200);
  });
});

test.describe('the live setlist', () => {
  test('started on its first song, moved song by song or corrected, then ended', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, [
      addSong('Toxic'),
      addSong('Valerie'),
      addSong('Crazy'),
    ]);
    const live = `/api/setlists/${setlistId}/live`;

    // Not live yet: nothing to move.
    const early = await sissi.put(live, { data: { position: 2 } });
    expect(early.status()).toBe(409);
    expect(await early.json()).toEqual({ error: 'setlistNotLive' });

    const started = await (await sissi.post(live)).json();
    expect(started).toMatchObject({ id: setlistId, livePosition: 1 });
    expect(started.liveStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // Pressed again: it stays where it is.
    await sissi.put(live, { data: { position: 3 } });
    expect((await (await sissi.post(live)).json()).livePosition).toBe(3);
    // Back, to correct.
    expect((await (await sissi.put(live, { data: { position: 2 } })).json()).livePosition).toBe(2);
    // Never beyond the first or the last song.
    for (const position of [0, 4]) {
      const beyond = await sissi.put(live, { data: { position } });
      expect(beyond.status()).toBe(422);
      expect((await beyond.json()).fields).toEqual({ position: 'invalid' });
    }

    // Every member reads where the band is.
    expect(await (await zaza.get(`/api/setlists/${setlistId}`)).json()).toMatchObject({
      livePosition: 2,
      gigName: 'Carnaval',
      songs: [{ name: 'Toxic' }, { name: 'Valerie' }, { name: 'Crazy' }],
    });

    const ended = await (await sissi.delete(live)).json();
    expect(ended).toMatchObject({ liveStartedAt: null, livePosition: null });
  });

  test('one setlist at most is live in the band: starting one ends the other', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const [first, second] = [
      addSetlist(gigId, slotId, [toxic]),
      addSetlist(gigId, slotId, [toxic]),
    ];

    await sissi.post(`/api/setlists/${first}/live`);
    await sissi.post(`/api/setlists/${second}/live`);
    expect(sql('SELECT id FROM setlist WHERE liveStartedAt IS NOT NULL')).toBe(String(second));

    // A setlist without a song has nothing to play.
    const empty = await sissi.post(`/api/setlists/${addSetlist(gigId, slotId, [])}/live`);
    expect(empty.status()).toBe(409);
    expect(await empty.json()).toEqual({ error: 'emptySetlist' });
    expect(sql('SELECT id FROM setlist WHERE liveStartedAt IS NOT NULL')).toBe(String(second));
  });

  test('two managers who start two setlists at the same instant: one is live, the other ended cleanly', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const [first, second] = [
      addSetlist(gigId, slotId, [toxic, toxic]),
      addSetlist(gigId, slotId, [toxic, toxic]),
    ];

    // Several rounds: the order in which the two requests reach the server changes.
    for (let round = 0; round < 8; round++) {
      const answers = await Promise.all([
        sissi.post(`/api/setlists/${first}/live`),
        jibe.post(`/api/setlists/${second}/live`),
      ]);
      // Neither fails nor waits for ever, and each answers a setlist that is whole.
      expect(answers.map((answer) => answer.status())).toEqual([200, 200]);
      // Exactly one is live, on its first song; the other has no trace of a live left.
      const rows = sql(
        'SELECT id, liveStartedAt IS NOT NULL, IFNULL(livePosition, 0) FROM setlist ORDER BY id',
      ).split('\n');
      const live = rows.filter((row) => row.split('\t')[1] === '1');
      expect(live).toHaveLength(1);
      expect(live[0]?.split('\t')[2]).toBe('1');
      expect(
        rows.filter((row) => row.split('\t')[1] === '0').every((row) => row.endsWith('\t0')),
      ).toBe(true);
      // Who lost is told so by the answer of the setlist, read afterwards.
      const ended = rows.find((row) => row.split('\t')[1] === '0')?.split('\t')[0];
      const read = await sissi.get(`/api/setlists/${ended}`);
      expect((await read.json()).liveStartedAt).toBeNull();
      await sissi.delete(`/api/setlists/${first}/live`);
      await jibe.delete(`/api/setlists/${second}/live`);
    }
  });

  test('a live setlist that is edited keeps its position, never beyond its last song', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const [toxic, valerie, crazy] = [addSong('Toxic'), addSong('Valerie'), addSong('Crazy')];
    const setlistId = addSetlist(gigId, slotId, [toxic, valerie, crazy]);
    await sissi.post(`/api/setlists/${setlistId}/live`);
    await sissi.put(`/api/setlists/${setlistId}/live`, { data: { position: 3 } });

    await sissi.put(`/api/setlists/${setlistId}`, {
      data: { songIds: [crazy, toxic, valerie, toxic] },
    });
    expect(sql(`SELECT livePosition FROM setlist WHERE id = ${setlistId}`)).toBe('3');
    await sissi.put(`/api/setlists/${setlistId}`, { data: { songIds: [toxic] } });
    expect(sql(`SELECT livePosition FROM setlist WHERE id = ${setlistId}`)).toBe('1');
    await sissi.put(`/api/setlists/${setlistId}`, { data: { songIds: [] } });
    expect(sql(`SELECT livePosition, liveStartedAt FROM setlist WHERE id = ${setlistId}`)).toBe(
      'NULL\tNULL',
    );
  });
});

test.describe('rights', () => {
  test('a member, and who manages gigs, read the setlists and change nothing', async ({
    playwright,
    request,
  }) => {
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const setlistId = addSetlist(gigId, slotId, [toxic]);
    const writes = [
      ['post', `/api/gigs/${gigId}/setlists`, { songIds: [toxic] }],
      ['put', `/api/setlists/${setlistId}`, { songIds: [] }],
      ['delete', `/api/setlists/${setlistId}`, undefined],
      ['post', `/api/setlists/${setlistId}/live`, undefined],
      ['put', `/api/setlists/${setlistId}/live`, { position: 1 }],
      ['delete', `/api/setlists/${setlistId}/live`, undefined],
    ] as const;

    for (const nickname of ['Zaza', 'Gigi']) {
      const device = await deviceOf(playwright, email(nickname));
      expect((await device.get(`/api/setlists/${setlistId}`)).status(), nickname).toBe(200);
      for (const [method, address, data] of writes) {
        const refused = await device[method](address, { data });
        expect(refused.status(), `${nickname} ${method} ${address}`).toBe(403);
      }
    }
    for (const [method, address, data] of writes) {
      expect((await request[method](address, { data })).status(), address).toBe(401);
    }
    expect((await request.get(`/api/setlists/${setlistId}`)).status()).toBe(401);
    expect(sql('SELECT COUNT(*), MAX(liveStartedAt) FROM setlist')).toBe('1\tNULL');
    expect(songsOf(setlistId)).toBe(String(toxic));
  });

  test('the admin does everything who manages setlists does', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const { gigId } = confirmed();
    const created = await jibe.post(`/api/gigs/${gigId}/setlists`, {
      data: { songIds: [addSong('Toxic')] },
    });
    expect(created.status()).toBe(201);
    const setlistId = (await created.json()).setlists[0].id;
    expect((await jibe.post(`/api/setlists/${setlistId}/live`)).status()).toBe(200);
    expect((await jibe.delete(`/api/setlists/${setlistId}`)).status()).toBe(200);
  });

  test('a setlist of a gig that is not confirmed is hidden from who manages setlists too', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const setlistId = addSetlist(gigId, slotId, [toxic]);
    const other = confirmed('Fête de la soupe');
    const playing = addSetlist(other.gigId, other.slotId, [toxic]);
    await sissi.post(`/api/setlists/${playing}/live`);

    for (const status of ['DRAFT', 'PROPOSED', 'ACCEPTED', 'CANCELLED']) {
      sql(`UPDATE gig SET status = '${status}' WHERE id = ${gigId}`);
      for (const [method, address, data] of [
        ['post', `/api/setlists/${setlistId}/live`, undefined],
        ['put', `/api/setlists/${setlistId}/live`, { position: 1 }],
        ['delete', `/api/setlists/${setlistId}/live`, undefined],
        ['delete', `/api/setlists/${setlistId}`, undefined],
      ] as const) {
        const hidden = await sissi[method](address, { data });
        expect(hidden.status(), `${status} ${method} ${address}`).toBe(404);
        expect(await hidden.json()).toEqual({ error: 'notFound' });
      }
      const edited = await sissi.put(`/api/setlists/${setlistId}`, { data: { songIds: [] } });
      // A draft does not exist for who cannot edit the gig; the others say why.
      expect(edited.status(), status).toBe(status === 'DRAFT' ? 404 : 409);
      const added = await sissi.post(`/api/gigs/${gigId}/setlists`, { data: { songIds: [] } });
      expect(added.status(), status).toBe(status === 'DRAFT' ? 404 : 409);
    }
    // Nothing moved: the setlist is there, and the one being played still is.
    expect(songsOf(setlistId)).toBe(String(toxic));
    expect(sql('SELECT id FROM setlist WHERE liveStartedAt IS NOT NULL')).toBe(String(playing));
  });

  test('a gig that is cancelled ends its live setlist; starting one in another gig ends the first', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const gigi = await deviceOf(playwright, email('Gigi'));
    const first = confirmed();
    const second = confirmed('Fête de la soupe');
    const toxic = addSong('Toxic');
    const [one, two] = [
      addSetlist(first.gigId, first.slotId, [toxic]),
      addSetlist(second.gigId, second.slotId, [toxic]),
    ];
    await sissi.post(`/api/setlists/${one}/live`);
    expect((await sissi.post(`/api/setlists/${two}/live`)).status()).toBe(200);
    expect(sql('SELECT id FROM setlist WHERE liveStartedAt IS NOT NULL')).toBe(String(two));

    const cancelled = await gigi.put(`/api/gigs/${second.gigId}/status`, {
      data: { status: 'CANCELLED' },
    });
    expect(cancelled.status()).toBe(200);
    expect(sql('SELECT COUNT(*) FROM setlist WHERE liveStartedAt IS NOT NULL')).toBe('0');
    expect(sql('SELECT COUNT(*) FROM setlist')).toBe('2');
  });

  test('a song used by a setlist is not deleted', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const { gigId, slotId } = confirmed();
    const [toxic, valerie] = [addSong('Toxic'), addSong('Valerie')];
    addSetlist(gigId, slotId, [toxic]);

    const refused = await jibe.delete(`/api/songs/${toxic}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'songInSetlist' });
    expect((await jibe.delete(`/api/songs/${valerie}`)).status()).toBe(200);
    expect(sql('SELECT name FROM song')).toBe('Toxic');
  });

  test('a setlist holds 100 songs at most, and a position is a whole number', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const { gigId, slotId } = confirmed();
    const toxic = addSong('Toxic');
    const many = await sissi.post(`/api/gigs/${gigId}/setlists`, {
      data: { songIds: Array(101).fill(toxic) },
    });
    expect(many.status()).toBe(422);
    expect((await many.json()).fields).toEqual({ songIds: 'tooMany' });

    const setlistId = addSetlist(gigId, slotId, [toxic, toxic]);
    await sissi.post(`/api/setlists/${setlistId}/live`);
    for (const data of [{}, { position: 'deux' }, { position: 1.5 }]) {
      expect((await sissi.put(`/api/setlists/${setlistId}/live`, { data })).status()).toBe(422);
    }
    expect(
      sql(
        `SELECT livePosition, updatedByMemberId IS NOT NULL FROM setlist WHERE id = ${setlistId}`,
      ),
    ).toBe('1\t1');
  });

  test('the setlist of a draft does not exist for who cannot edit the gig', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const { gigId, slotId } = confirmed();
    const setlistId = addSetlist(gigId, slotId, []);
    sql(`UPDATE gig SET status = 'DRAFT' WHERE id = ${gigId}`);
    expect((await zaza.get(`/api/setlists/${setlistId}`)).status()).toBe(404);
    expect((await zaza.get('/api/setlists/9999')).status()).toBe(404);
  });
});
