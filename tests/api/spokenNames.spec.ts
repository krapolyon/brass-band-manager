import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addSong } from '../support/gigs.ts';
import { addMember, admin, deviceOf, install } from '../support/scenario.ts';

// What the dictation of a setlist learned for a song. Rules: model/songs.md,
// entry 4. The songs and the phrases are examples; nobody here is real.

// The band: Jibé the admin, Zaza a member, Sissi who manages setlists, Momo
// who manages songs.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sissi', roles: ['SETLIST_MANAGER'] });
  addMember({ nickname: 'Momo', roles: ['SONG_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const phrasesOf = (songId: number) =>
  sql(`SELECT phrase FROM songSpokenName WHERE songId = ${songId} ORDER BY id`);

test.describe('learning by dictating', () => {
  test('a phrase is cleaned, learned for the song chosen, and read back for the dictation', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const seven = addSong('Seven Nation');
    const dance = addSong('Dance');
    addSong('Vieux truc', 'ABANDONED');

    const learned = await sissi.post(`/api/songs/${seven}/spokenNames/learned`, {
      data: { phrase: '  Séven   Nation-Armée ! ' },
    });
    expect(learned.status()).toBe(200);
    expect(await learned.json()).toEqual([{ songId: seven, phrases: ['seven nation armee'] }]);

    // Letters said one by one are joined; the name of the song itself is never saved.
    await sissi.post(`/api/songs/${dance}/spokenNames/learned`, { data: { phrase: 'd a n c e' } });
    expect(phrasesOf(dance)).toBe('');
    await sissi.post(`/api/songs/${dance}/spokenNames/learned`, {
      data: { phrase: 'the d a n s' },
    });
    expect(phrasesOf(dance)).toBe('the dans');
    // Learned twice, kept once.
    await sissi.post(`/api/songs/${dance}/spokenNames/learned`, { data: { phrase: 'The Dans' } });
    expect(phrasesOf(dance)).toBe('the dans');

    const read = await sissi.get('/api/spokenNames');
    expect(await read.json()).toEqual([
      { songId: seven, phrases: ['seven nation armee'] },
      { songId: dance, phrases: ['the dans'] },
    ]);
  });

  test('one phrase names one song: learned for another, it moves', async ({ playwright }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const crazy = addSong('Crazy');
    const crazyInLove = addSong('Crazy in Love');

    await sissi.post(`/api/songs/${crazyInLove}/spokenNames/learned`, {
      data: { phrase: 'craisy' },
    });
    await sissi.post(`/api/songs/${crazy}/spokenNames/learned`, { data: { phrase: 'craisy' } });
    expect(phrasesOf(crazyInLove)).toBe('');
    expect(phrasesOf(crazy)).toBe('craisy');
  });

  test('20 phrases per song at most: one more drops the oldest', async ({ playwright }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const toxic = addSong('Toxic');
    for (let index = 1; index <= 21; index++) {
      const answer = await sissi.post(`/api/songs/${toxic}/spokenNames/learned`, {
        data: { phrase: `toxique ${index}` },
      });
      expect(answer.status()).toBe(200);
    }
    const kept = phrasesOf(toxic).split('\n');
    expect(kept).toHaveLength(20);
    expect(kept[0]).toBe('toxique 2');
    expect(kept[19]).toBe('toxique 21');
  });

  test('a phrase is 2 to 60 characters; only a song a setlist can hold learns one', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const toxic = addSong('Toxic');
    const old = addSong('Vieux truc', 'ABANDONED');
    const learn = (songId: number, phrase: unknown) =>
      sissi.post(`/api/songs/${songId}/spokenNames/learned`, { data: { phrase } });

    for (const [phrase, problem] of [
      ['  !! ', 'required'],
      ['x', 'tooShort'],
      [`${'a'.repeat(30)} ${'b'.repeat(30)}`, 'tooLong'],
    ]) {
      const refused = await learn(toxic, phrase);
      expect(refused.status()).toBe(422);
      expect((await refused.json()).fields).toEqual({ phrase: problem });
    }
    expect((await learn(toxic, 12)).status()).toBe(422);
    expect((await learn(old, 'vieux machin')).status()).toBe(409);
    expect((await learn(9999, 'rien')).status()).toBe(404);
    expect(sql('SELECT COUNT(*) FROM songSpokenName')).toBe('0');
  });
});

test.describe('the phrases of a song, in its form', () => {
  test('who manages songs lists them, adds one, deletes one; taken by another song, it asks first', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const crazy = addSong('Crazy');
    const old = addSong('Vieux truc', 'ABANDONED');

    expect(await (await momo.get(`/api/songs/${crazy}/spokenNames`)).json()).toEqual([]);
    const added = await momo.post(`/api/songs/${crazy}/spokenNames`, { data: { phrase: 'Crésy' } });
    expect(added.status()).toBe(200);
    const [first] = await added.json();
    expect(first.phrase).toBe('cresy');

    // A song of any status has phrases edited by hand.
    const taken = await momo.post(`/api/songs/${old}/spokenNames`, { data: { phrase: 'cresy' } });
    expect(taken.status()).toBe(422);
    expect((await taken.json()).fields).toEqual({
      phrase: 'phraseTaken',
      takenBySongId: String(crazy),
    });
    expect(phrasesOf(crazy)).toBe('cresy');
    const moved = await momo.post(`/api/songs/${old}/spokenNames`, {
      data: { phrase: 'cresy', moves: true },
    });
    expect((await moved.json()).map((one: { phrase: string }) => one.phrase)).toEqual(['cresy']);
    expect(phrasesOf(crazy)).toBe('');

    const kept = await moved.json();
    const deleted = await momo.delete(`/api/songSpokenNames/${kept[0].id}`);
    expect(await deleted.json()).toEqual([]);
    expect((await momo.delete(`/api/songSpokenNames/${kept[0].id}`)).status()).toBe(404);
    expect((await momo.get('/api/songs/9999/spokenNames')).status()).toBe(404);
  });

  test('deleting a song deletes its phrases; a change of status keeps them', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const crazy = addSong('Crazy');
    await momo.post(`/api/songs/${crazy}/spokenNames`, { data: { phrase: 'cresy' } });
    await momo.put(`/api/songs/${crazy}/status`, { data: { status: 'ABANDONED' } });
    expect(phrasesOf(crazy)).toBe('cresy');
    expect((await momo.delete(`/api/songs/${crazy}`)).ok()).toBe(true);
    expect(sql('SELECT COUNT(*) FROM songSpokenName')).toBe('0');
  });
});

