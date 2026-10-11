import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import {
  addMember,
  admin,
  deviceOf,
  install,
  memberId,
  memberPassword,
  signIn,
} from '../support/scenario.ts';

// Password links: the invitation of a new member and a forgotten password.
// Rules and access rights: model/members.md, entry 3.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Titi', status: 'INVITED' });
  addMember({ nickname: 'Lolo', status: 'LEFT' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const newPassword = 'helicon-en-fa-diese-9';

/** Creates the link of a member, as Momo who manages members, and returns its token. */
async function linkFor(playwright: Parameters<typeof deviceOf>[0], nickname: string) {
  const momo = await deviceOf(playwright, email('Momo'));
  const response = await momo.post(`/api/members/${memberId(nickname)}/passwordLink`);
  expect(response.status()).toBe(201);
  const token = (await response.json()).passwordLinkToken as string;
  await momo.dispose();
  return token;
}

test('an invited member chooses a password with their link, and is active and signed in', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Titi');

  // The screen first asks who the link is for.
  const check = await request.post('/api/passwordLink/check', { data: { token } });
  expect(await check.json()).toEqual({ nickname: 'Titi' });

  const used = await request.post('/api/passwordLink/use', {
    data: { token, password: newPassword },
  });
  expect(used.status()).toBe(200);
  expect(await used.json()).toMatchObject({ nickname: 'Titi', status: 'ACTIVE' });
  expect((await request.get('/api/me')).status()).toBe(200);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');

  // The link served once.
  const again = await request.post('/api/passwordLink/use', {
    data: { token, password: 'another-password-1' },
  });
  expect(again.status()).toBe(404);
  expect(await again.json()).toEqual({ error: 'invalidPasswordLink' });

  const other = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
  expect((await signIn(other, email('Titi'), newPassword)).status()).toBe(200);
  await other.dispose();
});

test('a forgotten password: the link replaces the password and signs every device out', async ({
  playwright,
  request,
}) => {
  const device = await deviceOf(playwright, email('Zaza'));
  // Zaza has locked sign-in while trying to remember.
  sql(`UPDATE member SET failedSignInCount = 3, signInLockedUntil = NOW() + INTERVAL 10 MINUTE
       WHERE nickname = 'Zaza'`);
  const token = await linkFor(playwright, 'Zaza');

  const used = await request.post('/api/passwordLink/use', {
    data: { token, password: newPassword },
  });
  expect(used.status()).toBe(200);
  expect((await used.json()).status).toBe('ACTIVE');

  expect((await device.get('/api/me')).status()).toBe(401);
  expect(sql(`SELECT COUNT(*) FROM memberSession WHERE memberId = ${memberId('Zaza')}`)).toBe('1');
  expect(
    sql("SELECT failedSignInCount, signInLockedUntil IS NULL FROM member WHERE nickname = 'Zaza'"),
  ).toBe('0\t1');
  expect((await signIn(device, email('Zaza'), memberPassword)).status()).toBe(401);
  expect((await signIn(device, email('Zaza'), newPassword)).status()).toBe(200);
  await device.dispose();
});

test('a new link cancels the previous one', async ({ playwright, request }) => {
  const first = await linkFor(playwright, 'Titi');
  const second = await linkFor(playwright, 'Titi');

  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('1');
  expect((await request.post('/api/passwordLink/check', { data: { token: first } })).status()).toBe(
    404,
  );
  expect(
    (await request.post('/api/passwordLink/check', { data: { token: second } })).status(),
  ).toBe(200);
});

test('a link that opens nothing gets one answer, whatever the reason', async ({
  playwright,
  request,
}) => {
  const expired = await linkFor(playwright, 'Titi');
  // Valid 7 days.
  expect(sql('SELECT DATEDIFF(expiresAt, NOW()) FROM memberPasswordLink')).toMatch(/^[67]$/);
  sql('UPDATE memberPasswordLink SET expiresAt = NOW() - INTERVAL 1 SECOND');

  const tokens = [expired, 'f'.repeat(64), 'not-a-token', '', `${expired} `];
  for (const token of tokens) {
    for (const address of ['/api/passwordLink/check', '/api/passwordLink/use']) {
      const response = await request.post(address, { data: { token, password: newPassword } });
      // "check" takes no password: it refuses the extra field first.
      if (address.endsWith('check')) {
        expect(response.status()).toBe(422);
        continue;
      }
      expect(response.status(), token).toBe(404);
      expect(await response.json()).toEqual({ error: 'invalidPasswordLink' });
    }
    const check = await request.post('/api/passwordLink/check', { data: { token } });
    expect(check.status(), token).toBe(404);
    expect(await check.json()).toEqual({ error: 'invalidPasswordLink' });
  }
  expect(sql("SELECT status, passwordHash IS NULL FROM member WHERE nickname = 'Titi'")).toBe(
    'INVITED\t1',
  );
});

test('a password that does not follow the rule is refused, and the link still works', async ({
  playwright,
  request,
}) => {
  const token = await linkFor(playwright, 'Titi');

  const short = await request.post('/api/passwordLink/use', {
    data: { token, password: 'tubatuba' },
  });
  expect(short.status()).toBe(422);
  expect((await short.json()).fields).toEqual({ password: 'tooShort' });
  expect(sql("SELECT status FROM member WHERE nickname = 'Titi'")).toBe('INVITED');

  expect(
    (
      await request.post('/api/passwordLink/use', { data: { token, password: newPassword } })
    ).status(),
  ).toBe(200);
});

test('two uses of a link at the same instant: only one works', async ({ playwright, request }) => {
  const token = await linkFor(playwright, 'Titi');
  const answers = await Promise.all(
    ['premier-mot-de-passe-1', 'second-mot-de-passe-2'].map((password) =>
      request.post('/api/passwordLink/use', { data: { token, password } }),
    ),
  );

  expect(answers.map((answer) => answer.status()).sort()).toEqual([200, 404]);
});

test('only who manages members creates or cancels a link', async ({ playwright, request }) => {
  const zaza = await deviceOf(playwright, email('Zaza'));
  const titi = memberId('Titi');

  expect((await zaza.post(`/api/members/${titi}/passwordLink`)).status()).toBe(403);
  // Not even for themself: a forgotten password goes through who manages members.
  expect((await zaza.post(`/api/members/${memberId('Zaza')}/passwordLink`)).status()).toBe(403);
  expect((await request.post(`/api/members/${titi}/passwordLink`)).status()).toBe(401);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');

  const token = await linkFor(playwright, 'Titi');
  expect((await zaza.delete(`/api/members/${titi}/passwordLink`)).status()).toBe(403);

  const momo = await deviceOf(playwright, email('Momo'));
  expect((await momo.delete(`/api/members/${titi}/passwordLink`)).status()).toBe(200);
  expect((await request.post('/api/passwordLink/check', { data: { token } })).status()).toBe(404);
  await zaza.dispose();
  await momo.dispose();
});

test('who manages members cannot get the link of someone who may do more than them', async ({
  playwright,
}) => {
  addMember({ nickname: 'Lulu', roles: ['SONG_MANAGER'] });
  addMember({ nickname: 'Mimi', roles: ['MEMBER_MANAGER'] });
  const momo = await deviceOf(playwright, email('Momo'));

  // An admin, or a member with a role Momo does not hold: the link would give Momo their rights.
  for (const nickname of ['Jibé', 'Lulu']) {
    const response = await momo.post(`/api/members/${memberId(nickname)}/passwordLink`);
    expect(response.status(), nickname).toBe(403);
  }
  // Someone with the same rights, yes.
  expect((await momo.post(`/api/members/${memberId('Mimi')}/passwordLink`)).status()).toBe(201);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('1');

  // An admin creates a link for anyone.
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  expect((await jibe.post(`/api/members/${memberId('Lulu')}/passwordLink`)).status()).toBe(201);
  await momo.dispose();
  await jibe.dispose();
});

test('a member who left gets no link, and loses the one they had', async ({
  playwright,
  request,
}) => {
  const momo = await deviceOf(playwright, email('Momo'));

  const left = await momo.post(`/api/members/${memberId('Lolo')}/passwordLink`);
  expect(left.status()).toBe(409);
  expect(await left.json()).toEqual({ error: 'memberLeft' });

  const token = await linkFor(playwright, 'Zaza');
  await momo.put(`/api/members/${memberId('Zaza')}/status`, { data: { status: 'LEFT' } });
  expect((await request.post('/api/passwordLink/check', { data: { token } })).status()).toBe(404);
  await momo.dispose();
});

test('a link created before a member gets roles does not give those roles to who created it', async ({
  playwright,
  request,
}) => {
  // Momo, who manages members, holds the link of Zaza, a plain member...
  const token = await linkFor(playwright, 'Zaza');
  // ...and of Titi, whom Momo invited.
  const invitation = await linkFor(playwright, 'Titi');

  // An admin then makes them both admins.
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  for (const nickname of ['Zaza', 'Titi']) {
    const promoted = await jibe.put(`/api/members/${memberId(nickname)}/roles`, {
      data: { roles: ['ADMIN'] },
    });
    expect((await promoted.json()).hasPendingPasswordLink).toBe(false);
  }

  // The links Momo holds open nothing any more.
  for (const held of [token, invitation]) {
    const used = await request.post('/api/passwordLink/use', {
      data: { token: held, password: newPassword },
    });
    expect(used.status()).toBe(404);
  }
  expect((await request.get('/api/me')).status()).toBe(401);

  // Setting the same roles again changes nothing, and keeps a link.
  await jibe.post(`/api/members/${memberId('Titi')}/passwordLink`);
  await jibe.put(`/api/members/${memberId('Titi')}/roles`, { data: { roles: ['ADMIN'] } });
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('1');
  await jibe.dispose();
});

test('who manages members cannot cancel the link of someone who may do more than them', async ({
  playwright,
}) => {
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.post(`/api/members/${memberId('Jibé')}/passwordLink`);
  const momo = await deviceOf(playwright, email('Momo'));

  expect((await momo.delete(`/api/members/${memberId('Jibé')}/passwordLink`)).status()).toBe(403);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('1');
  await jibe.dispose();
  await momo.dispose();
});

test('a link used on a device signed in as someone else signs that someone out', async ({
  playwright,
}) => {
  const token = await linkFor(playwright, 'Titi');
  const device = await deviceOf(playwright, email('Zaza'));

  const used = await device.post('/api/passwordLink/use', {
    data: { token, password: newPassword },
  });
  expect((await used.json()).nickname).toBe('Titi');
  expect((await (await device.get('/api/me')).json()).nickname).toBe('Titi');
  expect(sql(`SELECT COUNT(*) FROM memberSession WHERE memberId = ${memberId('Zaza')}`)).toBe('0');
  await device.dispose();
});

test('a link used while the member leaves, or while a new link is created, never breaks', async ({
  playwright,
  request,
}) => {
  const momo = await deviceOf(playwright, email('Momo'));
  const other = await deviceOf(playwright, email('Momo'));

  for (let round = 0; round < 6; round++) {
    const nickname = `Presse${round}`;
    addMember({ nickname });
    const id = memberId(nickname);
    const token = (await (await momo.post(`/api/members/${id}/passwordLink`)).json())
      .passwordLinkToken;
    const answers = await Promise.all([
      request.post('/api/passwordLink/use', { data: { token, password: newPassword } }),
      round % 2 === 0
        ? momo.put(`/api/members/${id}/status`, { data: { status: 'LEFT' } })
        : other.post(`/api/members/${id}/passwordLink`),
    ]);
    // Each one is accepted or refused, in one order or the other: never an error of the server.
    for (const answer of answers) {
      expect(answer.status(), `${nickname} ${answer.url()}`).toBeLessThan(500);
    }
  }
  // Who left has no session, whatever came first.
  expect(
    sql(
      `SELECT COUNT(*) FROM memberSession s JOIN member m ON m.id = s.memberId WHERE m.status = 'LEFT'`,
    ),
  ).toBe('0');
  await momo.dispose();
  await other.dispose();
});

test('a member who left and comes back chooses a new password; the old one is gone', async ({
  playwright,
  request,
}) => {
  const momo = await deviceOf(playwright, email('Momo'));
  const zaza = memberId('Zaza');
  await momo.put(`/api/members/${zaza}/status`, { data: { status: 'LEFT' } });
  const back = await (
    await momo.put(`/api/members/${zaza}/status`, { data: { status: 'INVITED' } })
  ).json();

  // Invited again: the old password opens nothing.
  expect((await signIn(request, email('Zaza'), memberPassword)).status()).toBe(401);
  const used = await request.post('/api/passwordLink/use', {
    data: { token: back.passwordLinkToken, password: newPassword },
  });
  expect((await used.json()).status).toBe('ACTIVE');
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:8081' });
  expect((await signIn(other, email('Zaza'), memberPassword)).status()).toBe(401);
  expect((await signIn(other, email('Zaza'), newPassword)).status()).toBe(200);
  await other.dispose();
  await momo.dispose();
});
