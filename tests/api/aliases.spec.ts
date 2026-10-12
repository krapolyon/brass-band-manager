import { type APIRequestContext, expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, deviceOf, install, signIn } from '../support/scenario.ts';
import { instrumentId } from '../support/songFiles.ts';

// The known spellings of the instruments (aliases), and the names of the
// tracks of a MIDI file read with them. Each test is a line of model/songs.md,
// entry 2: "Access rights", "Managing the aliases", "Reading the name of a
// file" and "Reading the name of a track". Nobody here is real.

// The band of these tests: Jibé the admin (installed), Zaza a plain member,
// Sisi who manages songs. Installed with Trompette, Sax Alto, Sax Ténor and
// Souba, each with the aliases of the starting library.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const aliasesOf = (instrument: string) =>
  sql(
    `SELECT a.alias FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId
     WHERE i.name = '${instrument}' ORDER BY a.alias`,
  ).split('\n');
const aliasId = (alias: string) =>
  Number(sql(`SELECT id FROM instrumentAlias WHERE alias = '${alias}'`));
const everyAlias = () => sql('SELECT alias FROM instrumentAlias ORDER BY alias');
const add = (request: APIRequestContext, instrument: string, data: object) =>
  request.post(`/api/instruments/${instrumentId(instrument)}/aliases`, { data });

