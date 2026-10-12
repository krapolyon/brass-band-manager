import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { png } from '../support/images.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';
import {
  addSong,
  cover,
  instrumentId,
  m4a,
  midi,
  mp3,
  museScore,
  notSquare,
  pdf,
  sendFile,
  songRecord,
} from '../support/songFiles.ts';
import { emptyStorage, storedFiles } from '../support/storage.ts';

// Songs, their files, their parts and the levels members give them. Each test
// is a line of model/songs.md: "Access rights", "Rules", "Files", "Import",
// "Clip" and "Reading the name of a file". The songs are well-known ones
// taken as examples; nobody here is real.

// The band of these tests: Jibé the admin (installed, Sax Ténor), Zaza a
// plain member (Trompette), Sisi who manages songs, Popo a power member.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sisi', roles: ['SONG_MANAGER'] });
  addMember({ nickname: 'Popo', status: 'POWER_MEMBER' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const youtube = 'https://www.youtube.com/watch?v=0J2QdDbelmY';

test.describe('who may do what', () => {
  test('nothing about songs is served, and nothing is changed, without signing in', async ({
    request,
  }) => {
    const songId = addSong('Crazy');
    const addresses = ['', '/cover', '/audio', '/midi', '/museScore', '/clipThumbnail', '/parts/1'];
    for (const address of ['/api/songs', ...addresses.map((end) => `/api/songs/${songId}${end}`)]) {
      expect((await request.get(address)).status(), address).toBe(401);
    }

    const writes = [
      await request.post('/api/songs', { data: songRecord() }),
      await request.put(`/api/songs/${songId}`, { data: songRecord() }),
      await request.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 3 } }),
      await request.delete(`/api/songs/${songId}`),
      await sendFile(request, `/api/songs/${songId}/cover`, cover),
    ];
    for (const response of writes) {
      expect(response.status(), response.url()).toBe(401);
    }
    expect(sql('SELECT COUNT(*) FROM song')).toBe('1');
    expect(sql('SELECT COUNT(*) FROM memberSong')).toBe('0');
  });

  test('a member sees every song whatever its status, by name, and not the Discord channel', async ({
    playwright,
  }) => {
    addSong('Toxic', 'ABANDONED');
    addSong('Crazy', 'PROPOSED');
    const songId = addSong('Hey Ya', 'TEMPORARY');
    sql(`UPDATE song SET discordChannelId = '1203984756120394875' WHERE id = ${songId}`);
    const zaza = await deviceOf(playwright, email('Zaza'));

    const songs = await (await zaza.get('/api/songs')).json();
    expect(songs.map((song: { name: string }) => song.name)).toEqual(['Crazy', 'Hey Ya', 'Toxic']);
    expect(Object.keys(songs[0]).sort()).toEqual(
      [
        'bpm',
        'coverUrl',
        'enjoyment',
        'fileSizes',
        'id',
        'mastery',
        'name',
        'originalArtist',
        'originalTitle',
        'partCount',
        'status',
        'versionOn',
      ].sort(),
    );

    const song = await (await zaza.get(`/api/songs/${songId}`)).json();
    expect(song).toMatchObject({ name: 'Hey Ya', status: 'TEMPORARY', parts: [], audio: null });
    expect(song).not.toHaveProperty('discordChannelId');

    // Who manages songs sees it.
    const sisi = await deviceOf(playwright, email('Sisi'));
    expect(await (await sisi.get(`/api/songs/${songId}`)).json()).toMatchObject({
      discordChannelId: '1203984756120394875',
    });
  });

  test('a member cannot create, edit, change the status, delete, nor send a file', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const trumpet = instrumentId('Trompette');

    const refused = [
      await zaza.post('/api/songs', { data: songRecord() }),
      await zaza.put(`/api/songs/${songId}`, { data: songRecord() }),
      await zaza.put(`/api/songs/${songId}/status`, { data: { status: 'ABANDONED' } }),
      await zaza.delete(`/api/songs/${songId}`),
      await sendFile(zaza, `/api/songs/${songId}/cover`, cover),
      await zaza.delete(`/api/songs/${songId}/cover`),
      await sendFile(zaza, `/api/songs/${songId}/parts/${trumpet}`, pdf),
      await zaza.delete(`/api/songs/${songId}/parts/${trumpet}`),
      await zaza.put(`/api/songs/${songId}/audio/peaks`, { data: { peaks: [1, 2], version: 'x' } }),
      await zaza.post('/api/songs/fileNames', { data: { names: ['a.pdf'] } }),
    ];
    for (const response of refused) {
      expect(response.status(), response.url()).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect(sql('SELECT name, status FROM song')).toBe('Crazy\tIN_REPERTOIRE');
    expect(storedFiles('songs')).toEqual([]);
  });

  test('who manages songs creates one, edits it, changes its status and deletes it; so does an admin', async ({
    playwright,
    request,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));

    const created = await sisi.post('/api/songs', {
      data: songRecord({
        bpm: 124,
        versionOn: '2026-09-14',
        versionNote: ' Nouveau pont avant le dernier refrain,\nla fin est doublée. ',
        discordChannelId: '1203984756120394875',
      }),
    });
    expect(created.status()).toBe(201);
    const song = await created.json();
    expect(song).toMatchObject({
      name: 'Seven Nation',
      originalTitle: 'Seven Nation Army',
      originalArtist: 'The White Stripes',
      bpm: 124,
      status: 'IN_REPERTOIRE',
      versionOn: '2026-09-14',
      versionNote: 'Nouveau pont avant le dernier refrain,\nla fin est doublée.',
      clipUrl: null,
      discordChannelId: '1203984756120394875',
      coverUrl: null,
    });
    expect(sql('SELECT updatedByMemberId FROM song')).toBe(String(memberId('Sisi')));

    // The record is sent whole: what is left out is erased.
    const edited = await sisi.put(`/api/songs/${song.id}`, { data: songRecord({ name: 'Seven' }) });
    expect(await edited.json()).toMatchObject({
      name: 'Seven',
      bpm: null,
      versionOn: null,
      versionNote: null,
    });

    // Every status can follow every other.
    for (const status of ['ABANDONED', 'PROPOSED', 'TEMPORARY', 'IN_PROGRESS', 'IN_REPERTOIRE']) {
      const response = await sisi.put(`/api/songs/${song.id}/status`, { data: { status } });
      expect(await response.json()).toMatchObject({ status });
    }
    expect(
      (await sisi.put(`/api/songs/${song.id}/status`, { data: { status: 'ARCHIVED' } })).status(),
    ).toBe(422);

    // An admin holds the permission too.
    await request.post('/api/session', { data: { email: admin.email, password: admin.password } });
    expect((await request.delete(`/api/songs/${song.id}`)).status()).toBe(200);
    expect(sql('SELECT COUNT(*) FROM song')).toBe('0');
    expect((await request.get(`/api/songs/${song.id}`)).status()).toBe(404);
  });
});

