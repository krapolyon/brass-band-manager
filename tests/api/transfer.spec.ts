import { type APIRequestContext, expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addCostume, day } from '../support/gigs.ts';
import { png } from '../support/images.ts';
import { emptyMailbox, mailsAfterAWhile, receivedMails } from '../support/mail.ts';
import { memberColumns } from '../support/personal.ts';
import { emptyPushes, sentPushes } from '../support/push.ts';
import { addMember, admin, deviceOf, install, memberPassword } from '../support/scenario.ts';
import { addSong, pdf, sendFile } from '../support/songFiles.ts';
import { dropByFtp, emptyImportFolder, emptyStorage } from '../support/storage.ts';
import { makeZip, readZip } from '../support/zip.ts';

// The export, the import and the reprise of the data (0.4.0, issue #43;
// model/export-import.md). Each line of its "Checks" is a test here. The
// band, the members and the files are made up.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  emptyImportFolder();
  emptyPushes();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const jsonOf = (value: unknown) => Buffer.from(JSON.stringify(value));
const souba = () => sql("SELECT name FROM instrument WHERE name = 'Souba'");
const jibe = (playwright: Parameters<typeof deviceOf>[0]) =>
  deviceOf(playwright, admin.email, admin.password);

/** Sends a zip as the screen does, and returns its name in the folder "import". */
async function upload(request: APIRequestContext, zip: Buffer, name = 'reprise.zip') {
  const response = await request.put(`/api/transfer/upload?name=${encodeURIComponent(name)}`, {
    data: zip,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).name as string;
}
const read = async (request: APIRequestContext, name: string, parts?: string[]) =>
  (
    await request.post('/api/transfer/read', { data: { name, ...(parts ? { parts } : {}) } })
  ).json();
const load = (request: APIRequestContext, name: string, parts: string[], sendInvitations = true) =>
  request.post('/api/transfer/import', {
    data: { name, parts, sendInvitations, password: admin.password },
  });

/** A reprise of a small band, its CSV files written as Excel in French does. */
function reprise(changes: Partial<Record<string, string>> = {}) {
  const csv = (rows: string[][]) => `﻿${rows.map((row) => row.join(';')).join('\r\n')}\r\n`;
  return makeZip({
    'members.csv':
      changes.members ??
      csv([
        [
          'email',
          'nickname',
          'firstName',
          'lastName',
          'instrument',
          'status',
          'roles',
          'mobilePhone',
          'city',
        ],
        [
          'kiki@example.org',
          'Kiki',
          'Christine',
          'Dupré',
          souba(),
          '',
          '',
          '+33 6 12 34 56 78',
          'Lyon',
        ],
        ['riton@example.org', 'Riton', 'Henri', 'Blanc', souba(), 'Actif', 'GIG_MANAGER', '', ''],
        [email('Zaza'), 'Zaza', 'Isabelle', 'Garnier', '', '', '', '', 'Villeurbanne'],
      ]),
    'members/photos/Kiki.png': png(64),
    'songs.csv':
      changes.songs ??
      csv([
        [
          'name',
          'originalTitle',
          'originalArtist',
          'status',
          'mood',
          'positions',
          'durationSeconds',
        ],
        ['Valerie', 'Valerie', 'Amy Winehouse', 'Au répertoire', 'Teuf', 'Fin|2e moitié', '3:52'],
      ]),
    [`songs/Valerie/valerie ${souba()}.pdf`]: pdf,
    'gigs.csv':
      changes.gigs ??
      csv([
        ['name', 'startsOn', 'status', 'meetingTime', 'placeName', 'organizers', 'costumes'],
        [
          'Fête des Lumières',
          day(40),
          'ACCEPTED',
          '18:00',
          'Place des Terreaux',
          'kiki@example.org',
          'Paillettes',
        ],
      ]),
    'slots.csv':
      changes.slots ??
      csv([
        ['gigName', 'gigStartsOn', 'position', 'name', 'costume'],
        ['Fête des Lumières', day(40), '1', 'Vendredi', 'Paillettes'],
        ['Fête des Lumières', day(40), '2', 'Samedi', ''],
      ]),
    'answers.csv':
      changes.answers ??
      csv([
        ['gigName', 'gigStartsOn', 'slotPosition', 'memberEmail', 'answer'],
        ['Fête des Lumières', day(40), '1', 'kiki@example.org', 'Oui'],
        ['Fête des Lumières', day(40), '2', email('Zaza'), 'MAYBE'],
      ]),
  });
}

test.describe('only the admin', () => {
  test('a member who is not admin reaches none of it; nobody signed out either', async ({
    playwright,
    request,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const calls = [
      (who: APIRequestContext) => who.get('/api/transfer'),
      (who: APIRequestContext) => who.get('/api/transfer/templates'),
      (who: APIRequestContext) =>
        who.post('/api/transfer/export', {
          data: { password: memberPassword, parts: ['members'] },
        }),
      (who: APIRequestContext) =>
        who.put('/api/transfer/upload', {
          data: Buffer.from('x'),
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      (who: APIRequestContext) => who.post('/api/transfer/read', { data: { name: 'x.zip' } }),
      (who: APIRequestContext) =>
        who.post('/api/transfer/import', {
          data: { name: 'x.zip', parts: ['members'], password: memberPassword },
        }),
    ];
    for (const call of calls) {
      expect((await call(momo)).status()).toBe(403);
      expect((await call(request)).status()).toBe(401);
    }
  });
});

test.describe('the reprise', () => {
  test('the templates are made for this installation', async ({ playwright }) => {
    addCostume('Paillettes');
    const zip = readZip(
      await (await (await jibe(playwright)).get('/api/transfer/templates')).body(),
    );

    expect([...zip.keys()].sort()).toEqual(
      [
        'allowed-values.csv',
        'answers.csv',
        'gigs.csv',
        'members.csv',
        'members/photos/',
        'slots.csv',
        'songs.csv',
        'songs/',
      ].sort(),
    );
    const members = zip.get('members.csv')?.toString('utf8') ?? '';
    expect(members.split('\r\n')[0]).toBe(
      '﻿email;nickname;firstName;lastName;instrument;status;roles;mobilePhone;streetAddress;postalCode;city;countryCode;addressInstructions;language;photo',
    );
    const allowed = zip.get('allowed-values.csv')?.toString('utf8') ?? '';
    expect(allowed).toContain(`members.instrument;${souba()};${souba()}`);
    // A cell with a space is quoted, as a spreadsheet writes it.
    expect(allowed).toContain('songs.status;IN_REPERTOIRE;"Au répertoire"');
    expect(allowed).toContain('gigs.costumes;Paillettes;Paillettes');
  });

  test('read, then loaded: what it adds and updates; invitations to the new members only; no notification', async ({
    playwright,
  }) => {
    addCostume('Paillettes');
    const desk = await jibe(playwright);
    const name = await upload(desk, reprise());

    const summary = await read(desk, name);
    expect(summary).toMatchObject({
      kind: 'reprise',
      count: 0,
      problems: [],
      members: { total: 3, new: 2, updated: 1, photos: 1 },
      songs: { total: 1, new: 1, updated: 0, files: 1 },
      gigs: { total: 1, new: 1, slots: 2 },
      answers: { total: 2 },
      invitations: 2,
    });

    expect((await load(desk, name, ['members', 'songs', 'gigs', 'answers'])).status()).toBe(200);
    expect(memberColumns('Kiki', 'status, mobilePhone, city')).toBe('INVITED\t+33612345678\tLyon');
    expect(memberColumns('Zaza', 'firstName, city, status')).toBe('Isabelle\tVilleurbanne\tACTIVE');
    expect(sql("SELECT photoPath IS NOT NULL FROM member WHERE nickname = 'Kiki'")).toBe('1');
    expect(
      sql(
        "SELECT role FROM memberRole r JOIN member m ON m.id = r.memberId WHERE m.nickname = 'Riton'",
      ),
    ).toBe('GIG_MANAGER');
    expect(
      sql(
        "SELECT status, durationSeconds, mood, inRepertoireOn IS NOT NULL FROM song WHERE name = 'Valerie'",
      ),
    ).toBe('IN_REPERTOIRE\t232\tPARTY\t1');
    expect(
      sql(
        "SELECT GROUP_CONCAT(position ORDER BY position) FROM songPosition p JOIN song s ON s.id = p.songId WHERE s.name = 'Valerie'",
      ),
    ).toBe('SECOND_HALF,END');
    expect(sql('SELECT COUNT(*) FROM songPart')).toBe('1');
    expect(
      sql(
        "SELECT status, proposedAt < UTC_TIMESTAMP() - INTERVAL 15 DAY FROM gig WHERE name = 'Fête des Lumières'",
      ),
    ).toBe('ACCEPTED\t1');
    expect(sql('SELECT GROUP_CONCAT(name ORDER BY position) FROM gigSlot')).toBe('Vendredi,Samedi');
    expect(sql('SELECT COUNT(*) FROM gigSlotAttendance')).toBe('2');
    // The two new members are invited by email; the admin who loads, never.
    const mails = await receivedMails(2);
    expect(mails.map((mail) => mail.to).sort()).toEqual(['kiki@example.org', 'riton@example.org']);
    // No notification of any kind.
    expect(sentPushes()).toEqual([]);
    // Nothing waits in the folder any more.
    expect((await (await desk.get('/api/transfer')).json()).zips).toEqual([]);
  });

  test('loaded twice, the second load changes nothing', async ({ playwright }) => {
    addCostume('Paillettes');
    const desk = await jibe(playwright);
    await load(desk, await upload(desk, reprise()), ['members', 'songs', 'gigs', 'answers'], false);
    const before =
      sql('SELECT COUNT(*) FROM member') +
      sql('SELECT COUNT(*) FROM song') +
      sql('SELECT COUNT(*) FROM gigSlot') +
      sql('SELECT COUNT(*) FROM gigSlotAttendance');

    const second = await upload(desk, reprise());
    expect(await read(desk, second)).toMatchObject({
      members: { new: 0, updated: 3 },
      songs: { new: 0, updated: 1 },
      gigs: { new: 0, updated: 1 },
    });
    expect(
      (await load(desk, second, ['members', 'songs', 'gigs', 'answers'], false)).status(),
    ).toBe(200);
    const after =
      sql('SELECT COUNT(*) FROM member') +
      sql('SELECT COUNT(*) FROM song') +
      sql('SELECT COUNT(*) FROM gigSlot') +
      sql('SELECT COUNT(*) FROM gigSlotAttendance');
    expect(after).toBe(before);
  });

  test('a song whose name exists is updated: the files given replace those of their kind, the others stay', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    await load(desk, await upload(desk, reprise()), ['songs'], false);
    sql("UPDATE song SET coverPath = 'songs/0123456789abcdef/cover.png' WHERE name = 'Valerie'");
    const part = sql('SELECT pdfPath FROM songPart');

    await load(desk, await upload(desk, reprise()), ['songs'], false);
    expect(sql('SELECT pdfPath FROM songPart')).not.toBe(part);
    expect(sql("SELECT coverPath FROM song WHERE name = 'Valerie'")).toBe(
      'songs/0123456789abcdef/cover.png',
    );
    expect(sql('SELECT COUNT(*) FROM song')).toBe('1');
  });

  test('every fault is listed with its file and line, and nothing is written', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const zip = reprise({
      members:
        'email;nickname;firstName;lastName;instrument;mobilePhone\r\nlulu@example.org;Lulu;Lucie;Marchand;Banjo;\r\ntoto@example.org;Toto;Thomas;Roche;Souba;06 12 34 56 78\r\n',
      answers: `gigName;gigStartsOn;memberEmail;answer\r\nFête des Lumières;${day(40)};nobody@example.org;Oui\r\n`,
    });
    const files = readZip(zip);
    files.set('songs/Valerie/valerie.pdf', pdf);
    const name = await upload(desk, makeZip(Object.fromEntries(files)));

    const summary = await read(desk, name);
    expect(summary.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'members.csv',
          line: 2,
          column: 'instrument',
          error: 'unknownInstrument',
          value: 'Banjo',
        }),
        expect.objectContaining({
          file: 'members.csv',
          line: 3,
          column: 'mobilePhone',
          error: 'phoneWithoutPrefix',
        }),
        expect.objectContaining({
          file: 'answers.csv',
          line: 2,
          column: 'memberEmail',
          error: 'unknownMember',
          value: 'nobody@example.org',
        }),
        expect.objectContaining({
          file: 'songs/Valerie/valerie.pdf',
          error: 'partWithoutInstrument',
        }),
      ]),
    );
    // A file with problems is dropped again once corrected: it does not wait.
    expect((await load(desk, name, ['members', 'songs', 'gigs', 'answers'])).status()).toBe(404);
    expect(sql('SELECT COUNT(*) FROM song')).toBe('0');
    expect(sql("SELECT COUNT(*) FROM member WHERE nickname IN ('Lulu', 'Toto')")).toBe('0');
  });

  test('invitations leave only when the switch is on and the instance has a mail server', async ({
    playwright,
  }) => {
    addCostume('Paillettes');
    const desk = await jibe(playwright);
    await load(desk, await upload(desk, reprise()), ['members'], false);
    expect(await mailsAfterAWhile()).toHaveLength(0);
    expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
  });
});