test.describe('rights', () => {
  test('a member sees and learns nothing', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const toxic = addSong('Toxic');
    sql(`INSERT INTO songSpokenName (songId, phrase) VALUES (${toxic}, 'toxique')`);
    const id = sql('SELECT id FROM songSpokenName');

    expect((await zaza.get('/api/spokenNames')).status()).toBe(403);
    expect((await zaza.get(`/api/songs/${toxic}/spokenNames`)).status()).toBe(403);
    const data = { phrase: 'toc sic' };
    expect((await zaza.post(`/api/songs/${toxic}/spokenNames/learned`, { data })).status()).toBe(
      403,
    );
    expect((await zaza.post(`/api/songs/${toxic}/spokenNames`, { data })).status()).toBe(403);
    expect((await zaza.delete(`/api/songSpokenNames/${id}`)).status()).toBe(403);
    expect(phrasesOf(toxic)).toBe('toxique');
    // The song itself says nothing of them.
    expect(JSON.stringify(await (await zaza.get(`/api/songs/${toxic}`)).json())).not.toContain(
      'toxique',
    );
  });

  test('who manages setlists reads and learns, and edits nothing by hand; who manages songs the reverse', async ({
    playwright,
  }) => {
    const sissi = await deviceOf(playwright, email('Sissi'));
    const momo = await deviceOf(playwright, email('Momo'));
    const toxic = addSong('Toxic');
    sql(`INSERT INTO songSpokenName (songId, phrase) VALUES (${toxic}, 'toxique')`);
    const id = sql('SELECT id FROM songSpokenName');
    const data = { phrase: 'toc sic' };

    expect((await sissi.get('/api/spokenNames')).status()).toBe(200);
    expect((await sissi.get(`/api/songs/${toxic}/spokenNames`)).status()).toBe(403);
    expect((await sissi.post(`/api/songs/${toxic}/spokenNames`, { data })).status()).toBe(403);
    expect((await sissi.delete(`/api/songSpokenNames/${id}`)).status()).toBe(403);

    expect((await momo.get('/api/spokenNames')).status()).toBe(403);
    expect((await momo.post(`/api/songs/${toxic}/spokenNames/learned`, { data })).status()).toBe(
      403,
    );
    expect((await momo.get(`/api/songs/${toxic}/spokenNames`)).status()).toBe(200);
    expect(phrasesOf(toxic)).toBe('toxique');
  });

  test('the admin does both; nobody signed out does anything', async ({ playwright, request }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const toxic = addSong('Toxic');
    const data = { phrase: 'toc sic' };
    expect((await jibe.post(`/api/songs/${toxic}/spokenNames/learned`, { data })).status()).toBe(
      200,
    );
    expect(
      (
        await jibe.post(`/api/songs/${toxic}/spokenNames`, { data: { phrase: 'toxique' } })
      ).status(),
    ).toBe(200);
    expect(phrasesOf(toxic)).toBe('toc sic\ntoxique');

    expect((await request.get('/api/spokenNames')).status()).toBe(401);
    expect((await request.get(`/api/songs/${toxic}/spokenNames`)).status()).toBe(401);
  });
});