test.describe('the record of a song', () => {
  test('two songs cannot have the same internal name; the same original title is fine', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const first = await (
      await sisi.post('/api/songs', { data: songRecord({ name: 'Été' }) })
    ).json();

    // Compared without regard to case or accents.
    const twin = await sisi.post('/api/songs', { data: songRecord({ name: 'ete' }) });
    expect(twin.status()).toBe(422);
    expect(await twin.json()).toEqual({ error: 'invalidInput', fields: { name: 'duplicate' } });

    // Two arrangements of one original.
    expect(
      (await sisi.post('/api/songs', { data: songRecord({ name: 'Seven bis' }) })).status(),
    ).toBe(201);
    // Saving a song under its own name is not a duplicate.
    expect(
      (await sisi.put(`/api/songs/${first.id}`, { data: songRecord({ name: 'ÉTÉ' }) })).status(),
    ).toBe(200);
  });

  test('each field is checked, and every fault is reported at once', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

    const response = await sisi.post('/api/songs', {
      data: songRecord({
        name: '   ',
        originalTitle: 'x'.repeat(151),
        bpm: 19,
        versionOn: inTwoDays,
        versionNote: 'x'.repeat(1001),
        clipUrl: 'https://vimeo.com/123456',
        discordChannelId: '12ab',
      }),
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).fields).toEqual({
      name: 'required',
      originalTitle: 'tooLong',
      bpm: 'invalid',
      versionOn: 'invalid',
      versionNote: 'tooLong',
      clipUrl: 'invalid',
      discordChannelId: 'invalid',
    });

    for (const [field, value] of [
      ['bpm', 401],
      ['versionOn', '2026-02-30'],
      ['versionOn', '14/09/2026'],
      ['clipUrl', 'http://www.youtube.com/watch?v=0J2QdDbelmY'],
      ['clipUrl', 'https://www.youtube.com/watch?v=short'],
      ['clipUrl', 'https://www.youtube.com.example.org/watch?v=0J2QdDbelmY'],
    ] as const) {
      const refused = await sisi.post('/api/songs', { data: songRecord({ [field]: value }) });
      expect((await refused.json()).fields, `${field} ${value}`).toEqual({ [field]: 'invalid' });
    }
    expect(sql('SELECT COUNT(*) FROM song')).toBe('0');

    // The bounds themselves are accepted.
    const accepted = await sisi.post('/api/songs', {
      data: songRecord({ bpm: 400, versionOn: new Date().toISOString().slice(0, 10) }),
    });
    expect(accepted.status()).toBe(201);
  });

  test('one Discord channel per song', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const channel = { discordChannelId: '1203984756120394875' };
    await sisi.post('/api/songs', { data: songRecord(channel) });

    const twin = await sisi.post('/api/songs', { data: songRecord({ name: 'Crazy', ...channel }) });
    expect((await twin.json()).fields).toEqual({ discordChannelId: 'duplicate' });
  });
});