test('a zip dropped by FTP is listed, then read and loaded like one sent', async ({
  playwright,
}) => {
  const desk = await jibe(playwright);
  dropByFtp('reprise-krapos.zip', reprise());
  expect((await (await desk.get('/api/transfer')).json()).zips).toEqual([
    expect.objectContaining({ name: 'reprise-krapos.zip' }),
  ]);
  expect(await read(desk, 'reprise-krapos.zip', ['members'])).toMatchObject({
    kind: 'reprise',
    count: 0,
  });
  expect((await load(desk, 'reprise-krapos.zip', ['members'], false)).status()).toBe(200);
  expect(sql("SELECT COUNT(*) FROM member WHERE nickname = 'Kiki'")).toBe('1');
  // A name that is not a zip of the folder opens nothing.
  expect(
    (await desk.post('/api/transfer/read', { data: { name: '../config.php' } })).status(),
  ).toBe(404);
});

test.describe('the export and its import', () => {
  test('the export asks the password again, and holds what the model says, never an account setting', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const refused = await desk.post('/api/transfer/export', {
      data: { password: 'wrong', parts: ['members'] },
    });
    expect(refused.status()).toBe(422);

    const response = await desk.post('/api/transfer/export', {
      data: { password: admin.password, parts: ['settings', 'members', 'songs', 'gigs'] },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toMatch(
      /attachment; filename="la-fanfare-des-cuivres-dechaines-\d{4}-\d\d-\d\d-\d{4}\.zip"/,
    );
    const zip = readZip(await response.body());
    const manifest = JSON.parse(zip.get('manifest.json')?.toString() ?? '{}');
    expect(manifest).toMatchObject({
      format: 1,
      app: 'brass-band-manager',
      parts: ['settings', 'members', 'songs', 'gigs'],
      exportedBy: admin.email,
    });
    const members = JSON.parse(zip.get('members/data.json')?.toString() ?? '{}').member;
    const zaza = members.find((one: { nickname: string }) => one.nickname === 'Zaza');
    // In clear, with the hash of the password; no preference of the account.
    expect(zaza).toMatchObject({ email: email('Zaza'), firstName: 'Prénom', status: 'ACTIVE' });
    expect(zaza.passwordHash).toMatch(/^\$2y\$/);
    for (const field of [
      'colorScheme',
      'accentTheme',
      'hasHighContrast',
      'notifyGigReminder',
      'calendarToken',
      'emailHash',
      'id',
    ]) {
      expect(zaza).not.toHaveProperty(field);
    }
  });

  test('exported then imported into an empty installation, the same band; then every session ends', async ({
    playwright,
    baseURL,
  }) => {
    sql(`UPDATE member SET city = NULL`);
    const desk = await jibe(playwright);
    const exported = await (
      await desk.post('/api/transfer/export', {
        data: { password: admin.password, parts: ['settings', 'members', 'songs', 'gigs'] },
      })
    ).body();
    const counts =
      sql('SELECT COUNT(*) FROM member') +
      sql('SELECT COUNT(*) FROM section') +
      sql('SELECT COUNT(*) FROM instrument');

    emptyDatabase();
    const setup = await playwright.request.newContext({ baseURL });
    await install(setup);
    await setup.dispose();
    const again = await jibe(playwright);
    const name = await upload(again, exported, 'export.zip');
    expect(await read(again, name)).toMatchObject({
      kind: 'export',
      format: 1,
      count: 0,
      parts: { members: { total: 3, new: 2, updated: 1 } },
    });
    const loaded = await load(again, name, ['settings', 'members', 'songs', 'gigs']);
    expect(await loaded.json()).toEqual({ loaded: true, signedOut: true });
    expect(
      sql('SELECT COUNT(*) FROM member') +
        sql('SELECT COUNT(*) FROM section') +
        sql('SELECT COUNT(*) FROM instrument'),
    ).toBe(counts);
    // Each keeps their password; every session ended.
    expect((await again.get('/api/me')).status()).toBe(401);
    expect((await (await deviceOf(playwright, email('Zaza'))).get('/api/me')).status()).toBe(200);

    // Imported twice: nothing changes the second time.
    const fresh = await jibe(playwright);
    const twice = await upload(fresh, exported, 'export.zip');
    expect(await read(fresh, twice)).toMatchObject({ parts: { members: { new: 0, updated: 3 } } });
  });

  test('a file altered after export, a newer format, or without the admin in it is refused', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const password = admin.password;
    const exported = readZip(
      await (
        await desk.post('/api/transfer/export', {
          data: { password, parts: ['settings', 'members'] },
        })
      ).body(),
    );

    const altered = new Map(exported);
    const manifest = JSON.parse(altered.get('manifest.json')?.toString() ?? '{}');
    manifest.files = { 'members/files/x.png': 'sha256:00' };
    altered.set('manifest.json', jsonOf(manifest));
    expect(
      (await read(desk, await upload(desk, makeZip(Object.fromEntries(altered)), 'a.zip')))
        .problems,
    ).toEqual([expect.objectContaining({ file: 'members/files/x.png', error: 'missingFile' })]);

    const newer = new Map(exported);
    newer.set(
      'manifest.json',
      jsonOf({
        ...JSON.parse(exported.get('manifest.json')?.toString() ?? '{}'),
        format: 2,
      }),
    );
    expect(
      (await read(desk, await upload(desk, makeZip(Object.fromEntries(newer)), 'b.zip'))).problems,
    ).toEqual([expect.objectContaining({ error: 'newerFormat', value: '2' })]);

    const withoutAdmin = new Map(exported);
    const data = JSON.parse(exported.get('members/data.json')?.toString() ?? '{}');
    data.member = data.member.map((one: { roles: string[] }) => ({ ...one, roles: [] }));
    withoutAdmin.set('members/data.json', jsonOf(data));
    const files = JSON.parse(exported.get('manifest.json')?.toString() ?? '{}');
    withoutAdmin.set('manifest.json', jsonOf(files));
    expect(
      (await read(desk, await upload(desk, makeZip(Object.fromEntries(withoutAdmin)), 'c.zip')))
        .problems,
    ).toEqual([expect.objectContaining({ error: 'adminNotInFile' })]);
  });
});

