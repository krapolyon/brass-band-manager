import { execFileSync, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import {
  dropTables,
  forgetLast,
  LAST,
  repairMigrations,
  unapplyLast,
} from '../support/migrations.ts';
import { addMember, admin, deviceOf, install, installInput, signIn } from '../support/scenario.ts';

// The migrations through the API, for a host without a command line. Rules:
// model/band.md, "Updating the database" and its line of "Access rights";
// model/members.md, "Install", for an empty database.

test.beforeEach(async ({ playwright, baseURL }) => {
  repairMigrations();
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

test.afterAll(repairMigrations);

test('an admin sees that nothing waits on a database that is up to date', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  const response = await request.get('/api/migrations');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ pending: [] });
});

test('an admin applies the migration that waits, with their password', async ({ request }) => {
  unapplyLast();
  await signIn(request, admin.email, admin.password);
  expect(await (await request.get('/api/migrations')).json()).toEqual({ pending: [LAST] });

  const response = await request.post('/api/migrations', { data: { password: admin.password } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ applied: [LAST], failed: null, pending: [] });
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('1');
  // The column is back, and the session of the admin went through it.
  expect(sql('SELECT COUNT(proposedAt) FROM gig')).toBe('0');
  expect((await request.get('/api/me')).status()).toBe(200);
});

test('a migration that fails is named, with what the database said, and stays to apply', async ({
  request,
}) => {
  forgetLast();
  await signIn(request, admin.email, admin.password);

  const response = await request.post('/api/migrations', { data: { password: admin.password } });

  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.applied).toEqual([]);
  expect(result.failed.name).toBe(LAST);
  expect(result.failed.message).toContain('proposedAt');
  expect(result.pending).toEqual([LAST]);
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
});

test('nothing is applied without the password, or with a wrong one, which counts as one', async ({
  request,
}) => {
  unapplyLast();
  await signIn(request, admin.email, admin.password);

  const missing = await request.post('/api/migrations', { data: {} });
  expect(missing.status()).toBe(422);

  const wrong = await request.post('/api/migrations', { data: { password: 'pas-le-bon-du-tout' } });
  expect(wrong.status()).toBe(422);
  expect(await wrong.json()).toEqual({ error: 'invalidInput', fields: { password: 'invalid' } });

  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
  expect(sql(`SELECT failedSignInCount FROM member WHERE email = '${admin.email}'`)).toBe('1');
});

test('at the fifth wrong password the device is signed out and nothing was applied', async ({
  request,
}) => {
  unapplyLast();
  await signIn(request, admin.email, admin.password);

  for (let attempt = 1; attempt <= 5; attempt++) {
    await request.post('/api/migrations', { data: { password: `pas-le-bon-${attempt}` } });
  }

  expect((await request.get('/api/me')).status()).toBe(401);
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
});

test('while sign-in is locked, even the right password applies nothing', async ({ request }) => {
  unapplyLast();
  await signIn(request, admin.email, admin.password);
  sql(
    `UPDATE member SET signInLockedUntil = NOW() + INTERVAL 10 MINUTE WHERE email = '${admin.email}'`,
  );

  const response = await request.post('/api/migrations', { data: { password: admin.password } });

  expect(response.status()).toBe(422);
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
});

test('a second run is refused while one is going on', async ({ request }) => {
  unapplyLast();
  await signIn(request, admin.email, admin.password);
  // Another connection holds the lock of a run for a few seconds.
  const holder = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'mysql',
      '-ubrassBand',
      '-plocal-only',
      'brassBandTest',
      '-e',
      "SELECT GET_LOCK('brassBandMigrations', 0); SELECT SLEEP(4);",
    ],
    { stdio: 'ignore' },
  );
  await expect.poll(() => sql("SELECT IS_USED_LOCK('brassBandMigrations') IS NOT NULL")).toBe('1');

  const response = await request.post('/api/migrations', { data: { password: admin.password } });

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: 'migrationsRunning' });
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
  await new Promise((resolve) => holder.on('exit', resolve));
});