test.describe('the clip', () => {
  test('the thumbnail is fetched by the server when the address is saved, and served to members only', async ({
    playwright,
    baseURL,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const song = await (
      await sisi.post('/api/songs', { data: songRecord({ clipUrl: youtube }) })
    ).json();

    expect(song.clipUrl).toBe(youtube);
    expect(song.clipVideoId).toBe('0J2QdDbelmY');
    expect(song.clipThumbnailUrl).toMatch(
      new RegExp(`^/api/songs/${song.id}/clipThumbnail\\?v=[0-9a-f]{16}$`),
    );
    expect(sql('SELECT clipThumbnailPath FROM song')).toMatch(
      /^songs\/[0-9a-f]{16}\/thumbnail\.png$/,
    );

    const zaza = await deviceOf(playwright, email('Zaza'));
    const thumbnail = await zaza.get(song.clipThumbnailUrl);
    expect(thumbnail.status()).toBe(200);
    expect(thumbnail.headers()['content-type']).toBe('image/png');

    const visitor = await playwright.request.newContext({ baseURL });
    expect((await visitor.get(song.clipThumbnailUrl)).status()).toBe(401);
  });

  test('the thumbnail follows the address: kept for the same video, replaced with it, deleted with it', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const song = await (
      await sisi.post('/api/songs', { data: songRecord({ clipUrl: youtube }) })
    ).json();
    const first = sql('SELECT clipThumbnailPath FROM song');

    // The same video, written the short way: the thumbnail stays.
    await sisi.put(`/api/songs/${song.id}`, {
      data: songRecord({ clipUrl: 'https://youtu.be/0J2QdDbelmY' }),
    });
    expect(sql('SELECT clipThumbnailPath FROM song')).toBe(first);

    // Another video: a new file, and the old one is deleted.
    await sisi.put(`/api/songs/${song.id}`, {
      data: songRecord({ clipUrl: 'https://youtu.be/ViwtNLUqkMY' }),
    });
    const second = sql('SELECT clipThumbnailPath FROM song');
    expect(second).not.toBe(first);
    expect(storedFiles('songs')).toEqual([second]);

    // No clip: no thumbnail.
    const without = await sisi.put(`/api/songs/${song.id}`, { data: songRecord() });
    expect(await without.json()).toMatchObject({ clipUrl: null, clipThumbnailUrl: null });
    expect(storedFiles('songs')).toEqual([]);
  });
});

