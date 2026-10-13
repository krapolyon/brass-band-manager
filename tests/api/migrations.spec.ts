import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { forgetLast, LAST, repairMigrations, unapplyLast } from '../support/migrations.ts';
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
    const tables = sql('SHOW TABLES').split('\n').filter(Boolean);
    sql(
      `SET FOREIGN_KEY_CHECKS = 0; ${tables.map((table) => `DROP TABLE \`${table}\`;`).join(' ')} SET FOREIGN_KEY_CHECKS = 1;`,
    );
  });

  test('the app says it is not installed', async ({ request }) => {
    expect(await (await request.get('/api/band')).json()).toEqual({ error: 'notInstalled' });
    expect(await (await request.get('/api/install')).json()).toMatchObject({ installed: false });
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
    expect(sql('SELECT name FROM schemaMigration ORDER BY name DESC LIMIT 1')).toBe(LAST);

    await install(request);
    expect(await (await request.get('/api/migrations')).json()).toEqual({ pending: [] });
  });

  test('the install alone applies the migrations too', async ({ request }) => {
    await install(request);

    expect(sql('SELECT COUNT(*) FROM member')).toBe('1');
    expect(sql('SELECT name FROM schemaMigration ORDER BY name DESC LIMIT 1')).toBe(LAST);
  });
});
