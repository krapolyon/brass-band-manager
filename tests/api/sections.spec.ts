import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';

// Sections and instruments after the install. Rules and access rights:
// model/members.md, entry 2.

type Section = {
  id: number;
  name: string;
  position: number;
  icon?: string | null;
  memberCount?: number;
  instruments: Section[];
};

// Installed with: Trompette (Trompette), Saxophone (Sax Alto, Sax Ténor), Souba (Souba).
// Jibé the admin plays the Sax Ténor.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

const id = (table: 'section' | 'instrument', name: string) =>
  Number(sql(`SELECT id FROM ${table} WHERE name = '${name}'`));
const outline = (sections: Section[]) =>
  sections.map(
    (section) => `${section.name}: ${section.instruments.map((i) => i.name).join(', ')}`,
  );

test('every signed-in member sees the sections and their instruments, in the order of the band', async ({
  playwright,
}) => {
  const zaza = await deviceOf(playwright, addMember({ nickname: 'Zaza' }));
  const sections: Section[] = await (await zaza.get('/api/sections')).json();

  expect(outline(sections)).toEqual([
    'Trompette: Trompette',
    'Saxophone: Sax Alto, Sax Ténor',
    'Souba: Souba',
  ]);
  expect(sections.map((section) => section.position)).toEqual([1, 2, 3]);
  // The pictograms the install was given, and how many members play each instrument.
  expect(sections.map((section) => section.icon)).toEqual(['trumpet', 'saxophone', null]);
  // Jibé plays the Sax Ténor; Zaza was given the first instrument.
  expect(sections.flatMap((s) => s.instruments.map((i) => `${i.name} ${i.memberCount}`))).toEqual([
    'Trompette 1',
    'Sax Alto 0',
    'Sax Ténor 1',
    'Souba 0',
  ]);
  await zaza.dispose();
});

test('an admin gives a section one of the pictograms of the app, or none', async ({
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const souba = id('section', 'Souba');

  const set = await jibe.put(`/api/sections/${souba}`, {
    data: { name: 'Souba', icon: 'sousaphone' },
  });
  expect(set.status()).toBe(200);
  expect(sql(`SELECT icon FROM section WHERE id = ${souba}`)).toBe('sousaphone');

  const unknown = await jibe.put(`/api/sections/${souba}`, {
    data: { name: 'Souba', icon: 'kazoo' },
  });
  expect(unknown.status()).toBe(422);
  expect(await unknown.json()).toEqual({ error: 'invalidInput', fields: { icon: 'invalid' } });
  expect(sql(`SELECT icon FROM section WHERE id = ${souba}`)).toBe('sousaphone');

  // Back to the generic pictogram.
  await jibe.put(`/api/sections/${souba}`, { data: { name: 'Souba', icon: null } });
  expect(sql(`SELECT icon IS NULL FROM section WHERE id = ${souba}`)).toBe('1');
  await jibe.dispose();
});

test('an admin adds a section, renames it and moves it', async ({ playwright }) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);

  const added = await jibe.post('/api/sections', { data: { name: '  Clarinette ' } });
  expect(added.status()).toBe(201);
  // A new section goes last.
  expect(outline(await added.json()).at(-1)).toBe('Clarinette: ');

  const moved = await jibe.put(`/api/sections/${id('section', 'Clarinette')}`, {
    data: { name: 'Anches', position: 2 },
  });
  expect(moved.status()).toBe(200);
  const sections: Section[] = await moved.json();
  expect(sections.map((section) => section.name)).toEqual([
    'Trompette',
    'Anches',
    'Saxophone',
    'Souba',
  ]);
  // The whole list is numbered again.
  expect(sections.map((section) => section.position)).toEqual([1, 2, 3, 4]);

  // A place beyond the list is the end of the list; no place asked changes nothing.
  await jibe.put(`/api/sections/${id('section', 'Anches')}`, {
    data: { name: 'Anches', position: 99 },
  });
  const renamed = await jibe.put(`/api/sections/${id('section', 'Anches')}`, {
    data: { name: 'Bois' },
  });
  expect((await renamed.json()).map((section: Section) => section.name)).toEqual([
    'Trompette',
    'Saxophone',
    'Souba',
    'Bois',
  ]);
  await jibe.dispose();
});