test.describe('the files of a song', () => {
  test('each file is kept under a name chosen by the app, and listed with its weight', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));

    for (const [kind, file] of [
      ['cover', cover],
      ['museScore', museScore],
      ['midi', midi],
      ['audio', mp3],
    ] as const) {
      expect((await sendFile(sisi, `/api/songs/${songId}/${kind}`, file)).status(), kind).toBe(200);
    }

    expect(
      sql('SELECT coverPath, museScorePath, midiPath, audioPath FROM song').split('\t'),
    ).toEqual([
      expect.stringMatching(/^songs\/[0-9a-f]{16}\/cover\.png$/),
      expect.stringMatching(/^songs\/[0-9a-f]{16}\/score\.mscz$/),
      expect.stringMatching(/^songs\/[0-9a-f]{16}\/song\.mid$/),
      expect.stringMatching(/^songs\/[0-9a-f]{16}\/audio\.mp3$/),
    ]);

    const song = await (await sisi.get(`/api/songs/${songId}`)).json();
    expect(song.coverUrl).toMatch(/\/cover\?v=[0-9a-f]{16}$/);
    expect(song.audio).toMatchObject({ size: mp3.length, peaks: null });
    expect(song.midi.size).toBe(midi.length);
    expect(song.museScore.size).toBe(museScore.length);
    expect(song.fileSizes).toEqual({
      ownPart: null,
      audio: mp3.length,
      midi: midi.length,
      museScore: museScore.length,
    });
  });

  test('what a file is is decided from its content', async ({ playwright }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));
    const trumpet = instrumentId('Trompette');

    for (const [address, file] of [
      ['cover', pdf],
      // A drawing, an image that is not square, one larger than what the browser is asked to send.
      ['cover', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['cover', notSquare],
      ['cover', png(1025)],
      ['museScore', midi],
      ['midi', mp3],
      ['audio', pdf],
      [`parts/${trumpet}`, mp3],
    ] as const) {
      const response = await sendFile(sisi, `/api/songs/${songId}/${address}`, file);
      expect(response.status(), address).toBe(422);
      expect(await response.json()).toEqual({ error: 'invalidFile' });
    }
    expect(storedFiles('songs')).toEqual([]);

    // An m4a is a recording too.
    expect((await sendFile(sisi, `/api/songs/${songId}/audio`, m4a)).status()).toBe(200);
    expect(sql('SELECT audioPath FROM song')).toMatch(/audio\.m4a$/);
  });

  test('a file is sent alone, as it is: nothing else is read as a file', async ({ playwright }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));

    const asJson = await sisi.put(`/api/songs/${songId}/cover`, { data: { image: 'abc' } });
    expect(asJson.status()).toBe(400);
    expect(await asJson.json()).toEqual({ error: 'invalidBody' });

    // Each kind has its own limit: 1 MB for a MIDI file.
    const heavyMidi = await sendFile(
      sisi,
      `/api/songs/${songId}/midi`,
      Buffer.concat([midi, Buffer.alloc(1_000_000)]),
    );
    expect(heavyMidi.status()).toBe(413);
    expect(await heavyMidi.json()).toEqual({ error: 'fileTooBig' });

    // A part of more than 5 MB.
    const heavy = Buffer.concat([pdf, Buffer.alloc(5_000_000)]);
    const tooBig = await sendFile(
      sisi,
      `/api/songs/${songId}/parts/${instrumentId('Trompette')}`,
      heavy,
    );
    expect(tooBig.status()).toBe(413);
    expect(await tooBig.json()).toEqual({ error: 'fileTooBig' });

    // Above anything the app receives: refused before it is read.
    const huge = await sendFile(sisi, `/api/songs/${songId}/audio`, Buffer.alloc(10_000_001, 1));
    expect(huge.status()).toBe(413);
    expect(await huge.json()).toEqual({ error: 'bodyTooLarge' });

    // The larger limit is for the files of songs only.
    const elsewhere = await sisi.put('/api/me/preferences', {
      data: Buffer.alloc(8_000_001),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(elsewhere.status()).toBe(413);

    expect((await sendFile(sisi, '/api/songs/999/cover', cover)).status()).toBe(404);
    expect(storedFiles('songs')).toEqual([]);
  });

  test('a new file takes the place of the old one, which is deleted; a file can be removed', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));

    await sendFile(sisi, `/api/songs/${songId}/audio`, mp3);
    const first = sql('SELECT audioPath FROM song');
    await sendFile(sisi, `/api/songs/${songId}/audio`, m4a);
    const second = sql('SELECT audioPath FROM song');

    expect(second).not.toBe(first);
    expect(storedFiles('songs')).toEqual([second]);

    const removed = await sisi.delete(`/api/songs/${songId}/audio`);
    expect(await removed.json()).toMatchObject({ audio: null });
    expect(storedFiles('songs')).toEqual([]);
  });

  test('a file is served to members only, never kept by a shared cache, and downloaded under a readable name', async ({
    playwright,
    baseURL,
  }) => {
    const songId = addSong('Été / Hiver');
    const sisi = await deviceOf(playwright, email('Sisi'));
    await sendFile(sisi, `/api/songs/${songId}/audio`, mp3);
    await sendFile(sisi, `/api/songs/${songId}/parts/${instrumentId('Sax Alto')}`, pdf);
    const song = await (await sisi.get(`/api/songs/${songId}`)).json();

    const zaza = await deviceOf(playwright, email('Zaza'));
    const audio = await zaza.get(song.audio.url);
    expect(audio.status()).toBe(200);
    expect(await audio.body()).toEqual(mp3);
    expect(audio.headers()).toMatchObject({
      'content-type': 'audio/mpeg',
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      'accept-ranges': 'bytes',
    });
    expect(audio.headers()['content-disposition']).toBeUndefined();

    // A browser that already has the file is told so.
    const again = await zaza.get(song.audio.url, {
      headers: { 'If-None-Match': audio.headers().etag ?? '' },
    });
    expect(again.status()).toBe(304);

    // A player asks for a piece of the recording.
    const piece = await zaza.get(song.audio.url, { headers: { Range: 'bytes=3-10' } });
    expect(piece.status()).toBe(206);
    expect(piece.headers()['content-range']).toBe(`bytes 3-10/${mp3.length}`);
    expect(await piece.body()).toEqual(mp3.subarray(3, 11));
    const end = await zaza.get(song.audio.url, { headers: { Range: 'bytes=-5' } });
    expect(await end.body()).toEqual(mp3.subarray(mp3.length - 5));
    const beyond = await zaza.get(song.audio.url, { headers: { Range: `bytes=${mp3.length}-` } });
    expect(beyond.status()).toBe(416);

    // Downloaded: the name of the song and of the instrument.
    const part = await zaza.get(`${song.parts[0].url}&download`);
    expect(part.headers()['content-type']).toBe('application/pdf');
    expect(part.headers()['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Été Hiver - Sax Alto.pdf')}`,
    );

    const visitor = await playwright.request.newContext({ baseURL });
    expect((await visitor.get(song.audio.url)).status()).toBe(401);
    expect((await visitor.get(song.parts[0].url)).status()).toBe(401);
    expect((await zaza.get(`/api/songs/${songId}/midi`)).status()).toBe(404);
  });

  test('the outline of a recording is kept beside it, said for that recording, and goes with it', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));
    const version = (audio: { url: string }) => audio.url.split('v=')[1];

    // No recording: nothing to keep an outline of.
    const early = await sisi.put(`/api/songs/${songId}/audio/peaks`, {
      data: { peaks: [1], version: 'none' },
    });
    expect(early.status()).toBe(409);
    expect(await early.json()).toEqual({ error: 'noRecording' });

    const first = (await (await sendFile(sisi, `/api/songs/${songId}/audio`, mp3)).json()).audio;
    const saved = await sisi.put(`/api/songs/${songId}/audio/peaks`, {
      data: { peaks: [0, 40, 100, 12], version: version(first) },
    });
    expect((await saved.json()).audio.peaks).toEqual([0, 40, 100, 12]);
    expect(storedFiles('songs')).toHaveLength(2);

    for (const wrong of [[], [101], [-1], Array(401).fill(1)]) {
      const refused = await sisi.put(`/api/songs/${songId}/audio/peaks`, {
        data: { peaks: wrong, version: version(first) },
      });
      expect(refused.status()).toBe(422);
    }

    // A new recording has no outline until its own is sent: the outline of
    // the one it replaced, arriving late, is refused.
    const replaced = await sendFile(sisi, `/api/songs/${songId}/audio`, m4a);
    expect((await replaced.json()).audio.peaks).toBeNull();
    expect(storedFiles('songs')).toHaveLength(1);
    const late = await sisi.put(`/api/songs/${songId}/audio/peaks`, {
      data: { peaks: [5], version: version(first) },
    });
    expect(late.status()).toBe(409);
    expect(await late.json()).toEqual({ error: 'recordingReplaced' });
    expect(storedFiles('songs')).toHaveLength(1);
  });

  test('replacing a file does not change the day of the version', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const song = await (
      await sisi.post('/api/songs', { data: songRecord({ versionOn: '2026-03-02' }) })
    ).json();

    await sendFile(sisi, `/api/songs/${song.id}/audio`, mp3);
    await sendFile(sisi, `/api/songs/${song.id}/audio`, m4a);

    expect(sql('SELECT versionOn FROM song')).toBe('2026-03-02');
  });

  test('deleting a song deletes its files, its parts and the levels members gave it', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const song = await (
      await sisi.post('/api/songs', { data: songRecord({ clipUrl: youtube }) })
    ).json();
    const kept = addSong('Crazy');
    await sendFile(sisi, `/api/songs/${song.id}/cover`, cover);
    await sendFile(sisi, `/api/songs/${song.id}/audio`, mp3);
    await sendFile(sisi, `/api/songs/${song.id}/parts/${instrumentId('Souba')}`, pdf);
    await sendFile(sisi, `/api/songs/${kept}/midi`, midi);
    await sisi.put(`/api/songs/${song.id}/levels`, { data: { masteryLevel: 3 } });
    expect(storedFiles('songs')).toHaveLength(5);

    expect((await sisi.delete(`/api/songs/${song.id}`)).status()).toBe(200);

    expect(sql('SELECT name FROM song')).toBe('Crazy');
    expect(sql('SELECT COUNT(*) FROM songPart')).toBe('0');
    expect(sql('SELECT COUNT(*) FROM memberSong')).toBe('0');
    // Only the file of the other song is left.
    expect(storedFiles('songs')).toEqual([sql('SELECT midiPath FROM song')]);
    expect((await sisi.delete(`/api/songs/${song.id}`)).status()).toBe(404);
  });
});

test.describe('parts', () => {
  test('one part per instrument and per song, listed in the order of the band', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));
    const [souba, alto, trumpet] = ['Souba', 'Sax Alto', 'Trompette'].map(instrumentId);

    for (const instrument of [souba, alto, trumpet]) {
      expect((await sendFile(sisi, `/api/songs/${songId}/parts/${instrument}`, pdf)).status()).toBe(
        200,
      );
    }
    // Sending a PDF for an instrument that has one replaces it.
    const before = sql(`SELECT pdfPath FROM songPart WHERE instrumentId = ${alto}`);
    const replaced = await sendFile(
      sisi,
      `/api/songs/${songId}/parts/${alto}`,
      Buffer.concat([pdf, pdf]),
    );
    const song = await replaced.json();

    expect(song.partCount).toBe(3);
    expect(song.parts.map((part: { instrumentId: number }) => part.instrumentId)).toEqual([
      trumpet,
      alto,
      souba,
    ]);
    expect(song.parts[1].size).toBe(pdf.length * 2);
    expect(sql(`SELECT pdfPath FROM songPart WHERE instrumentId = ${alto}`)).not.toBe(before);
    expect(storedFiles('songs')).toHaveLength(3);

    // Zaza plays the trumpet: the list gives the weight of her own part.
    const zaza = await deviceOf(playwright, email('Zaza'));
    const [listed] = await (await zaza.get('/api/songs')).json();
    expect(listed).toMatchObject({ partCount: 3, fileSizes: { ownPart: pdf.length } });

    const removed = await sisi.delete(`/api/songs/${songId}/parts/${alto}`);
    expect((await removed.json()).partCount).toBe(2);
    expect(storedFiles('songs')).toHaveLength(2);

    expect((await sendFile(sisi, `/api/songs/${songId}/parts/9999`, pdf)).status()).toBe(404);
    expect((await sisi.get(`/api/songs/${songId}/parts/${alto}`)).status()).toBe(404);
  });

  test('an instrument that has a part cannot be deleted', async ({ playwright, request }) => {
    const songId = addSong('Crazy');
    const sisi = await deviceOf(playwright, email('Sisi'));
    const souba = instrumentId('Souba');
    await sendFile(sisi, `/api/songs/${songId}/parts/${souba}`, pdf);

    await request.post('/api/session', { data: { email: admin.email, password: admin.password } });
    const refused = await request.delete(`/api/instruments/${souba}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'instrumentInUse' });

    // Without its part, it can; its aliases go with it.
    await sisi.delete(`/api/songs/${songId}/parts/${souba}`);
    expect((await request.delete(`/api/instruments/${souba}`)).status()).toBe(200);
    expect(sql(`SELECT COUNT(*) FROM instrumentAlias WHERE instrumentId = ${souba}`)).toBe('0');
  });
});

