import { expect, type PlaywrightWorkerArgs, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { png } from '../support/images.ts';
import { addMember, admin, deviceOf, install, memberId, signIn } from '../support/scenario.ts';
import { emptyStorage, storedFiles } from '../support/storage.ts';

// An invitation completed in one request: the invited member checks their
// record, gives a photo and their accessibility options, and chooses a
// password. Rules: model/members.md, entry 3 ("An invitation is completed in
// one request") and "Accessibility before sign-in".

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Kiki', status: 'INVITED' });
});

const password = 'helicon-en-fa-diese-9';

/** Creates the link of a member, as the admin, and returns its token. */
async function linkFor(playwright: PlaywrightWorkerArgs['playwright'], nickname: string) {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const response = await jibe.post(`/api/members/${memberId(nickname)}/passwordLink`);
  const token = (await response.json()).passwordLinkToken as string;
  await jibe.dispose();
  return token;
}

const instrument = (name: string) =>
  Number(sql(`SELECT id FROM instrument WHERE name = '${name}'`));
const record = (changes: object = {}) => ({
  nickname: 'Kiki',
  firstName: 'Christine',
  lastName: 'Dupré',
  email: 'christine.dupre@example.org',
  instrumentId: instrument('Sax Alto'),
  mobilePhone: '+33612345678',
  city: 'Lyon',
  countryCode: 'FR',
  ...changes,
});
const options = {
  hasHighContrast: true,
  hasIncreasedSpacing: false,
  hasLegibleFont: true,
  hasReducedMotion: false,
  hasExtendedTimeouts: false,
};

test('the link of an invitation shows the invited member their own record', async ({
  playwright,
  request,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.put(`/api/members/${memberId('Kiki')}/photo`, {
    data: { image: png(64).toString('base64') },
  });
  await jibe.dispose();
  const token = await linkFor(playwright, 'Kiki');

  const check = await request.post('/api/passwordLink/check', { data: { token } });

  expect(check.status()).toBe(200);
  const answer = await check.json();
  expect(answer).toMatchObject({
    isInvitation: true,
    nickname: 'Kiki',
    member: { nickname: 'Kiki', firstName: 'Prénom', lastName: 'Nom', email: 'kiki@example.org' },
  });
  // The photo itself, not an address: an address would need a session.
  expect(answer.photo).toMatch(/^data:image\/png;base64,/);
  // The instruments of the band, flat, in its order.
  expect(answer.instruments.map((i: { name: string }) => i.name)).toEqual([
    'Trompette',
    'Sax Alto',
    'Sax Ténor',
    'Souba',
  ]);
  // Nothing that is not theirs to see: no password, no status, no roles, no preferences.
  expect(Object.keys(answer.member).sort()).toEqual([
    'addressInstructions',
    'city',
    'countryCode',
    'email',
    'firstName',
    'instrumentId',
    'lastName',
    'mobilePhone',
    'nickname',
    'postalCode',
    'streetAddress',
  ]);
});

test('the link of a current member shows their nickname and nothing else', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Zaza');

  const check = await request.post('/api/passwordLink/check', { data: { token } });

  expect(await check.json()).toEqual({ isInvitation: false, nickname: 'Zaza' });
});

test('an invited member completes their account in one request, and is signed in', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Kiki');

  const used = await request.post('/api/passwordLink/use', {
    data: {
      token,
      password,
      member: record({ nickname: 'Kiki la Rousse' }),
      photo: { image: png(128).toString('base64') },
      accessibility: options,
    },
  });

  expect(used.status()).toBe(200);
  expect(await used.json()).toMatchObject({
    nickname: 'Kiki la Rousse',
    firstName: 'Christine',
    email: 'christine.dupre@example.org',
    mobilePhone: '+33612345678',
    status: 'ACTIVE',
    ...options,
  });
  expect((await used.json()).photoUrl).toMatch(/^\/api\/members\/\d+\/photo\?v=/);
  expect(storedFiles('members')).toHaveLength(1);
  expect((await request.get('/api/me')).status()).toBe(200);

  // They sign in with the address they corrected.
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
  expect((await signIn(other, 'christine.dupre@example.org', password)).status()).toBe(200);
  await other.dispose();
});

test('a faulty record saves nothing: no password, no photo, and the link still works', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Kiki');

  const refused = await request.post('/api/passwordLink/use', {
    data: {
      token,
      password,
      member: record({ nickname: 'ZAZA', email: 'not-an-email' }),
      photo: { image: png(128).toString('base64') },
      accessibility: options,
    },
  });

  expect(refused.status()).toBe(422);
  expect((await refused.json()).fields).toEqual({ nickname: 'duplicate', email: 'invalid' });
  expect(
    sql(
      `SELECT status, passwordHash IS NULL, firstName FROM member WHERE id = ${memberId('Kiki')}`,
    ),
  ).toBe('INVITED\t1\tPrénom');
  expect(storedFiles('members')).toEqual([]);
  expect((await request.get('/api/me')).status()).toBe(401);
  expect((await request.post('/api/passwordLink/check', { data: { token } })).status()).toBe(200);
});

