import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { emptyMailbox, receivedMails } from '../support/mail.ts';
import { addMember, admin, deviceOf, install, memberId, signIn } from '../support/scenario.ts';

// The names, email, phone and address of members, encrypted in the database
// (0.3.1, issue #32; model/members.md, entry 1, "Encryption"). Nobody here is
// real.
//
// The admin is installed through the API: their row is encrypted. The
// members added by the tests are written by SQL, in clear, as every row was
// before 0.3.1: they are read as they are until the database update
// encrypts them.

const personalColumns = [
  'firstName',
  'lastName',
  'email',
  'mobilePhone',
  'streetAddress',
  'postalCode',
  'city',
  'countryCode',
  'addressInstructions',
];
const onTestServer = (args: string[], input?: string) =>
  execFileSync('docker', ['compose', 'exec', '-T', 'web-test', ...args], {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });

/** What the row of a member holds, column by column, as a dump would show it. */
function stored(nickname: string): Record<string, string> {
  const values = sql(
    `SELECT ${personalColumns.map((column) => `IFNULL(${column}, 'NULL')`).join(', ')}, IFNULL(emailHash, 'NULL') FROM member WHERE nickname = '${nickname}'`,
  ).split('\t');
  return Object.fromEntries(
    [...personalColumns, 'emailHash'].map((column, i) => [column, values[i] ?? '']),
  );
}

// A record of made-up values, every personal field filled in.
const marilou = {
  nickname: 'Marilou',
  firstName: 'Marie-Lou',
  lastName: 'Fontaine-Dupré',
  email: 'marilou.fontaine@example.org',
  mobilePhone: '+33698765432',
  streetAddress: '12 rue des Capucins\nBâtiment B',
  postalCode: '69001',
  city: 'Lyon',
  countryCode: 'FR',
  addressInstructions: 'Code 4512, 3e étage',
};

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
});

const instrumentId = () => Number(sql("SELECT id FROM instrument WHERE name = 'Souba'"));

test('a new member is written encrypted: no name, email, phone or address in clear', async ({
  playwright,
}) => {
  const momo = await deviceOf(playwright, 'momo@example.org');
  const created = await momo.post('/api/members', {
    data: { ...marilou, instrumentId: instrumentId() },
  });
  expect(created.status()).toBe(201);

  const row = stored('Marilou');
  for (const column of personalColumns) {
    expect(row[column], column).toMatch(/^v1:[A-Za-z0-9+/]+=*$/);
  }
  const dump = Object.values(row).join(' ');
  for (const clear of [
    'Marie',
    'Fontaine',
    'marilou',
    '98765432',
    'Capucins',
    '69001',
    'Lyon',
    '4512',
  ]) {
    expect(dump).not.toContain(clear);
  }
  // The same value encrypted twice is never the same text: nothing to compare.
  expect(row.firstName).not.toBe(stored('Jibé').firstName);
  expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);

  // The app reads it back in clear.
  const record = await (await momo.get(`/api/members/${memberId('Marilou')}`)).json();
  expect(record).toMatchObject({ ...marilou });
  expect(record).not.toHaveProperty('emailHash');
  // The installed admin too.
  expect(stored('Jibé').email).toMatch(/^v1:/);
  const me = await (await deviceOf(playwright, admin.email, admin.password)).get('/api/me');
  expect(await me.json()).toMatchObject({ email: admin.email, firstName: admin.firstName });
});

test('sign-in and the forgotten password find a member by the hash of the email', async ({
  playwright,
  request,
}) => {
  const momo = await deviceOf(playwright, 'momo@example.org');
  await momo.post('/api/members', { data: { ...marilou, instrumentId: instrumentId() } });
  sql(
    `UPDATE member SET status = 'ACTIVE', passwordHash = (SELECT h FROM (SELECT passwordHash h FROM member WHERE nickname = 'Momo') x) WHERE nickname = 'Marilou'`,
  );

  // Encrypted rows: the installed admin and the member just created.
  expect((await signIn(request, admin.email, admin.password)).status()).toBe(200);
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
  expect((await signIn(other, marilou.email)).status()).toBe(200);
  // Typed with capitals: an email is stored, and hashed, in lowercase.
  expect((await signIn(other, 'Marilou.Fontaine@Example.org')).status()).toBe(200);
  expect((await signIn(other, 'marilou.fontaine@example.org', 'pas-le-bon')).status()).toBe(401);

  // Her invitation left by email when she was created (#50): the five minutes
  // between two emails are put behind her.
  sql('UPDATE memberPasswordLink SET emailedAt = NOW() - INTERVAL 10 MINUTE');
  await emptyMailbox();
  await other.post('/api/passwordLink/request', { data: { email: marilou.email } });
  const [mail] = await receivedMails(1);
  expect(mail?.to).toContain(marilou.email);
});

test('two members cannot share an email, encrypted or not yet', async ({ playwright }) => {
  const momo = await deviceOf(playwright, 'momo@example.org');
  const create = (email: string, nickname: string) =>
    momo.post('/api/members', {
      data: { ...marilou, nickname, email, instrumentId: instrumentId() },
    });

  // The admin's, encrypted; Momo's, still in clear.
  for (const taken of [admin.email, 'momo@example.org', 'MOMO@example.org']) {
    const response = await create(taken, `Autre ${taken.length}`);
    expect(response.status(), taken).toBe(422);
    expect((await response.json()).fields).toEqual({ email: 'duplicate' });
  }
  expect((await create(marilou.email, 'Marilou')).status()).toBe(201);
  expect((await create(marilou.email, 'Marilou bis')).status()).toBe(422);
  // Changed to an address that is taken: refused the same way.
  const changed = await momo.put(`/api/members/${memberId('Momo')}`, {
    data: { ...marilou, nickname: 'Momo', instrumentId: instrumentId() },
  });
  expect((await changed.json()).fields).toEqual({ email: 'duplicate' });

  // The database holds it too, whatever the API says.
  const hash = stored('Marilou').emailHash;
  expect(() => sql(`UPDATE member SET emailHash = '${hash}' WHERE nickname = 'Jibé'`)).toThrow();
});