test.describe('the levels of a member on a song', () => {
  test('a member sets their own levels, each on its own, from 1 to 5, and can empty them', async ({
    playwright,
  }) => {
    const songId = addSong('Crazy');
    const zaza = await deviceOf(playwright, email('Zaza'));

    const first = await zaza.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 4 } });
    expect((await first.json()).ownLevels).toEqual({ masteryLevel: 4, enjoymentLevel: null });

    const both = await zaza.put(`/api/songs/${songId}/levels`, {
      data: { masteryLevel: 2, enjoymentLevel: 5 },
    });
    expect((await both.json()).ownLevels).toEqual({ masteryLevel: 2, enjoymentLevel: 5 });
    expect(sql('SELECT memberId, masteryLevel, enjoymentLevel FROM memberSong')).toBe(
      `${memberId('Zaza')}\t2\t5`,
    );

    for (const wrong of [
      { masteryLevel: 0 },
      { enjoymentLevel: 6 },
      { masteryLevel: 2.5 },
      { memberId: 1 },
    ]) {
      expect((await zaza.put(`/api/songs/${songId}/levels`, { data: wrong })).status()).toBe(422);
    }

    // Nothing said: nothing kept.
    const emptied = await zaza.put(`/api/songs/${songId}/levels`, { data: {} });
    expect((await emptied.json()).ownLevels).toEqual({ masteryLevel: null, enjoymentLevel: null });
    expect(sql('SELECT COUNT(*) FROM memberSong')).toBe('0');

    expect((await zaza.put('/api/songs/999/levels', { data: { masteryLevel: 1 } })).status()).toBe(
      404,
    );
  });

  test('the band sees the average and the number of answers, never the level of a named member', async ({
    playwright,
    request,
  }) => {
    const songId = addSong('Crazy');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const popo = await deviceOf(playwright, email('Popo'));
    const sisi = await deviceOf(playwright, email('Sisi'));
    await zaza.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 5, enjoymentLevel: 4 } });
    await popo.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 2 } });
    await sisi.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 3, enjoymentLevel: 1 } });

    // Jibé, the admin, said nothing: he sees the averages, and no level of his own.
    await request.post('/api/session', { data: { email: admin.email, password: admin.password } });
    const song = await (await request.get(`/api/songs/${songId}`)).json();
    expect(song.mastery).toEqual({ average: 3.3, count: 3 });
    expect(song.enjoyment).toEqual({ average: 2.5, count: 2 });
    expect(song.ownLevels).toEqual({ masteryLevel: null, enjoymentLevel: null });

    const [listed] = await (await request.get('/api/songs')).json();
    expect(listed).toMatchObject({
      mastery: { average: 3.3, count: 3 },
      enjoyment: { average: 2.5, count: 2 },
    });

    // No role shows more: nothing in an answer names a member.
    expect(JSON.stringify([song, listed])).not.toMatch(/memberId|nickname|levels":\[/);
  });

  test('the levels of a member who leaves are erased, and no longer count', async ({
    playwright,
    request,
  }) => {
    const songId = addSong('Crazy');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const popo = await deviceOf(playwright, email('Popo'));
    await zaza.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 5 } });
    await popo.put(`/api/songs/${songId}/levels`, { data: { masteryLevel: 2 } });

    await request.post('/api/session', { data: { email: admin.email, password: admin.password } });
    await request.put(`/api/members/${memberId('Zaza')}/status`, { data: { status: 'LEFT' } });

    expect(sql('SELECT memberId FROM memberSong')).toBe(String(memberId('Popo')));
    const song = await (await request.get(`/api/songs/${songId}`)).json();
    expect(song.mastery).toEqual({ average: 2, count: 1 });
  });

  test('a song nobody answered for has no average', async ({ playwright }) => {
    const songId = addSong('Crazy');
    const zaza = await deviceOf(playwright, email('Zaza'));
    const song = await (await zaza.get(`/api/songs/${songId}`)).json();

    expect(song.mastery).toEqual({ average: null, count: 0 });
    expect(song.enjoyment).toEqual({ average: null, count: 0 });
  });
});

