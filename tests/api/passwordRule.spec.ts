import { expect, test } from '@playwright/test';
import { emptyDatabase, passwordHash, sql } from '../support/database.ts';
import {
  addMember,
  deviceOf,
  install,
  installInput,
  memberId,
  memberPassword,
  signIn,
} from '../support/scenario.ts';

// The rule of a new password, from 1.0.0 (model/members.md, "passwordHash";
// NIST SP 800-63B-4): 15 characters at least, no composition rule, neither
// among the most used passwords nor built from the email or the band's name.
// The band is "La Fanfare des Cuivres Déchaînés", Zaza's email
// zaza@example.org. Every password here is made up.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
});

/** What changing Zaza's password answers for this new password: 'ok', or the key of the refusal. */
async function judged(playwright: Parameters<typeof deviceOf>[0], newPassword: string) {
  const zaza = await deviceOf(playwright, 'zaza@example.org');
  const response = await zaza.put('/api/me/password', {
    data: { currentPassword: memberPassword, newPassword },
  });
  const body = await response.json();
  await zaza.dispose();
  if (response.ok()) {
    // Back to the password every test signs in with.
    sql(
      `UPDATE member SET passwordHash = '${passwordHash(memberPassword)}' WHERE nickname = 'Zaza'`,
    );
    return 'ok';
  }
  return (body.fields?.newPassword as string) ?? `status ${response.status()}`;
}

test('15 characters at least, counted in characters, spaces and accents allowed', async ({
  playwright,
}) => {
  expect(await judged(playwright, 'hélicon-en-fa-')).toBe('tooShort'); // 14
  expect(await judged(playwright, 'hélicon-en-fa-d')).toBe('ok'); // 15, one of them two bytes
  expect(await judged(playwright, 'le tuba ronfle au matin')).toBe('ok');
  // No composition rule: only lowercase letters is fine.
  expect(await judged(playwright, 'soubassophonerouge')).toBe('ok');
});

test('a password among the most used is refused, whatever its case', async ({ playwright }) => {
  expect(await judged(playwright, 'jetaimemonamour')).toBe('tooCommon');
  expect(await judged(playwright, 'JeTaimeMonAmour')).toBe('tooCommon');
  expect(await judged(playwright, 'qwerty123456789')).toBe('tooCommon');
});

test('a password built from the email or a word of the band is refused, without case or accents', async ({
  playwright,
}) => {
  expect(await judged(playwright, 'zaza joue du soubasso')).toBe('tooPersonal');
  expect(await judged(playwright, 'vive la FANFARE du coin')).toBe('tooPersonal');
  expect(await judged(playwright, 'les dechaines du dimanche')).toBe('tooPersonal');
  expect(await judged(playwright, 'cuivresetcompagnie')).toBe('tooPersonal');
  // Words of fewer than 4 characters do not count: "la", "des".
  expect(await judged(playwright, 'la clarinette des voisins')).toBe('ok');
});

test('a password link judges with the email of the member', async ({ playwright, request }) => {
  const momo = await deviceOf(playwright, 'momo@example.org');
  const link = await momo.post(`/api/members/${memberId('Zaza')}/passwordLink`);
  const token = (await link.json()).passwordLinkToken as string;
  await momo.dispose();

  const personal = await request.post('/api/passwordLink/use', {
    data: { token, password: 'zaza et son trombone' },
  });
  expect(personal.status()).toBe(422);
  expect((await personal.json()).fields).toEqual({ password: 'tooPersonal' });

  const common = await request.post('/api/passwordLink/use', {
    data: { token, password: '123456789azerty' },
  });
  expect((await common.json()).fields).toEqual({ password: 'tooCommon' });

  const right = await request.post('/api/passwordLink/use', {
    data: { token, password: 'le tuba ronfle au matin' },
  });
  expect(right.status()).toBe(200);
});

test('the install judges with the email of the first member and the name of the band', async ({
  request,
}) => {
  emptyDatabase();
  const input = installInput();
  input.admin.password = `${input.bandName.split(' ')[1]} pour toujours`;

  const response = await request.post('/api/install', { data: input });

  expect(response.status()).toBe(422);
  expect((await response.json()).fields).toEqual({ 'admin.password': 'tooPersonal' });
  expect(sql('SELECT COUNT(*) FROM member')).toBe('0');
});

test('a password chosen under the former rule (10 characters) still signs in', async ({
  request,
}) => {
  sql(`UPDATE member SET passwordHash = '${passwordHash('tuba-tuba1')}' WHERE nickname = 'Zaza'`);

  expect((await signIn(request, 'zaza@example.org', 'tuba-tuba1')).status()).toBe(200);
});