// What the independent review of 0.4.0 found, each with its test.
test.describe('the checks added after the review', () => {
  const csvOf = (rows: string[][]) => `${rows.map((row) => row.join(';')).join('\r\n')}\r\n`;
  const memberRows = (roles: string) =>
    csvOf([
      ['email', 'nickname', 'firstName', 'lastName', 'instrument', 'roles'],
      [email('Zaza'), 'Zaza', 'Isabelle', 'Garnier', souba(), roles],
      ['lulu@example.org', 'Lulu', 'Lucie', 'Marchand', souba(), ''],
    ]);
  const exportOf = async (desk: APIRequestContext, parts: string[]) =>
    readZip(
      await (
        await desk.post('/api/transfer/export', { data: { password: admin.password, parts } })
      ).body(),
    );
  const problemsOf = async (desk: APIRequestContext, files: Map<string, Buffer>, name: string) =>
    (await read(desk, await upload(desk, makeZip(Object.fromEntries(files)), name))).problems;

  test('a reprise that changes the roles of a member cancels their pending password link', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const zazaId = sql("SELECT id FROM member WHERE nickname = 'Zaza'");
    expect((await momo.post(`/api/members/${zazaId}/passwordLink`)).status()).toBe(201);
    expect(sql(`SELECT COUNT(*) FROM memberPasswordLink WHERE memberId = ${zazaId}`)).toBe('1');

    const desk = await jibe(playwright);
    const zip = makeZip({ 'members.csv': memberRows('ADMIN') });
    expect((await load(desk, await upload(desk, zip), ['members'], false)).status()).toBe(200);
    expect(sql(`SELECT COUNT(*) FROM memberPasswordLink WHERE memberId = ${zazaId}`)).toBe('0');
  });

  test('a reprise loaded twice invites no one again: the first link still opens', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const zip = makeZip({ 'members.csv': memberRows('') });
    await load(desk, await upload(desk, zip), ['members']);
    expect((await receivedMails(1)).map((mail) => mail.to)).toEqual(['lulu@example.org']);
    const link = sql(
      "SELECT tokenHash FROM memberPasswordLink l JOIN member m ON m.id = l.memberId WHERE m.nickname = 'Lulu'",
    );

    await emptyMailbox();
    const second = await upload(desk, zip);
    expect(await read(desk, second)).toMatchObject({ invitations: 0 });
    await load(desk, second, ['members']);
    expect(await mailsAfterAWhile()).toEqual([]);
    expect(
      sql(
        "SELECT tokenHash FROM memberPasswordLink l JOIN member m ON m.id = l.memberId WHERE m.nickname = 'Lulu'",
      ),
    ).toBe(link);
  });

  test('an import that would leave its admin without a password is refused', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const files = await exportOf(desk, ['settings', 'members']);
    const data = JSON.parse(files.get('members/data.json')?.toString() ?? '{}');
    data.member = data.member.map((one: { email: string }) =>
      one.email === admin.email ? { ...one, passwordHash: null } : one,
    );
    files.set('members/data.json', jsonOf(data));
    expect(await problemsOf(desk, files, 'locked.zip')).toEqual([
      expect.objectContaining({ error: 'importerCannotSignIn', value: admin.email }),
    ]);
  });

  test('a file larger than its limit is refused without being read', async ({ playwright }) => {
    const desk = await jibe(playwright);
    const zip = makeZip({
      'members.csv': memberRows(''),
      'members/photos/Lulu.png': Buffer.alloc(11_000_000, 1),
    });
    expect((await read(desk, await upload(desk, zip))).problems).toEqual([
      expect.objectContaining({ file: 'members/photos/Lulu.png', error: 'invalidPhoto' }),
    ]);
  });

  test('two songs cannot be given the same spoken name by one reprise', async ({ playwright }) => {
    const desk = await jibe(playwright);
    const zip = makeZip({
      'songs.csv': csvOf([
        ['name', 'originalTitle', 'originalArtist', 'spokenNames'],
        ['Valerie', 'Valerie', 'Amy Winehouse', 'la valérie'],
        ['Rasputin', 'Rasputin', 'Boney M.', 'La Valerie'],
      ]),
    });
    expect((await read(desk, await upload(desk, zip))).problems).toEqual([
      expect.objectContaining({
        file: 'songs.csv',
        line: 3,
        column: 'spokenNames',
        error: 'twice',
      }),
    ]);
  });

  test('two songs whose names give the same folder keep their own files in the export', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    for (const name of ['Ça va', 'Ça va !']) {
      const id = addSong(name);
      expect((await sendFile(desk, `/api/songs/${id}/cover`, png(64))).status()).toBe(200);
    }
    const files = await exportOf(desk, ['settings', 'songs']);
    const covers = JSON.parse(files.get('songs/data.json')?.toString() ?? '{}').song.map(
      (song: { cover: string }) => song.cover,
    );
    expect(new Set(covers).size).toBe(2);
    for (const cover of covers) expect(files.has(`songs/${cover}`)).toBe(true);
  });

  test('an import checks each value and file as the app does, and lists what is wrong', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const files = await exportOf(desk, ['settings', 'members']);
    const settings = JSON.parse(files.get('settings/data.json')?.toString() ?? '{}');
    settings.band[0].setlistTargetMinutes = 7;
    settings.band[0].gigReminderHour = 30;
    files.set('settings/data.json', jsonOf(settings));
    expect(await problemsOf(desk, files, 'values.zip')).toEqual([
      expect.objectContaining({ column: 'gigReminderHour', error: 'invalid', value: '30' }),
      expect.objectContaining({ column: 'setlistTargetMinutes', error: 'invalid', value: '7' }),
    ]);
  });

  test('the songs whose score waits to be read by the browser are listed for the admin', async ({
    playwright,
  }) => {
    const desk = await jibe(playwright);
    const id = addSong('Valerie');
    sql(`UPDATE song SET museScorePath = 'songs/0123456789abcdef/score.mscz' WHERE id = ${id}`);
    addSong('Rasputin');
    expect((await (await desk.get('/api/transfer')).json()).scoresToRead).toEqual([
      { id, name: 'Valerie' },
    ]);
  });
});
