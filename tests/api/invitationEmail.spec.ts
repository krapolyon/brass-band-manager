import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { emptyMailbox, mailsAfterAWhile, receivedMails } from '../support/mail.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';

// The invitation leaves by email (0.4.0, issue #50). Rules: model/members.md,
// "An invitation leaves by email", "Sending the invitation again". The
// people here are made up.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  await emptyMailbox();
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const band = 'La Fanfare des Cuivres Déchaînés';
const record = () => ({
  nickname: 'Kiki',
  firstName: 'Christine',
  lastName: 'Dupré',
  email: 'kiki@example.org',
  instrumentId: Number(sql("SELECT id FROM instrument WHERE name = 'Souba'")),
});
/** The token an email carries, after the # of its link. */
const tokenIn = (text: string) => text.match(/\/invitation#([0-9a-f]{64})/)?.[1];

test('with a mail server, inviting sends the link to the address of the record; it is shown once too', async ({
  playwright,
  request,
}) => {
  const momo = await deviceOf(playwright, email('Momo'));
  const created = await (await momo.post('/api/members', { data: record() })).json();

  expect(created.invitationEmailed).toBe(true);
  const [mail] = await receivedMails(1);
  expect(mail?.to).toBe('kiki@example.org');
  expect(mail?.from).toBe(`${band} <app@example.org>`);
  expect(mail?.subject).toBe(`${band} t’attendent dans leur app`);
  // The name of the band, the nickname and the link, nothing else of the member.
  expect(mail?.text).toContain('Bienvenue, Kiki');
  expect(mail?.text).not.toContain('Christine');
  expect(mail?.text).not.toContain('Dupré');
  expect(tokenIn(mail?.text ?? '')).toBe(created.passwordLinkToken);
  expect(mail?.html).toContain(`http://localhost:8081/invitation#${created.passwordLinkToken}`);
  // The link of an invitation lasts 7 days, sent by the app or not.
  expect(
    sql(
      `SELECT TIMESTAMPDIFF(MINUTE, NOW(), expiresAt) BETWEEN 7 * 24 * 60 - 5 AND 7 * 24 * 60, emailedAt IS NOT NULL FROM memberPasswordLink WHERE memberId = ${created.id}`,
    ),
  ).toBe('1\t1');
  expect(created.passwordLinkEmailedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  // The link of the email opens the invitation.
  const check = await request.post('/api/passwordLink/check', {
    data: { token: tokenIn(mail?.text ?? '') },
  });
  expect(await check.json()).toMatchObject({ isInvitation: true, nickname: 'Kiki' });
});

test('without a mail server, nothing is sent: the link is copied as before', async ({
  playwright,
}) => {
  const noMail = 'http://localhost:8082';
  const momo = await playwright.request.newContext({ baseURL: noMail });
  await momo.post('/api/session', {
    data: { email: email('Momo'), password: 'grosse-caisse-claire-7' },
  });
  const created = await (await momo.post('/api/members', { data: record() })).json();

  expect(created.invitationEmailed).toBe(false);
  expect(created.passwordLinkToken).toMatch(/^[0-9a-f]{64}$/);
  expect(created.passwordLinkEmailedAt).toBeNull();
  expect(await mailsAfterAWhile()).toHaveLength(0);
  // Resending needs a mail server.
  const resent = await momo.post(`/api/members/${created.id}/invitation`);
  expect(resent.status()).toBe(409);
  expect(await resent.json()).toEqual({ error: 'emailUnavailable' });
});

test.describe('sending the invitation again', () => {
  test('a new link leaves by email, the former one stops; not again within 5 minutes', async ({
    playwright,
    request,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const created = await (await momo.post('/api/members', { data: record() })).json();
    const [first] = await receivedMails(1);

    // Within 5 minutes: refused, and nothing changes.
    const soon = await momo.post(`/api/members/${created.id}/invitation`);
    expect(soon.status()).toBe(409);
    expect(await soon.json()).toEqual({ error: 'emailedRecently' });

    // Later: a new link, by email only.
    sql(
      `UPDATE memberPasswordLink SET emailedAt = NOW() - INTERVAL 6 MINUTE WHERE memberId = ${created.id}`,
    );
    await emptyMailbox();
    const resent = await momo.post(`/api/members/${created.id}/invitation`);
    expect(resent.status()).toBe(200);
    const answer = await resent.json();
    expect(answer).not.toHaveProperty('passwordLinkToken');
    expect(answer.passwordLinkEmailedAt).not.toBeNull();
    const [second] = await receivedMails(1);
    expect(second?.to).toBe('kiki@example.org');
    const [oldToken, newToken] = [tokenIn(first?.text ?? ''), tokenIn(second?.text ?? '')];
    expect(newToken).not.toBe(oldToken);
    expect(
      (await request.post('/api/passwordLink/check', { data: { token: oldToken } })).status(),
    ).toBe(404);
    expect(
      (await request.post('/api/passwordLink/check', { data: { token: newToken } })).status(),
    ).toBe(200);
  });

  test('only for an invited member, and only by who may act on their access', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    const created = await (await momo.post('/api/members', { data: record() })).json();
    sql(`UPDATE memberPasswordLink SET emailedAt = NULL`);

    // A plain member cannot.
    expect((await zaza.post(`/api/members/${created.id}/invitation`)).status()).toBe(403);
    // A current member has no invitation to send.
    const current = await momo.post(`/api/members/${memberId('Zaza')}/invitation`);
    expect(current.status()).toBe(409);
    expect(await current.json()).toEqual({ error: 'notInvited' });
    // An invited admin: only someone who may do as much.
    sql(
      `UPDATE member SET status = 'INVITED', passwordHash = NULL WHERE id = ${created.id}; INSERT INTO memberRole (memberId, role) VALUES (${created.id}, 'ADMIN')`,
    );
    expect((await momo.post(`/api/members/${created.id}/invitation`)).status()).toBe(403);
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await emptyMailbox();
    expect((await jibe.post(`/api/members/${created.id}/invitation`)).status()).toBe(200);
    expect(await receivedMails(1)).toHaveLength(1);
  });
});

test('a member brought back is invited by email again', async ({ playwright }) => {
  addMember({ nickname: 'Lolo', status: 'LEFT' });
  const momo = await deviceOf(playwright, email('Momo'));

  const back = await (
    await momo.put(`/api/members/${memberId('Lolo')}/status`, { data: { status: 'INVITED' } })
  ).json();

  expect(back.invitationEmailed).toBe(true);
  const [mail] = await receivedMails(1);
  expect(mail?.to).toBe(email('Lolo'));
  expect(tokenIn(mail?.text ?? '')).toBe(back.passwordLinkToken);
});

test('an instance that writes to some addresses only puts the others aside', async ({
  playwright,
}) => {
  // The server of port 8083 may write to one address, not this one.
  const allowed = 'http://localhost:8083';
  const momo = await playwright.request.newContext({ baseURL: allowed });
  await momo.post('/api/session', {
    data: { email: email('Momo'), password: 'grosse-caisse-claire-7' },
  });
  expect((await momo.post('/api/members', { data: record() })).status()).toBe(201);
  expect(await mailsAfterAWhile()).toHaveLength(0);
});
