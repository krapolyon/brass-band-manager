import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { emptyMailbox, mailsAfterAWhile, receivedMails } from '../support/mail.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';

// Forgotten password by email. Rules: model/members.md, "Forgotten password"
// and entry 3 ("A link asked from the sign-in screen is sent by the app").

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
});

const tokenIn = (text: string) => text.match(/#([0-9a-f]{64})/)?.[1] ?? '';

test('a current member receives a link that lets them choose a new password, for one hour', async ({
  request,
}) => {
  const email = addMember({ nickname: 'Zaza' });

  const response = await request.post('/api/passwordLink/request', { data: { email } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ sent: true });

  const [mail] = await receivedMails(1);
  expect(mail?.to).toBe(email);
  // Written from the address of the configuration, under the name of the band.
  expect(mail?.from).toBe('La Fanfare des Cuivres Déchaînés <app@example.org>');
  expect(mail?.subject).toBe('Ton nouveau mot de passe pour La Fanfare des Cuivres Déchaînés');
  // The link starts with the address of the app written in the configuration.
  expect(mail?.text).toContain('http://localhost:8081/password#');
  // The name of the band and the link, nothing else about the member.
  expect(mail?.text).not.toContain('Zaza');
  expect(mail?.text).not.toContain('Prénom');

  expect(
    sql(`SELECT TIMESTAMPDIFF(MINUTE, NOW(), expiresAt) BETWEEN 58 AND 60, emailedAt IS NOT NULL
         FROM memberPasswordLink WHERE memberId = ${memberId('Zaza')}`),
  ).toBe('1\t1');

  const used = await request.post('/api/passwordLink/use', {
    data: { token: tokenIn(mail?.text ?? ''), password: 'un-nouveau-mot-de-passe' },
  });
  expect(used.status()).toBe(200);
  expect((await used.json()).nickname).toBe('Zaza');
});

test('a power member is a current member too', async ({ request }) => {
  const email = addMember({ nickname: 'Tonton', status: 'POWER_MEMBER' });

  await request.post('/api/passwordLink/request', { data: { email } });

  expect((await receivedMails(1))[0]?.to).toBe(email);
});

test('whatever the address, the answer is the same and nobody else gets an email', async ({
  request,
}) => {
  const others = [
    'personne@example.org',
    addMember({ nickname: 'Kiki', status: 'INVITED' }),
    addMember({ nickname: 'Bouboule', status: 'LEFT' }),
    'not-an-email',
  ];

  for (const email of others) {
    const response = await request.post('/api/passwordLink/request', { data: { email } });
    expect(response.status(), email).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
  }

  expect(await mailsAfterAWhile()).toEqual([]);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
});

test('no second email leaves within five minutes, and the first link still works', async ({
  request,
}) => {
  const email = addMember({ nickname: 'Zaza' });
  await request.post('/api/passwordLink/request', { data: { email } });
  const [first] = await receivedMails(1);

  const check = (text: string) =>
    request.post('/api/passwordLink/check', { data: { token: tokenIn(text) } });
  const again = await request.post('/api/passwordLink/request', { data: { email } });
  expect(await again.json()).toEqual({ sent: true });
  expect(await mailsAfterAWhile()).toHaveLength(1);
  // The request made too soon changed nothing: the first link still opens.
  expect((await check(first?.text ?? '')).status()).toBe(200);

  // Five minutes later, a new email leaves, and the old link is cancelled.
  sql('UPDATE memberPasswordLink SET emailedAt = NOW() - INTERVAL 6 MINUTE');
  await request.post('/api/passwordLink/request', { data: { email } });
  const mails = await receivedMails(2);
  const second = mails.find((mail) => mail.text !== first?.text);
  expect((await check(first?.text ?? '')).status()).toBe(404);
  expect((await check(second?.text ?? '')).status()).toBe(200);
});

test('requests made at the same instant send one email', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });

  const answers = await Promise.all(
    Array.from({ length: 5 }, () => request.post('/api/passwordLink/request', { data: { email } })),
  );

  expect(answers.map((answer) => answer.status())).toEqual([200, 200, 200, 200, 200]);

  expect(await mailsAfterAWhile()).toHaveLength(1);
});

