import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { admin, install, installInput } from '../support/scenario.ts';

test.beforeEach(() => emptyDatabase());

test('before install, the app says so and offers the starting library', async ({ request }) => {
  const status = await (await request.get('/api/install')).json();

  expect(status.installed).toBe(false);
  expect(status.languages).toEqual(['fr']);
  type LibraryInstrument = { name: string; preselected: boolean };
  type LibrarySection = { name: string; icon: string; instruments: LibraryInstrument[] };
  const sections: LibrarySection[] = status.library.sections;
  // The instruments ticked when the step opens: those of the first six
  // sections, the Sax Baryton excepted.
  const instruments = sections.flatMap((section) => section.instruments);
  expect(instruments.filter((i) => i.preselected).map((i) => i.name)).toEqual([
    'Trompette',
    'Sax Alto',
    'Sax Ténor',
    'Sax C Melody',
    'Trombone Ut',
    'Trombone Sib',
    'P’tite basse',
    'Souba',
    'Batterie',
    'Percus',
  ]);
  expect(instruments.filter((i) => !i.preselected).map((i) => i.name)).toEqual([
    'Sax Baryton',
    'Flûte',
    'Piccolo',
    'Clarinette',
  ]);
  expect(sections.map((section) => section.name)).toEqual([
    'Trompette',
    'Saxophone',
    'Trombone',
    'P’tites basses',
    'Souba',
    'Percu',
    'Flûte',
    'Clarinette',
  ]);
  // Each section of the library comes with its pictogram.
  expect(sections.map((section) => section.icon)).toEqual([
    'trumpet',
    'saxophone',
    'trombone',
    'tuba',
    'sousaphone',
    'drum',
    'flute',
    'clarinet',
  ]);
});

test('an unknown language falls back to the default library', async ({ request }) => {
  const status = await (await request.get('/api/install?language=../../config')).json();

  expect(status.library.sections).toHaveLength(8);
});

test('install creates the band, its sections and instruments, and the admin', async ({
  request,
}) => {
  const response = await request.post('/api/install', { data: installInput() });

  expect(response.status()).toBe(201);
  const me = await response.json();
  expect(me).toMatchObject({
    nickname: 'Jibé',
    firstName: 'Jean-Baptiste',
    lastName: 'Morel-Dubois',
    email: admin.email,
    status: 'ACTIVE',
    language: 'fr',
    colorScheme: 'AUTO',
    textSizePercent: 100,
    hasHighContrast: false,
    roles: ['ADMIN'],
  });
  expect(me.permissions).toEqual([
    'manageMembers',
    'manageRoles',
    'manageSections',
    'manageBand',
    'manageSongs',
    'manageGigs',
    'manageCostumes',
    'manageSetlists',
    'manageQuotes',
  ]);

  expect(sql('SELECT name, defaultLanguage FROM band')).toBe(
    'La Fanfare des Cuivres Déchaînés\tfr',
  );
  expect(
    sql(
      'SELECT s.name, i.name FROM instrument i JOIN section s ON s.id = i.sectionId ORDER BY s.position, i.position',
    ),
  ).toBe('Trompette\tTrompette\nSaxophone\tSax Alto\nSaxophone\tSax Ténor\nSouba\tSouba');
  expect(sql('SELECT i.name FROM member m JOIN instrument i ON i.id = m.instrumentId')).toBe(
    'Sax Ténor',
  );
});

test('install signs the admin in, with a protected cookie', async ({ request }) => {
  const response = await request.post('/api/install', { data: installInput() });

  const cookie = response.headers()['set-cookie'];
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect((await request.get('/api/me')).status()).toBe(200);
});

test('the password and the token of the session are stored hashed only', async ({ request }) => {
  const response = await request.post('/api/install', { data: installInput() });
  const token = /session=([0-9a-f]+)/.exec(response.headers()['set-cookie'] ?? '')?.[1];

  expect(token).toHaveLength(64);
  expect(sql('SELECT passwordHash FROM member')).not.toContain(admin.password);
  expect(sql('SELECT tokenHash FROM memberSession')).not.toBe(token);
});

test('install is refused once the app is installed', async ({ request, playwright, baseURL }) => {
  await install(request);
  const stranger = await playwright.request.newContext({ baseURL });

  const again = installInput();
  again.admin.email = 'someone.else@example.org';
  again.admin.nickname = 'Intrus';
  const response = await stranger.post('/api/install', { data: again });

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: 'alreadyInstalled' });
  expect(sql('SELECT COUNT(*) FROM member')).toBe('1');
  expect(await (await stranger.get('/api/install')).json()).toEqual({ installed: true });
});