test('a photo the app does not accept is refused, and a text size is not saved (#18)', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Kiki');
  const use = (data: object) =>
    request.post('/api/passwordLink/use', { data: { token, password, ...data } });

  const photo = await use({ photo: { image: Buffer.from('not an image').toString('base64') } });
  expect((await photo.json()).fields).toEqual({ photo: 'invalid' });
  expect(sql(`SELECT status FROM member WHERE id = ${memberId('Kiki')}`)).toBe('INVITED');

  // The text size stays on the device: the account has no such field (Members v1.21).
  const size = await use({ accessibility: { ...options, textSizePercent: 160 } });
  expect(size.status()).toBe(422);
  expect(sql(`SELECT status FROM member WHERE id = ${memberId('Kiki')}`)).toBe('INVITED');
  const accepted = await use({ accessibility: options });
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).not.toHaveProperty('textSizePercent');
});

test('an invited member can remove the photo they were given', async ({ playwright, request }) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.put(`/api/members/${memberId('Kiki')}/photo`, {
    data: { image: png(64).toString('base64') },
  });
  await jibe.dispose();
  expect(storedFiles('members')).toHaveLength(1);
  const token = await linkFor(playwright, 'Kiki');

  const used = await request.post('/api/passwordLink/use', {
    data: { token, password, member: record(), removePhoto: true },
  });

  expect((await used.json()).photoUrl).toBeNull();
  expect(storedFiles('members')).toEqual([]);
});

test('the first step asks whether the record would be accepted, and saves nothing', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Kiki');
  const validate = (member: object) =>
    request.post('/api/passwordLink/validate', { data: { token, member } });

  const taken = await validate(record({ nickname: 'Zaza' }));
  expect(taken.status()).toBe(422);
  expect((await taken.json()).fields).toEqual({ nickname: 'duplicate' });

  const fine = await validate(record());
  expect(fine.status()).toBe(200);
  expect(await fine.json()).toEqual({ valid: true });
  expect(sql(`SELECT firstName, status FROM member WHERE id = ${memberId('Kiki')}`)).toBe(
    'Prénom\tINVITED',
  );
});

test('an invitation tolerates ten refusals for a name already taken, then its link is dead', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Kiki');
  const validate = (member: object) =>
    request.post('/api/passwordLink/validate', { data: { token, member } });

  // A record refused for another reason, or accepted, is not counted.
  expect((await validate(record({ mobilePhone: 'abc' }))).status()).toBe(422);
  expect((await validate(record())).status()).toBe(200);

  // The last step tells as much as the first: both count.
  const used = await request.post('/api/passwordLink/use', {
    data: { token, password, member: record({ nickname: 'Zaza' }) },
  });
  expect(used.status()).toBe(422);
  for (let refusal = 2; refusal <= 10; refusal++) {
    const taken = await validate(record({ email: 'zaza@example.org' }));
    expect(await taken.json()).toEqual({ error: 'invalidInput', fields: { email: 'duplicate' } });
  }

  expect((await validate(record())).status()).toBe(404);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
  // Still invited: a member manager creates another link, which starts from zero.
  expect(sql("SELECT status FROM member WHERE nickname = 'Kiki'")).toBe('INVITED');
  const again = await linkFor(playwright, 'Kiki');
  const fine = await request.post('/api/passwordLink/validate', {
    data: { token: again, member: record() },
  });
  expect(fine.status()).toBe(200);
});

test('the link of a forgotten password cannot rewrite a record', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Zaza');
  const before = sql(`SELECT email, passwordHash FROM member WHERE id = ${memberId('Zaza')}`);

  const used = await request.post('/api/passwordLink/use', {
    data: { token, password, member: record({ nickname: 'Zaza', email: 'pirate@example.org' }) },
  });
  const validated = await request.post('/api/passwordLink/validate', {
    data: { token, member: record({ nickname: 'Zaza' }) },
  });
  const options140 = await request.post('/api/passwordLink/use', {
    data: { token, password, accessibility: options },
  });

  for (const response of [used, validated, options140]) {
    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'notInvited' });
  }
  expect(sql(`SELECT email, passwordHash FROM member WHERE id = ${memberId('Zaza')}`)).toBe(before);
  // The password itself can still be chosen with it.
  expect(
    (await request.post('/api/passwordLink/use', { data: { token, password } })).status(),
  ).toBe(200);
});

test('a link that opens nothing validates nothing', async ({ request }) => {
  const response = await request.post('/api/passwordLink/validate', {
    data: { token: 'a'.repeat(64), member: record() },
  });

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'invalidPasswordLink' });
});

test('two invited members who choose the same nickname at the same instant: one gets it', async ({
  playwright,
}) => {
  addMember({ nickname: 'Riton', status: 'INVITED' });
  const tokens = [await linkFor(playwright, 'Kiki'), await linkFor(playwright, 'Riton')];
  const devices = await Promise.all(
    tokens.map(() => playwright.request.newContext({ baseURL: 'http://localhost:8081' })),
  );

  const answers = await Promise.all(
    devices.map((device, index) =>
      device.post('/api/passwordLink/use', {
        data: {
          token: tokens[index],
          password,
          member: record({ nickname: 'Le Même', email: `meme${index}@example.org` }),
        },
      }),
    ),
  );

  expect(answers.map((answer) => answer.status()).sort()).toEqual([200, 422]);
  expect(sql("SELECT COUNT(*) FROM member WHERE nickname = 'Le Même'")).toBe('1');
  await Promise.all(devices.map((device) => device.dispose()));
});
