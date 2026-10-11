import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, install, signIn } from '../support/scenario.ts';

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

test('the band is public: its name, its logo and its three defaults', async ({ request }) => {
  const response = await request.get('/api/band');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    name: 'La Fanfare des Cuivres Déchaînés',
    // Install does not ask for these: the language it was done in, the first
    // theme, and the country of the language.
    defaultLanguage: 'fr',
    defaultAccentTheme: 'copper',
    defaultCountryCode: 'FR',
    // The test server has a mail server.
    canSendEmail: true,
    logoUrl: null,
    icons: null,
  });
});

test('before install there is no band to show', async ({ request }) => {
  emptyDatabase();

  const response = await request.get('/api/band');

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'notInstalled' });
});

test('an admin renames the band', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  const response = await request.patch('/api/band', { data: { name: '  Les Cuivres du Jeudi ' } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ name: 'Les Cuivres du Jeudi' });
  expect(
    sql('SELECT b.name, m.nickname FROM band b JOIN member m ON m.id = b.updatedByMemberId'),
  ).toBe('Les Cuivres du Jeudi\tJibé');
});

test('a member without the right cannot rename the band', async ({ playwright, baseURL }) => {
  const others = [
    addMember({ nickname: 'Zaza' }),
    addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] }),
    addMember({ nickname: 'Lulu', roles: ['SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER'] }),
  ];

  for (const email of others) {
    const context = await playwright.request.newContext({ baseURL });
    await signIn(context, email);
    const response = await context.patch('/api/band', { data: { name: 'Piraté' } });
    expect(response.status(), email).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    await context.dispose();
  }
  expect(sql('SELECT name FROM band')).toBe('La Fanfare des Cuivres Déchaînés');
});

test('an admin changes the accent theme and the country of the band, and nothing else moves', async ({
  request,
}) => {
  await signIn(request, admin.email, admin.password);

  const response = await request.patch('/api/band', {
    data: { defaultAccentTheme: 'mint', defaultCountryCode: 'BE' },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    name: 'La Fanfare des Cuivres Déchaînés',
    defaultAccentTheme: 'mint',
    defaultCountryCode: 'BE',
    defaultLanguage: 'fr',
  });
  expect(sql('SELECT name, defaultAccentTheme, defaultCountryCode FROM band')).toBe(
    'La Fanfare des Cuivres Déchaînés\tmint\tBE',
  );
});

test('a theme, a language or a country the app does not have is refused', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  const refused = async (data: object, fields: object) => {
    const response = await request.patch('/api/band', { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    expect((await response.json()).fields).toEqual(fields);
  };
  await refused({ defaultAccentTheme: 'gold' }, { defaultAccentTheme: 'invalid' });
  await refused({ defaultLanguage: 'xx' }, { defaultLanguage: 'invalid' });
  await refused({ defaultCountryCode: 'fr' }, { defaultCountryCode: 'invalid' });
  await refused({ defaultCountryCode: 'ZZ' }, { defaultCountryCode: 'invalid' });
  expect(sql('SELECT defaultAccentTheme, defaultLanguage, defaultCountryCode FROM band')).toBe(
    'copper\tfr\tFR',
  );
});

test('a faulty name is refused', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  const empty = await request.patch('/api/band', { data: { name: ' ' } });
  const long = await request.patch('/api/band', { data: { name: 'x'.repeat(81) } });
  const extra = await request.patch('/api/band', { data: { name: 'Ok', logoPath: 'x' } });
  const invisible = await request.patch('/api/band', { data: { name: '\u00a0' } });

  expect(await empty.json()).toEqual({ error: 'invalidInput', fields: { name: 'required' } });
  expect(await long.json()).toEqual({ error: 'invalidInput', fields: { name: 'tooLong' } });
  expect(extra.status()).toBe(422);
  expect(await invisible.json()).toEqual({ error: 'invalidInput', fields: { name: 'required' } });
});
