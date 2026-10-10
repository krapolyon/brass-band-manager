import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, install, memberPassword, signIn } from '../support/scenario.ts';

// Each test starts on an installed app, with a request context that is not signed in.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  // Install signed the admin in on another device: start with no session at all.
  sql('DELETE FROM memberSession');
});

test('a member signs in with their email and password', async ({ request }) => {
  const response = await signIn(request, admin.email, admin.password);

  expect(response.status()).toBe(200);
  expect((await response.json()).nickname).toBe('Jibé');
  expect((await request.get('/api/me')).status()).toBe(200);
});

test('the email is not sensitive to case or surrounding spaces', async ({ request }) => {
  const response = await signIn(request, '  JB.Morel@Example.org ', admin.password);

  expect(response.status()).toBe(200);
});

test('what a member receives about themself never holds the password', async ({ request }) => {
  const me = await (await signIn(request, admin.email, admin.password)).json();

  expect(Object.keys(me)).not.toContain('passwordHash');
  expect(Object.keys(me)).not.toContain('failedSignInCount');
  expect(JSON.stringify(me)).not.toContain('$2y$');
});

test('a wrong password and an unknown email get the same refusal', async ({ request }) => {
  const wrongPassword = await signIn(request, admin.email, 'not-the-password');
  const unknownEmail = await signIn(request, 'nobody@example.org', 'not-the-password');

  expect(wrongPassword.status()).toBe(401);
  expect(unknownEmail.status()).toBe(401);
  expect(await wrongPassword.json()).toEqual({ error: 'invalidCredentials' });
  expect(await unknownEmail.json()).toEqual({ error: 'invalidCredentials' });
});

test('without signing in, nothing but the public routes answers', async ({ request }) => {
  expect((await request.get('/api/me')).status()).toBe(401);
  expect(await (await request.get('/api/me')).json()).toEqual({ error: 'notSignedIn' });
  expect((await request.delete('/api/session')).status()).toBe(401);
  expect((await request.delete('/api/sessions')).status()).toBe(401);
  expect((await request.patch('/api/band', { data: { name: 'Autre' } })).status()).toBe(401);
});

test('a made-up session cookie opens nothing', async ({ playwright, baseURL }) => {
  for (const value of ['a'.repeat(64), 'short', "' OR 1=1 -- "]) {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `session=${encodeURIComponent(value)}` },
    });
    expect((await context.get('/api/me')).status()).toBe(401);
    await context.dispose();
  }
});

test('five wrong passwords lock sign-in, even for the right password', async ({ request }) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await signIn(request, admin.email, 'not-the-password');
  }

  const locked = await signIn(request, admin.email, admin.password);
  expect(locked.status()).toBe(401);
  expect(await locked.json()).toEqual({ error: 'invalidCredentials' });

  // Fifteen minutes later.
  sql('UPDATE member SET signInLockedUntil = NOW() - INTERVAL 1 SECOND');
  expect((await signIn(request, admin.email, admin.password)).status()).toBe(200);
  expect(sql('SELECT failedSignInCount, signInLockedUntil IS NULL FROM member')).toBe('0\t1');
});

test('four wrong passwords then the right one signs in and resets the count', async ({
  request,
}) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await signIn(request, admin.email, 'not-the-password');
  }
  expect(sql('SELECT failedSignInCount FROM member')).toBe('4');

  expect((await signIn(request, admin.email, admin.password)).status()).toBe(200);
  expect(sql('SELECT failedSignInCount FROM member')).toBe('0');
});

test('only current members can sign in', async ({ playwright, baseURL }) => {
  const expected = { ACTIVE: 200, POWER_MEMBER: 200, LEFT: 401, INVITED: 401 } as const;

  for (const [status, code] of Object.entries(expected)) {
    const email = addMember({
      nickname: `Membre${status}`,
      status: status as keyof typeof expected,
    });
    const context = await playwright.request.newContext({ baseURL });
    expect((await signIn(context, email)).status(), status).toBe(code);
    await context.dispose();
  }
});

test('a member without a role holds no permission', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });

  const me = await (await signIn(request, email)).json();

  expect(me.roles).toEqual([]);
  expect(me.permissions).toEqual([]);
});

test('each role gives its own permission and nothing more', async ({ playwright, baseURL }) => {
  const expected = {
    MEMBER_MANAGER: ['manageMembers'],
    SONG_MANAGER: ['manageSongs'],
    GIG_MANAGER: ['manageGigs'],
    SETLIST_MANAGER: ['manageSetlists'],
    QUOTE_MANAGER: ['manageQuotes'],
  };

  for (const [role, permissions] of Object.entries(expected)) {
    const email = addMember({ nickname: `Role${role}`, roles: [role] });
    const context = await playwright.request.newContext({ baseURL });
    expect((await (await signIn(context, email)).json()).permissions, role).toEqual(permissions);
    await context.dispose();
  }
});

test('signing out closes the session of this device only', async ({
  request,
  playwright,
  baseURL,
}) => {
  const otherDevice = await playwright.request.newContext({ baseURL });
  await signIn(request, admin.email, admin.password);
  await signIn(otherDevice, admin.email, admin.password);

  const response = await request.delete('/api/session');

  expect(response.status()).toBe(200);
  expect(response.headers()['set-cookie']).toContain('Max-Age=0');
  expect((await request.get('/api/me')).status()).toBe(401);
  expect((await otherDevice.get('/api/me')).status()).toBe(200);
});