test('the database update encrypts the rows written before 0.3.1, and can be run again', async ({
  playwright,
  request,
}) => {
  addMember({ nickname: 'Zaza' });
  sql(
    // Instructions that happen to start like an encrypted value: still text in clear.
    "UPDATE member SET mobilePhone = '+33612345678', city = 'Villeurbanne', countryCode = 'FR', addressInstructions = 'v1: sonner deux fois' WHERE nickname = 'Zaza'",
  );
  expect(stored('Zaza')).toMatchObject({
    email: 'zaza@example.org',
    emailHash: 'NULL',
    city: 'Villeurbanne',
  });
  // Before the update, a row in clear signs in and reads as it did.
  const zaza = await deviceOf(playwright, 'zaza@example.org');
  expect(await (await zaza.get('/api/me')).json()).toMatchObject({
    addressInstructions: 'v1: sonner deux fois',
  });

  await signIn(request, admin.email, admin.password);
  const run = await request.post('/api/migrations', { data: { password: admin.password } });
  expect(run.status()).toBe(200);

  const row = stored('Zaza');
  for (const column of ['firstName', 'lastName', 'email', 'mobilePhone', 'city', 'countryCode']) {
    expect(row[column], column).toMatch(/^v1:/);
  }
  expect(row.streetAddress).toBe('NULL');
  expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);
  // The same member, read as before; their session still holds.
  expect(await (await zaza.get('/api/me')).json()).toMatchObject({
    email: 'zaza@example.org',
    mobilePhone: '+33612345678',
    city: 'Villeurbanne',
    countryCode: 'FR',
    addressInstructions: 'v1: sonner deux fois',
  });
  // And signs in again, now through the hash of the email.
  await deviceOf(playwright, 'zaza@example.org');

  // Again: nothing changes, nothing is encrypted twice.
  const before = stored('Zaza');
  expect(
    (await request.post('/api/migrations', { data: { password: admin.password } })).status(),
  ).toBe(200);
  expect(stored('Zaza')).toEqual(before);
});

test('without its key, nothing is encrypted nor read, and the database update is refused', () => {
  // The classes of the server, with a configuration that has no key, a key
  // that is not one, then another key than the one that encrypted the rows.
  const script = `<?php
    $config = require '/var/www/api/bootstrap.php';
    $database = BrassBand\\Database::connect($config['database']);
    $say = function (callable $do): string {
        try { $do(); return 'done'; } catch (BrassBand\\Http\\ApiError $error) { return $error->getMessage(); }
    };
    foreach (['', 'trop-court', base64_encode(random_bytes(32))] as $key) {
        $personal = BrassBand\\Members\\PersonalData::from(['encryptionKey' => $key], $database);
        $migrations = new BrassBand\\Migrations\\Migrations($database, $config['migrationsFolder'], $personal);
        echo json_encode([
            'hasKey' => $personal->hasKey(),
            'run' => $say(fn () => $migrations->run()),
            'read' => $say(fn () => $personal->opened($database->fetchAssociative("SELECT email FROM member WHERE nickname = 'Jibé'"))),
        ]), "\\n";
    }`;
  const lines = onTestServer(['php'], script)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines[0]).toEqual({
    hasKey: false,
    run: 'encryptionKeyMissing',
    read: 'encryptionKeyMissing',
  });
  expect(lines[1]).toEqual({
    hasKey: false,
    run: 'encryptionKeyMissing',
    read: 'encryptionKeyMissing',
  });
  // Another key opens nothing: an error, never a wrong value. And the update
  // refuses it, rather than encrypt the rows left in clear with it.
  expect(lines[2]).toEqual({
    hasKey: true,
    run: 'encryptionKeyWrong',
    read: 'encryptionKeyWrong',
  });
  expect(stored('Momo')).toMatchObject({ email: 'momo@example.org', emailHash: 'NULL' });
});

test('no name, email or address of a member reaches the log of the server', async ({
  playwright,
  request,
}) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const momo = await deviceOf(playwright, 'momo@example.org');
  await momo.post('/api/members', { data: { ...marilou, instrumentId: instrumentId() } });
  await momo.put(`/api/members/${memberId('Marilou')}`, {
    data: { ...marilou, city: 'Caluire', instrumentId: instrumentId() },
  });
  await signIn(request, marilou.email, 'pas-le-bon');
  await request.post('/api/passwordLink/request', { data: { email: marilou.email } });
  await signIn(request, admin.email, admin.password);
  await request.post('/api/migrations', { data: { password: admin.password } });

  const log = execFileSync(
    'docker',
    ['compose', 'logs', '--no-log-prefix', '--since', since, 'web-test'],
    {
      encoding: 'utf8',
    },
  );
  for (const value of [
    'Marie-Lou',
    'Fontaine',
    'marilou',
    '98765432',
    'Capucins',
    'Caluire',
    '4512',
    admin.email,
  ]) {
    expect(log).not.toContain(value);
  }
});