test.describe('placing the files that are dropped', () => {
  test('install copies the aliases of the instruments kept from the starting library', async () => {
    // The band of the tests kept Trompette, Sax Alto, Sax Ténor and Souba.
    const aliases = sql(
      'SELECT i.name, a.alias FROM instrumentAlias a JOIN instrument i ON i.id = a.instrumentId ORDER BY a.alias',
    )
      .split('\n')
      .map((line) => line.split('\t'));

    expect(aliases).toContainEqual(['Trompette', 'tp']);
    expect(aliases).toContainEqual(['Sax Alto', 'sax']);
    expect(aliases).toContainEqual(['Sax Alto', 'sxm']);
    expect(aliases).toContainEqual(['Sax Ténor', 'saxophone sib']);
    expect(aliases).toContainEqual(['Souba', 'sb']);
    // Nothing for an instrument the band did not keep.
    expect(aliases.some(([, alias]) => alias === 'tbut' || alias === 'basse')).toBe(false);
  });

  test('a file goes where its kind says, and a PDF to the instrument its name tells', async ({
    playwright,
  }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const trumpet = instrumentId('Trompette');
    const alto = instrumentId('Sax Alto');
    const tenor = instrumentId('Sax Ténor');
    const souba = instrumentId('Souba');

    const cases: [string, string | null, number | null, string | null][] = [
      ['freed-cover.JPG', 'cover', null, null],
      ['pochette.webp', 'cover', null, null],
      ['Freed from Desire.mscz', 'museScore', null, null],
      ['Freed from Desire.mid', 'midi', null, null],
      ['Freed.midi', 'midi', null, null],
      ['freed-repete-sept.mp3', 'audio', null, null],
      ['freed.m4a', 'audio', null, null],
      // A file of another kind is refused, with the reason.
      ['notes-de-repete.docx', null, null, 'unknownKind'],
      ['Freed.nwc', null, null, 'unknownKind'],
      // The name of the instrument is always an alias; accents and case do not count.
      ['Freed_Sax-Alto.pdf', 'part', alto, null],
      // An accent written apart from its letter, as a Mac names its files.
      ['Freed - Sax Te\u0301nor.pdf', 'part', tenor, null],
      ['FREED SAX TENOR.PDF', 'part', tenor, null],
      ['Freed - Sax Ténor.pdf', 'part', tenor, null],
      // The words of an alias, in any order.
      ['Freed_Sax-Mib.pdf', 'part', alto, null],
      ['Freed sib saxophone.pdf', 'part', tenor, null],
      ['Freed_sxt.pdf', 'part', tenor, null],
      ['Freed_tp.pdf', 'part', trumpet, null],
      ['Freed_Souba.pdf', 'part', souba, null],
      // The alias with the most words wins: "sax" alone is the alto.
      ['Freed sax.pdf', 'part', alto, null],
      ['Freed saxo.pdf', 'part', alto, null],
      // Whole words only: "sb" is not found in "sbires", nor "tp" in "tptp".
      ['Les sbires.pdf', 'part', null, 'noInstrument'],
      ['Freed_tutti B.pdf', 'part', null, 'noInstrument'],
      // Two instruments named: the import asks.
      ['Freed trompette souba.pdf', 'part', null, 'severalInstruments'],
    ];

    const response = await sisi.post('/api/songs/fileNames', {
      data: { names: cases.map(([name]) => name) },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(
      cases.map(([name, role, instrument, problem]) => ({
        name,
        role,
        instrumentId: instrument,
        problem,
      })),
    );
    // Nothing is saved by asking.
    expect(sql('SELECT COUNT(*) FROM songPart')).toBe('0');
  });

  test('the spelling with the most words wins, and a short one is not found inside a longer word', async ({
    playwright,
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
    const sisi = await deviceOf(playwright, email('Sisi'));
    const [sib, ut] = [instrumentId('Trombone Sib'), instrumentId('Trombone Ut')];

    const placed = await sisi.post('/api/songs/fileNames', {
      data: {
        names: ['Crazy trombone.pdf', 'Crazy trombone ut.pdf', 'Crazy_tb.pdf', 'Crazy_tbut.pdf'],
      },
    });
    expect(
      (await placed.json()).map((file: { instrumentId: number }) => file.instrumentId),
    ).toEqual([sib, ut, sib, ut]);
  });

  test('an alias the band adds is read like the others', async ({ playwright }) => {
    const sisi = await deviceOf(playwright, email('Sisi'));
    const souba = instrumentId('Souba');
    sql(`INSERT INTO instrumentAlias (instrumentId, alias) VALUES (${souba}, 'gros tuyau')`);

    const placed = await sisi.post('/api/songs/fileNames', {
      data: { names: ['Crazy - le gros tuyau.pdf'] },
    });
    expect(await placed.json()).toEqual([
      { name: 'Crazy - le gros tuyau.pdf', role: 'part', instrumentId: souba, problem: null },
    ]);
  });
});

test.describe('downloading everything', () => {
  test('one archive per kind, for the songs asked: the parts are those of the instrument of the member', async ({
    playwright,
  }) => {
    const [crazy, toxic, heyYa] = [addSong('Crazy'), addSong('Toxic'), addSong('Hey Ya')];
    const sisi = await deviceOf(playwright, email('Sisi'));
    const trumpet = instrumentId('Trompette');
    for (const songId of [crazy, toxic, heyYa]) {
      await sendFile(sisi, `/api/songs/${songId}/parts/${trumpet}`, pdf);
      await sendFile(sisi, `/api/songs/${songId}/parts/${instrumentId('Souba')}`, pdf);
    }
    await sendFile(sisi, `/api/songs/${crazy}/audio`, mp3);

    // Zaza plays the trumpet, and asks for two of the three songs.
    const zaza = await deviceOf(playwright, email('Zaza'));
    const parts = await zaza.get(`/api/songs/archive?kind=parts&songs=${crazy},${heyYa}`);
    expect(parts.status()).toBe(200);
    expect(parts.headers()['content-type']).toBe('application/zip');
    expect(parts.headers()['content-disposition']).toBe('attachment');
    const archive = (await parts.body()).toString('latin1');
    expect(archive.startsWith('PK')).toBe(true);
    expect(archive).toContain('Crazy - Trompette.pdf');
    expect(archive).toContain('Hey Ya - Trompette.pdf');
    expect(archive).not.toContain('Toxic');
    expect(archive).not.toContain('Souba');

    const recordings = await zaza.get(`/api/songs/archive?kind=audio&songs=${crazy},${toxic}`);
    expect((await recordings.body()).toString('latin1')).toContain('Crazy.mp3');

    // Two songs whose names would make the same file name both get their place.
    sql(
      `UPDATE song SET name = 'AC/DC' WHERE id = ${toxic}; UPDATE song SET name = 'AC DC' WHERE id = ${heyYa}`,
    );
    await sendFile(sisi, `/api/songs/${toxic}/audio`, mp3);
    await sendFile(sisi, `/api/songs/${heyYa}/audio`, mp3);
    const twins = (
      await (await zaza.get(`/api/songs/archive?kind=audio&songs=${toxic},${heyYa}`)).body()
    ).toString('latin1');
    expect(twins).toContain('AC DC.mp3');
    expect(twins).toContain('AC DC (2).mp3');

    // Nothing of that kind for these songs.
    expect((await zaza.get(`/api/songs/archive?kind=midi&songs=${crazy}`)).status()).toBe(404);
    for (const wrong of [
      'kind=covers&songs=1',
      'kind=audio',
      'kind=audio&songs=1;DROP',
      'songs=1',
    ]) {
      expect((await zaza.get(`/api/songs/archive?${wrong}`)).status(), wrong).toBe(422);
    }
  });

  test('the archive is for members only', async ({ request }) => {
    expect((await request.get('/api/songs/archive?kind=audio&songs=1')).status()).toBe(401);
  });
});