test('an admin adds an instrument, renames it, moves it inside its section and to another', async ({
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const saxophone = id('section', 'Saxophone');

  const added = await jibe.post('/api/instruments', {
    data: { name: 'Sax Baryton', sectionId: saxophone },
  });
  expect(added.status()).toBe(201);
  expect(outline(await added.json())[1]).toBe('Saxophone: Sax Alto, Sax Ténor, Sax Baryton');

  const first = await jibe.put(`/api/instruments/${id('instrument', 'Sax Baryton')}`, {
    data: { name: 'Baryton', sectionId: saxophone, position: 1 },
  });
  expect(outline(await first.json())[1]).toBe('Saxophone: Baryton, Sax Alto, Sax Ténor');

  // To another section: at its end, and the section it left closes the gap.
  const moved = await jibe.put(`/api/instruments/${id('instrument', 'Baryton')}`, {
    data: { name: 'Baryton', sectionId: id('section', 'Souba') },
  });
  expect(outline(await moved.json())).toEqual([
    'Trompette: Trompette',
    'Saxophone: Sax Alto, Sax Ténor',
    'Souba: Souba, Baryton',
  ]);
  await jibe.dispose();
});

test('moving an instrument to another section moves its members with it', async ({
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const section = () =>
    sql(`SELECT s.name FROM member m JOIN instrument i ON i.id = m.instrumentId
         JOIN section s ON s.id = i.sectionId WHERE m.id = ${memberId('Jibé')}`);
  expect(section()).toBe('Saxophone');

  await jibe.put(`/api/instruments/${id('instrument', 'Sax Ténor')}`, {
    data: { name: 'Sax Ténor', sectionId: id('section', 'Souba') },
  });
  expect(section()).toBe('Souba');
  await jibe.dispose();
});

test('a name that is missing, too long or already taken is refused', async ({ playwright }) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const saxophone = id('section', 'Saxophone');
  const refused = async (address: string, data: object, fields: object) => {
    const response =
      address.includes('/api/sections/') || address.includes('/api/instruments/')
        ? await jibe.put(address, { data })
        : await jibe.post(address, { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    expect((await response.json()).fields).toEqual(fields);
  };

  await refused('/api/sections', { name: ' ' }, { name: 'required' });
  await refused('/api/sections', { name: 'x'.repeat(51) }, { name: 'tooLong' });
  // The same name for the database: case and accents do not count.
  await refused('/api/sections', { name: 'SOUBA' }, { name: 'duplicate' });
  await refused(`/api/sections/${saxophone}`, { name: 'Trompette' }, { name: 'duplicate' });
  await refused(
    '/api/instruments',
    { name: 'sax tenor', sectionId: saxophone },
    { name: 'duplicate' },
  );
  await refused('/api/instruments', { name: 'Hélicon', sectionId: 9999 }, { sectionId: 'invalid' });
  await refused('/api/instruments', { name: 'Hélicon' }, { sectionId: 'invalid' });
  // Its own name is not a duplicate.
  expect(
    (await jibe.put(`/api/sections/${saxophone}`, { data: { name: 'saxophone' } })).status(),
  ).toBe(200);

  expect(sql('SELECT COUNT(*) FROM section')).toBe('3');
  expect(sql('SELECT COUNT(*) FROM instrument')).toBe('4');
  await jibe.dispose();
});

test('a section is deleted when empty, an instrument when nobody plays it', async ({
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);

  const full = await jibe.delete(`/api/sections/${id('section', 'Souba')}`);
  expect(full.status()).toBe(409);
  expect(await full.json()).toEqual({ error: 'sectionNotEmpty' });

  const played = await jibe.delete(`/api/instruments/${id('instrument', 'Sax Ténor')}`);
  expect(played.status()).toBe(409);
  expect(await played.json()).toEqual({ error: 'instrumentInUse' });

  expect((await jibe.delete(`/api/instruments/${id('instrument', 'Souba')}`)).status()).toBe(200);
  const emptied = await jibe.delete(`/api/sections/${id('section', 'Souba')}`);
  expect(outline(await emptied.json())).toEqual([
    'Trompette: Trompette',
    'Saxophone: Sax Alto, Sax Ténor',
  ]);

  expect((await jibe.delete('/api/sections/9999')).status()).toBe(404);
  expect(
    (await jibe.put('/api/instruments/9999', { data: { name: 'x', sectionId: 1 } })).status(),
  ).toBe(404);
  await jibe.dispose();
});

test('an instrument stays as long as a member who left played it', async ({ playwright }) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  addMember({ nickname: 'Lolo', status: 'LEFT' });
  sql(`UPDATE member SET instrumentId = ${id('instrument', 'Souba')} WHERE nickname = 'Lolo'`);

  expect((await jibe.delete(`/api/instruments/${id('instrument', 'Souba')}`)).status()).toBe(409);
  await jibe.dispose();
});

test('invited and former members are not counted as players, and only an admin is told of them', async ({
  playwright,
}) => {
  const souba = id('instrument', 'Souba');
  const zaza = await deviceOf(playwright, addMember({ nickname: 'Zaza' }));
  addMember({ nickname: 'Lolo', status: 'LEFT' });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
  addMember({ nickname: 'Momo', status: 'POWER_MEMBER' });
  sql(`UPDATE member SET instrumentId = ${souba} WHERE nickname IN ('Lolo', 'Kiki', 'Momo')`);
  const soubaOf = async (device: typeof zaza) =>
    ((await (await device.get('/api/sections')).json()) as Section[])
      .flatMap((section) => section.instruments)
      .find((instrument) => instrument.id === souba);

  // A power member is a current member: Momo alone is counted.
  expect(await soubaOf(zaza)).toEqual({ id: souba, name: 'Souba', position: 1, memberCount: 1 });

  const jibe = await deviceOf(playwright, admin.email, admin.password);
  expect(await soubaOf(jibe)).toMatchObject({ memberCount: 1, otherMemberCount: 2 });
  await zaza.dispose();
  await jibe.dispose();
});

test('only an admin changes sections and instruments', async ({ playwright, request }) => {
  const others = [
    addMember({ nickname: 'Zaza' }),
    addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] }),
    addMember({
      nickname: 'Lulu',
      roles: ['SONG_MANAGER', 'GIG_MANAGER', 'SETLIST_MANAGER', 'QUOTE_MANAGER'],
    }),
  ];
  const trompette = id('section', 'Trompette');
  const instrument = id('instrument', 'Trompette');
  const writes = (device: typeof request) => [
    device.post('/api/sections', { data: { name: 'Clarinette' } }),
    device.put(`/api/sections/${trompette}`, { data: { name: 'Cuivres' } }),
    device.delete(`/api/sections/${trompette}`),
    device.post('/api/instruments', { data: { name: 'Bugle', sectionId: trompette } }),
    device.put(`/api/instruments/${instrument}`, { data: { name: 'Bugle', sectionId: trompette } }),
    device.delete(`/api/instruments/${instrument}`),
  ];

  for (const email of others) {
    const device = await deviceOf(playwright, email);
    for (const response of await Promise.all(writes(device))) {
      expect(response.status(), `${email} ${response.url()}`).toBe(403);
    }
    await device.dispose();
  }
  for (const response of await Promise.all(writes(request))) {
    expect(response.status()).toBe(401);
  }

  expect(sql('SELECT GROUP_CONCAT(name ORDER BY position) FROM section')).toBe(
    'Trompette,Saxophone,Souba',
  );
  expect(sql('SELECT COUNT(*) FROM instrument')).toBe('4');
});