test('install is refused without the install key of the server', async ({ request }) => {
  const input = installInput();
  input.installKey = 'a-guess';

  const response = await request.post('/api/install', { data: input });

  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: 'invalidInstallKey' });
  expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
});

test('install reports every faulty field at once and saves nothing', async ({ request }) => {
  const input = installInput();
  input.bandName = '   ';
  input.language = 'xx';
  input.sections[1]?.instruments.push('SAX ALTO');
  input.sections.push({ name: 'trompette', icon: 'kazoo', instruments: [] });
  input.admin.email = 'not-an-email';
  input.admin.password = 'short';
  input.admin.nickname = '';
  input.admin.instrument = 'Cornemuse';

  const response = await request.post('/api/install', { data: input });

  expect(response.status()).toBe(422);
  expect(await response.json()).toEqual({
    error: 'invalidInput',
    fields: {
      language: 'invalid',
      bandName: 'required',
      'sections.1.instruments.2': 'duplicate',
      'sections.3.name': 'duplicate',
      'sections.3.icon': 'invalid',
      'sections.3.instruments': 'required',
      'admin.email': 'invalid',
      'admin.password': 'tooShort',
      'admin.nickname': 'required',
      'admin.instrument': 'invalid',
    },
  });
  expect(sql('SELECT (SELECT COUNT(*) FROM band) + (SELECT COUNT(*) FROM section)')).toBe('0');
});

test('install refuses data that does not have the expected shape', async ({ request }) => {
  const response = await request.post('/api/install', {
    data: { ...installInput(), sections: 'all of them', isAdmin: true },
  });

  expect(response.status()).toBe(422);
  expect((await response.json()).error).toBe('invalidInput');
});

test('install refuses a password longer than what can be hashed', async ({ request }) => {
  const input = installInput();
  input.admin.password = 'é'.repeat(40);

  const response = await request.post('/api/install', { data: input });

  expect((await response.json()).fields).toEqual({ 'admin.password': 'tooLong' });
});

test('two names that differ only by an accent are refused as duplicates', async ({ request }) => {
  const input = installInput();
  input.sections.push({ name: 'Flûte', instruments: ['Flûte', 'Flute'] });

  const response = await request.post('/api/install', { data: input });

  expect(response.status()).toBe(422);
  expect(await response.json()).toEqual({
    error: 'invalidInput',
    fields: { sections: 'duplicate' },
  });
  expect(sql('SELECT (SELECT COUNT(*) FROM band) + (SELECT COUNT(*) FROM member)')).toBe('0');
});

test('names are saved without invisible characters or outer spaces', async ({ request }) => {
  const input = installInput();
  input.bandName = '\u00a0 Les Cuivres\u0000 du Jeudi \u00a0';
  input.admin.nickname = '\u00a0';

  const refused = await request.post('/api/install', { data: input });
  expect((await refused.json()).fields).toEqual({ 'admin.nickname': 'required' });

  input.admin.nickname = ' Jibé\t';
  await request.post('/api/install', { data: input });
  expect(sql('SELECT b.name, m.nickname FROM band b, member m')).toBe('Les Cuivres du Jeudi\tJibé');
});

test('a password the hashing function refuses is reported as a faulty field', async ({
  request,
}) => {
  const input = installInput();
  input.admin.password = 'trombone\u0000coulisse';

  const response = await request.post('/api/install', { data: input });

  expect(response.status()).toBe(422);
  expect((await response.json()).fields).toEqual({ 'admin.password': 'invalid' });
});

test('the install key can be checked before the first step', async ({ request }) => {
  const right = await request.post('/api/install/key', {
    data: { installKey: 'local-install-key' },
  });
  const wrong = await request.post('/api/install/key', {
    data: { installKey: 'local-install-kez' },
  });
  const missing = await request.post('/api/install/key', { data: {} });

  expect(right.status()).toBe(200);
  expect(await right.json()).toEqual({ valid: true });
  expect(wrong.status()).toBe(403);
  expect(await wrong.json()).toEqual({ error: 'invalidInstallKey' });
  expect(missing.status()).toBe(422);
  // Checking changes nothing.
  expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
});

test('a wrong install key costs a second', async ({ request }) => {
  const before = Date.now();
  await request.post('/api/install/key', { data: { installKey: 'x'.repeat(40) } });

  expect(Date.now() - before).toBeGreaterThanOrEqual(1000);
});

test('once installed, the key is no longer checked for anyone', async ({ request }) => {
  await install(request);

  const response = await request.post('/api/install/key', {
    data: { installKey: 'local-install-key' },
  });

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: 'alreadyInstalled' });
});