test.describe('who may do what', () => {
  test('nothing about aliases is answered or changed without signing in', async ({ request }) => {
    const before = everyAlias();
    const responses = [
      await request.get('/api/instrumentAliases'),
      await add(request, 'Souba', { alias: 'gros tuyau' }),
      await request.delete(`/api/instrumentAliases/${aliasId('tp')}`),
      await request.post('/api/songs/trackNames', { data: { names: ['Trompette'] } }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(401);
      expect(await response.json()).toEqual({ error: 'notSignedIn' });
    }
    expect(everyAlias()).toBe(before);
  });

  test('a member who does not manage songs neither sees, adds nor deletes an alias', async ({
    request,
  }) => {
    await signIn(request, email('Zaza'));
    const before = everyAlias();

    const refused = [
      await request.get('/api/instrumentAliases'),
      await add(request, 'Souba', { alias: 'gros tuyau' }),
      await request.delete(`/api/instrumentAliases/${aliasId('tp')}`),
    ];
    for (const response of refused) {
      expect(response.status(), response.url()).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect(everyAlias()).toBe(before);
  });

  test('who manages songs lists the aliases, adds one and deletes one; so does an admin', async ({
    playwright,
  }) => {
    const devices = [
      await deviceOf(playwright, email('Sisi')),
      await deviceOf(playwright, admin.email, admin.password),
    ];
    for (const [index, device] of devices.entries()) {
      const spelling = `gros tuyau ${index}`;

      const added = await add(device, 'Souba', { alias: spelling });
      expect(added.status()).toBe(200);
      const souba = await added.json();
      expect(souba).toMatchObject({ id: instrumentId('Souba'), name: 'Souba' });
      expect(souba.aliases).toContainEqual({ id: aliasId(spelling), alias: spelling });

      const listed = await device.get('/api/instrumentAliases');
      expect(listed.status()).toBe(200);
      expect((await listed.json()).at(-1)).toEqual(souba);

      const deleted = await device.delete(`/api/instrumentAliases/${aliasId(spelling)}`);
      expect(deleted.status()).toBe(200);
      expect((await deleted.json()).aliases).not.toContainEqual(
        expect.objectContaining({ alias: spelling }),
      );
      expect(aliasesOf('Souba')).not.toContain(spelling);
    }
  });

  test('any member asks which instrument the tracks of a MIDI file are', async ({ request }) => {
    await signIn(request, email('Zaza'));

    const response = await request.post('/api/songs/trackNames', {
      data: { names: ['Trompette'] },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([
      { name: 'Trompette', instrumentId: instrumentId('Trompette') },
    ]);
  });
});

test.describe('the list', () => {
  test('every instrument in the order of the band, each with its aliases from A to Z', async ({
    playwright,
  }) => {
    // An instrument without any alias is listed too, and the order is the one
    // of the sections, not the one of the ids.
    sql(`
      INSERT INTO instrument (sectionId, name, position) SELECT id, 'Bugle', 2 FROM section WHERE name = 'Trompette';
      UPDATE section SET position = 9 WHERE name = 'Saxophone';
    `);
    const sisi = await deviceOf(playwright, email('Sisi'));

    const list = await (await sisi.get('/api/instrumentAliases')).json();

    expect(list.map((instrument: { name: string }) => instrument.name)).toEqual([
      'Trompette',
      'Bugle',
      'Souba',
      'Sax Alto',
      'Sax Ténor',
    ]);
    expect(list[0]).toEqual({
      id: instrumentId('Trompette'),
      name: 'Trompette',
      aliases: ['cornet', 'tp', 'trompettes', 'trumpet'].map((alias) => ({
        id: aliasId(alias),
        alias,
      })),
    });
    expect(list[1].aliases).toEqual([]);
  });
});

test.describe('adding an alias', () => {
  test('an alias is cleaned before it is saved: lowercase, no accent, one space between words', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const cases: [string, string][] = [
      ['  Gros-TUYAU !! ', 'gros tuyau'],
      ['Hélicon   d’Été', 'helicon d ete'],
      // An accent written apart from its letter, as a Mac does in file names.
      ['Tuyáu_né', 'tuyau ne'],
      ['Sousa.Phone (n°2)', 'sousa phone n 2'],
    ];

    for (const [typed, saved] of cases) {
      const response = await add(sisi, 'Souba', { alias: typed });
      expect(response.status(), typed).toBe(200);
      expect((await response.json()).aliases, typed).toContainEqual({
        id: aliasId(saved),
        alias: saved,
      });
    }
    // Saved with who added it.
    expect(
      sql(
        `SELECT m.nickname FROM instrumentAlias a JOIN member m ON m.id = a.updatedByMemberId WHERE a.alias = 'gros tuyau'`,
      ),
    ).toBe('Sisi');
  });

  test('with the name of the song, its words are left out of the name of the file', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));

    const response = await add(sisi, 'Souba', {
      alias: 'Crazy_in_Love - Gros Tuyau v2',
      songName: 'Crazy in Løve',
    });

    expect(response.status()).toBe(200);
    expect(aliasesOf('Souba')).toContain('gros tuyau v2');
  });

  test('an alias with no letter and no digit, or with the words of the song only, is refused', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const before = everyAlias();

    const refused = [
      await add(sisi, 'Souba', { alias: ' -- !? ' }),
      await add(sisi, 'Souba', { alias: '' }),
      await add(sisi, 'Souba', { alias: 'Seven_Nation', songName: 'Seven Nation' }),
    ];
    for (const response of refused) {
      expect(response.status()).toBe(422);
      expect(await response.json()).toEqual({
        error: 'invalidInput',
        fields: { alias: 'required' },
      });
    }
    expect(everyAlias()).toBe(before);
  });

  test('an alias is 2 to 25 characters long, once cleaned', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));

    const short = await add(sisi, 'Souba', { alias: ' x. ' });
    expect(short.status()).toBe(422);
    expect((await short.json()).fields).toEqual({ alias: 'tooShort' });

    const long = await add(sisi, 'Souba', { alias: 'soubassophone tres grave x' });
    expect(long.status()).toBe(422);
    expect((await long.json()).fields).toEqual({ alias: 'tooLong' });

    // The limits themselves are accepted.
    expect((await add(sisi, 'Souba', { alias: 'zz' })).status()).toBe(200);
    expect((await add(sisi, 'Souba', { alias: 'soubassophone tres grave!' })).status()).toBe(200);
    expect(aliasesOf('Souba')).toEqual(expect.arrayContaining(['zz', 'soubassophone tres grave']));
  });

  test('an alias another instrument has is refused, and the refusal names that instrument', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const before = everyAlias();

    const response = await add(sisi, 'Souba', { alias: ' TP ' });

    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({
      error: 'invalidInput',
      fields: { alias: 'aliasTaken', takenByInstrumentId: String(instrumentId('Trompette')) },
    });
    expect(everyAlias()).toBe(before);
  });

  test('the name of an instrument cannot be given as an alias to another one', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const before = everyAlias();

    const response = await add(sisi, 'Souba', { alias: 'sax-tenor' });

    expect(response.status()).toBe(422);
    expect((await response.json()).fields).toEqual({
      alias: 'aliasTaken',
      takenByInstrumentId: String(instrumentId('Sax Ténor')),
    });
    expect(everyAlias()).toBe(before);
  });

  test('giving an instrument an alias it has, or its own name, changes nothing', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const before = everyAlias();

    for (const alias of ['SB', 'Soubassophone', 'souba', 'Sax Ténor']) {
      const instrument = alias === 'Sax Ténor' ? 'Sax Ténor' : 'Souba';
      const response = await add(sisi, instrument, { alias });
      expect(response.status(), alias).toBe(200);
      expect((await response.json()).id, alias).toBe(instrumentId(instrument));
    }
    expect(everyAlias()).toBe(before);
  });

  test('an instrument that does not exist, or a body of another shape, is refused', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const souba = instrumentId('Souba');
    const before = everyAlias();

    const unknown = await sisi.post('/api/instruments/999999/aliases', { data: { alias: 'zz' } });
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'notFound' });

    const shapes = [{}, { alias: 12 }, { alias: 'zz', songName: 3 }, { alias: 'zz', other: 'x' }];
    for (const data of shapes) {
      const response = await sisi.post(`/api/instruments/${souba}/aliases`, { data });
      expect(response.status(), JSON.stringify(data)).toBe(422);
      expect((await response.json()).error).toBe('invalidInput');
    }

    const form = await sisi.post(`/api/instruments/${souba}/aliases`, { form: { alias: 'zz' } });
    expect(form.status()).toBe(400);
    expect(everyAlias()).toBe(before);
  });
});