test('only an admin lists or applies the migrations', async ({ playwright, request }) => {
  unapplyLast();
  const others = [
    addMember({ nickname: 'Zaza' }),
    addMember({
      nickname: 'Lulu',
      roles: ['MEMBER_MANAGER', 'SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER', 'QUOTE_MANAGER'],
    }),
  ];

  for (const email of others) {
    const device = await deviceOf(playwright, email);
    expect((await device.get('/api/migrations')).status()).toBe(403);
    const refused = await device.post('/api/migrations', {
      data: { password: 'grosse-caisse-claire-7' },
    });
    expect(refused.status()).toBe(403);
    const me = await (await device.get('/api/me')).json();
    expect(me.permissions).not.toContain('runMigrations');
    await device.dispose();
  }

  // Nobody signed in: refused before anything is read.
  expect((await request.get('/api/migrations')).status()).toBe(401);
  expect((await request.post('/api/migrations', { data: { password: 'x' } })).status()).toBe(401);
  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
});

test('once the app is installed, the install key applies nothing', async ({ request }) => {
  unapplyLast();

  const key = await request.post('/api/install/key', {
    data: { installKey: installInput().installKey },
  });
  expect(key.status()).toBe(409);
  const again = await request.post('/api/install', { data: installInput() });
  expect(again.status()).toBe(409);

  expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('0');
});

test.describe('on an empty database', () => {
  // No table at all, as on a host where the database was just created.
  test.beforeEach(() => {
    dropTables();
  });

  test('the app says it is not installed', async ({ request }) => {
    expect(await (await request.get('/api/band')).json()).toEqual({ error: 'notInstalled' });
    expect(await (await request.get('/api/install')).json()).toMatchObject({ installed: false });
  });

  test('the neutral name and icons are served, without an error', async ({ request }) => {
    const manifest = await request.get('/api/manifest');
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: 'Brass band' });
    expect((await request.get('/api/band/logo')).status()).toBe(404);
  });

  test('a migration that fails says so, and not what the database answered', async ({
    request,
  }) => {
    // A table stands in the way of the first migration.
    sql('CREATE TABLE section (id INT PRIMARY KEY)');

    const response = await request.post('/api/install/key', {
      data: { installKey: installInput().installKey },
    });

    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({ error: 'migrationFailed' });
  });

  test('a wrong install key creates no table', async ({ request }) => {
    const response = await request.post('/api/install/key', {
      data: { installKey: 'not-the-install-key-at-all' },
    });

    expect(response.status()).toBe(403);
    expect(sql('SHOW TABLES')).toBe('');
  });

  test('the right install key applies every migration, then the install goes on', async ({
    request,
  }) => {
    const key = await request.post('/api/install/key', {
      data: { installKey: installInput().installKey },
    });
    expect(key.status()).toBe(200);
    expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('1');

    await install(request);
    expect(await (await request.get('/api/migrations')).json()).toEqual({ pending: [] });
  });

  test('the install alone applies the migrations too', async ({ request }) => {
    await install(request);

    expect(sql('SELECT COUNT(*) FROM member')).toBe('1');
    expect(sql(`SELECT COUNT(*) FROM schemaMigration WHERE name = '${LAST}'`)).toBe('1');
  });
});

test.describe('the members an instance may write to', () => {
  // AllowedRecipients, asked straight to PHP: what a config.php gives.
  const allows = (setting: string, email: string) =>
    execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'web-test',
        'php',
        '-r',
        `require '/var/www/api/vendor/autoload.php';
         echo (new BrassBand\\Mail\\AllowedRecipients(${setting}))->allows($argv[1]) ? 'yes' : 'no';`,
        email,
      ],
      { encoding: 'utf8' },
    );

  test('no setting, or an empty list: everyone', () => {
    expect(allows('[]', 'zaza@example.org')).toBe('yes');
    expect(allows("['allowedRecipients' => []]", 'zaza@example.org')).toBe('yes');
  });

  test('a list: those addresses only, whatever their case', () => {
    const setting = "['allowedRecipients' => [' Zaza@Example.org ']]";
    expect(allows(setting, 'zaza@example.org')).toBe('yes');
    expect(allows(setting, 'momo@example.org')).toBe('no');
  });

  test('a mistake in the file writes to nobody, never to everyone', () => {
    expect(allows("['allowedRecipients' => 'zaza@example.org']", 'zaza@example.org')).toBe('no');
    expect(allows("['allowedRecipients' => ['', 12]]", 'zaza@example.org')).toBe('no');
    expect(allows("['allowedRecipients' => null]", 'zaza@example.org')).toBe('yes');
  });
});