test('signing out everywhere closes the sessions of every device', async ({
  request,
  playwright,
  baseURL,
}) => {
  const otherDevice = await playwright.request.newContext({ baseURL });
  await signIn(request, admin.email, admin.password);
  await signIn(otherDevice, admin.email, admin.password);

  await request.delete('/api/sessions');

  expect((await request.get('/api/me')).status()).toBe(401);
  expect((await otherDevice.get('/api/me')).status()).toBe(401);
  expect(sql('SELECT COUNT(*) FROM memberSession')).toBe('0');
});

test('a session ends one year after sign-in', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  expect(sql('SELECT DATEDIFF(expiresAt, NOW()) FROM memberSession')).toBe('365');

  sql('UPDATE memberSession SET expiresAt = NOW() - INTERVAL 1 SECOND');

  expect((await request.get('/api/me')).status()).toBe(401);
});

test('a session ends after ninety days without use', async ({ request }) => {
  await signIn(request, admin.email, admin.password);

  sql('UPDATE memberSession SET lastUsedAt = NOW() - INTERVAL 89 DAY');
  expect((await request.get('/api/me')).status()).toBe(200);
  // Using it pushed the limit back.
  expect(sql('SELECT lastUsedAt > NOW() - INTERVAL 1 MINUTE FROM memberSession')).toBe('1');

  sql('UPDATE memberSession SET lastUsedAt = NOW() - INTERVAL 91 DAY');
  expect((await request.get('/api/me')).status()).toBe(401);
});

test('a member who leaves is signed out at once', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });
  await signIn(request, email);

  sql(`UPDATE member SET status = 'LEFT' WHERE email = '${email}'`);

  expect((await request.get('/api/me')).status()).toBe(401);
});

test('signing in clears the sessions that can no longer be used', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  sql('UPDATE memberSession SET expiresAt = NOW() - INTERVAL 1 DAY');

  await signIn(request, admin.email, admin.password);

  expect(sql('SELECT COUNT(*) FROM memberSession')).toBe('1');
});

test('a request that changes something is refused when it comes from another site', async ({
  request,
}) => {
  const fromAnotherSite = await request.post('/api/session', {
    data: { email: admin.email, password: admin.password },
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  const fromAnotherOrigin = await request.post('/api/session', {
    data: { email: admin.email, password: admin.password },
    headers: { Origin: 'https://elsewhere.example' },
  });

  expect(fromAnotherSite.status()).toBe(403);
  expect(await fromAnotherSite.json()).toEqual({ error: 'crossSiteRequest' });
  expect(fromAnotherOrigin.status()).toBe(403);
});

test('the same request from the app itself is accepted', async ({ request, baseURL }) => {
  const response = await request.post('/api/session', {
    data: { email: admin.email, password: admin.password },
    headers: { 'Sec-Fetch-Site': 'same-origin', Origin: baseURL as string },
  });

  expect(response.status()).toBe(200);
});

test('sign-in refuses data that does not have the expected shape', async ({ request }) => {
  const missing = await request.post('/api/session', { data: { email: admin.email } });
  const notJson = await request.post('/api/session', {
    data: 'email=a&password=b',
    headers: { 'Content-Type': 'text/plain' },
  });

  expect(missing.status()).toBe(422);
  expect(notJson.status()).toBe(400);
  expect(await notJson.json()).toEqual({ error: 'invalidBody' });
});

test('the member password used by other tests really works', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });

  expect((await signIn(request, email, memberPassword)).status()).toBe(200);
});

test('a password the hashing function refuses gets the usual refusal', async ({ request }) => {
  const known = await signIn(request, admin.email, 'a\u0000b');
  const unknown = await signIn(request, 'nobody@example.org', 'a\u0000b');

  expect(known.status()).toBe(401);
  expect(unknown.status()).toBe(401);
  expect(await unknown.json()).toEqual({ error: 'invalidCredentials' });
});

test("a password too long to be anyone's is refused without being counted", async ({ request }) => {
  const response = await signIn(request, admin.email, `${admin.password}${'x'.repeat(100)}`);

  expect(response.status()).toBe(401);
  expect(sql('SELECT failedSignInCount FROM member')).toBe('0');
});

test('wrong passwords sent at the same instant are counted one by one', async ({ request }) => {
  await Promise.all(
    Array.from({ length: 12 }, () => signIn(request, admin.email, 'not-the-password')),
  );

  // Five were judged and locked sign-in; the seven others found it locked.
  expect(sql('SELECT failedSignInCount, signInLockedUntil > NOW() FROM member')).toBe('0\t1');
  expect((await signIn(request, admin.email, admin.password)).status()).toBe(401);
});

test('an email is exact: an accent makes it another email', async ({ request }) => {
  const response = await signIn(request, 'jb.morél@example.org', admin.password);

  expect(response.status()).toBe(401);
});

test('signing in again on the same device replaces its session', async ({ request }) => {
  await signIn(request, admin.email, admin.password);
  await signIn(request, admin.email, admin.password);

  expect(sql('SELECT COUNT(*) FROM memberSession')).toBe('1');
  expect((await request.get('/api/me')).status()).toBe(200);
});

test('only JSON is accepted, not the data of a form', async ({ request }) => {
  const response = await request.post('/api/session', {
    form: { email: admin.email, password: admin.password },
  });

  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalidBody' });
});