test.describe('deleting an alias', () => {
  test('a deleted alias is gone, and can then be given to another instrument', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));

    const deleted = await sisi.delete(`/api/instrumentAliases/${aliasId('tp')}`);
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: instrumentId('Trompette') });
    expect(aliasesOf('Trompette')).toEqual(['cornet', 'trompettes', 'trumpet']);

    expect((await add(sisi, 'Souba', { alias: 'tp' })).status()).toBe(200);
    expect(aliasesOf('Souba')).toContain('tp');
  });

  test('an alias that does not exist is not found', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const before = everyAlias();

    const response = await sisi.delete('/api/instrumentAliases/999999');

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'notFound' });
    expect(everyAlias()).toBe(before);
  });
});

test.describe('reading the name of a track', () => {
  test('a track is its instrument by name or alias; unknown, or two instruments, is nobody’s', async ({
    request,
  }) => {
    await signIn(request, email('Zaza'));
    const trumpet = instrumentId('Trompette');
    const souba = instrumentId('Souba');
    const alto = instrumentId('Sax Alto');
    const cases: [string, number | null][] = [
      ['Trompette', trumpet],
      ['TRUMPET 2', trumpet],
      ['Sousaphone', souba],
      ['Saxophone alto', alto],
      // The whole name is read: a dot does not start an extension.
      ['Tp.1', trumpet],
      ['Kazoo', null],
      ['', null],
      ['Trompette / Souba', null],
      // Two tracks can be the same instrument.
      ['Trompette', trumpet],
    ];

    const response = await request.post('/api/songs/trackNames', {
      data: { names: cases.map(([name]) => name) },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(
      cases.map(([name, instrument]) => ({ name, instrumentId: instrument })),
    );
  });

  test('the spelling with the most words wins, and a short one is not found inside a longer word', async ({
    request,
  }) => {
    // The examples of the dictionary: "trombone" alone is the Trombone Sib,
    // "trombone ut" the Trombone Ut; "tb" is not found in "tbut".
    sql(`
      INSERT INTO instrument (sectionId, name, position) SELECT MIN(id), 'Trombone Sib', 8 FROM section;
      INSERT INTO instrument (sectionId, name, position) SELECT MIN(id), 'Trombone Ut', 9 FROM section;
      INSERT INTO instrumentAlias (instrumentId, alias) SELECT id, 'trombone' FROM instrument WHERE name = 'Trombone Sib';
      INSERT INTO instrumentAlias (instrumentId, alias) SELECT id, 'tb' FROM instrument WHERE name = 'Trombone Sib';
      INSERT INTO instrumentAlias (instrumentId, alias) SELECT id, 'tbut' FROM instrument WHERE name = 'Trombone Ut';
    `);
    await signIn(request, email('Zaza'));
    const [sib, ut] = [instrumentId('Trombone Sib'), instrumentId('Trombone Ut')];

    const read = await request.post('/api/songs/trackNames', {
      data: { names: ['Trombone', 'Trombone Ut', 'Ut trombone 1', 'tb', 'TbUt'] },
    });

    expect(
      (await read.json()).map((track: { instrumentId: number }) => track.instrumentId),
    ).toEqual([sib, ut, ut, sib, ut]);
  });

  test('an alias added in the band settings reads tracks and files alike, until it is deleted', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const souba = instrumentId('Souba');
    const read = async () => [
      (await (await sisi.post('/api/songs/trackNames', { data: { names: ['Hélicon'] } })).json())[0]
        .instrumentId,
      (
        await (
          await sisi.post('/api/songs/fileNames', { data: { names: ['Crazy_helicon.pdf'] } })
        ).json()
      )[0].instrumentId,
    ];
    expect(await read()).toEqual([null, null]);

    await add(sisi, 'Souba', { alias: 'Hélicon' });
    expect(await read()).toEqual([souba, souba]);

    await sisi.delete(`/api/instrumentAliases/${aliasId('helicon')}`);
    expect(await read()).toEqual([null, null]);
  });

  test('too many names, or a name too long, is refused', async ({ request }) => {
    await signIn(request, email('Zaza'));

    const refused = [
      await request.post('/api/songs/trackNames', { data: { names: Array(101).fill('Souba') } }),
      await request.post('/api/songs/trackNames', { data: { names: ['x'.repeat(256)] } }),
      await request.post('/api/songs/trackNames', { data: { names: 'Souba' } }),
    ];
    for (const response of refused) {
      expect(response.status()).toBe(422);
      expect((await response.json()).error).toBe('invalidInput');
    }
  });
});