test('nothing in the email follows the host a request claims', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });

  await request.post('/api/passwordLink/request', {
    data: { email },
    headers: { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' },
  });

  const [mail] = await receivedMails(1);
  expect(mail?.text).not.toContain('evil.example');
  expect(mail?.text).toContain('http://localhost:8081/password#');
  // Nor the id of the message, which mail servers judge an email by.
  expect(mail?.messageId).toMatch(/@localhost$/);
});

test('an address that only looks like the one of a member gets nothing', async ({ request }) => {
  addMember({ nickname: 'Zaza' });
  // For the database "é" is "e", and a full-width letter is a plain one:
  // these addresses are found there, and are someone else's mailbox.
  for (const email of [
    'zazá@example.org',
    'ｚaza@example.org',
    'zaza@exämple.org',
    'zaza@example.org\u0001',
  ]) {
    const response = await request.post('/api/passwordLink/request', { data: { email } });
    expect(response.status(), email).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
  }

  expect(await mailsAfterAWhile()).toEqual([]);
  expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
});

test('the email goes to the address the database holds', async ({ request }) => {
  addMember({ nickname: 'Zaza' });

  await request.post('/api/passwordLink/request', { data: { email: ' Zaza@EXAMPLE.org' } });

  expect((await receivedMails(1))[0]?.to).toBe('zaza@example.org');
});

test('a link sent by email is refused after its hour', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });
  await request.post('/api/passwordLink/request', { data: { email } });
  const [mail] = await receivedMails(1);

  sql('UPDATE memberPasswordLink SET expiresAt = NOW() - INTERVAL 1 SECOND');

  const used = await request.post('/api/passwordLink/use', {
    data: { token: tokenIn(mail?.text ?? ''), password: 'un-nouveau-mot-de-passe' },
  });
  expect(used.status()).toBe(404);
});

test('an address far too long is not even looked up', async ({ request }) => {
  const response = await request.post('/api/passwordLink/request', {
    data: { email: `${'a'.repeat(300)}@example.org` },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ sent: true });
});

test('the answer says its length, so that the browser has it whole at once', async ({
  request,
}) => {
  const email = addMember({ nickname: 'Zaza' });

  const response = await request.post('/api/passwordLink/request', { data: { email } });

  expect(response.headers()['content-length']).toBe(String((await response.body()).length));
});

test('a link sent by email replaces the one a member manager created', async ({
  playwright,
  request,
}) => {
  const email = addMember({ nickname: 'Zaza' });
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  const created = await jibe.post(`/api/members/${memberId('Zaza')}/passwordLink`);
  const token = (await created.json()).passwordLinkToken as string;

  await request.post('/api/passwordLink/request', { data: { email } });
  await receivedMails(1);

  expect((await request.post('/api/passwordLink/check', { data: { token } })).status()).toBe(404);
  await jibe.dispose();
});

test('a request without an address is refused', async ({ request }) => {
  const response = await request.post('/api/passwordLink/request', { data: {} });

  expect(response.status()).toBe(422);
});

test.describe('on an instance that cannot send email', () => {
  test.use({ baseURL: 'http://localhost:8082' });

  test('the band says so, and no link is created', async ({ request }) => {
    const email = addMember({ nickname: 'Zaza' });

    expect((await (await request.get('/api/band')).json()).canSendEmail).toBe(false);
    const response = await request.post('/api/passwordLink/request', { data: { email } });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'emailUnavailable' });
    expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
  });
});

test('an instance with a mail server says that it can send email', async ({ request }) => {
  expect((await (await request.get('/api/band')).json()).canSendEmail).toBe(true);
});
