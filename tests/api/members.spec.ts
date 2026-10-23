import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';

// The directory of the band and the management of members. Each test is a
// line of model/members.md: "Life cycle", "Rules", "Roles and permissions"
// and "Access rights" of entry 1. Nobody here is real.

// The band of these tests: Jibé the admin (installed), Zaza a plain member,
// Momo who manages members, Popo a power member, Titi invited, Lolo who left.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Popo', status: 'POWER_MEMBER' });
  addMember({ nickname: 'Titi', status: 'INVITED' });
  addMember({ nickname: 'Lolo', status: 'LEFT' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;

/** A record that can be saved, to change field by field. */
function record(changes: object = {}) {
  return {
    nickname: 'Marilou la Tornade',
    firstName: 'Marie-Lou',
    lastName: 'Fontaine',
    email: 'marilou@example.org',
    instrumentId: Number(sql("SELECT id FROM instrument WHERE name = 'Souba'")),
    ...changes,
  };
}

test.describe('who sees whom', () => {
  test('a member sees the current members, and nothing about passwords or preferences', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const members = await (await zaza.get('/api/members')).json();

    // By nickname; the invited member and the one who left are not there.
    expect(members.map((member: { nickname: string }) => member.nickname)).toEqual([
      'Jibé',
      'Momo',
      'Popo',
      'Zaza',
    ]);
    expect(Object.keys(members[0]).sort()).toEqual(
      [
        'addressInstructions',
        'city',
        'countryCode',
        'email',
        'firstName',
        'id',
        'instrumentId',
        'lastName',
        'mobilePhone',
        'nickname',
        'photoUrl',
        'postalCode',
        'roles',
        'status',
        'streetAddress',
      ].sort(),
    );
    expect(members[0].roles).toEqual(['ADMIN']);
    expect(members[2].status).toBe('POWER_MEMBER');

    expect((await zaza.get(`/api/members/${memberId('Momo')}`)).status()).toBe(200);
    // A hidden member and a member who does not exist look the same.
    for (const hidden of [memberId('Titi'), memberId('Lolo'), 9999]) {
      const response = await zaza.get(`/api/members/${hidden}`);
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: 'notFound' });
    }
    await zaza.dispose();
  });

  test('who manages members also sees the invited ones, those who left, and pending links', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const members = await (await momo.get('/api/members')).json();

    expect(members.map((member: { nickname: string }) => member.nickname)).toEqual([
      'Jibé',
      'Lolo',
      'Momo',
      'Popo',
      'Titi',
      'Zaza',
    ]);
    expect(members[0].hasPendingPasswordLink).toBe(false);
    expect(members[0].passwordLinkExpiresAt).toBeNull();
    // Until when a pending link is valid: 7 days from its creation.
    const link = await momo.post(`/api/members/${memberId('Titi')}/passwordLink`);
    expect(link.status()).toBe(201);
    const titi = await (await momo.get(`/api/members/${memberId('Titi')}`)).json();
    const days = (Date.parse(titi.passwordLinkExpiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    // An expired link counts as none: the invitation is shown as expired.
    sql('UPDATE memberPasswordLink SET expiresAt = NOW() - INTERVAL 1 SECOND');
    expect(await (await momo.get(`/api/members/${memberId('Titi')}`)).json()).toMatchObject({
      status: 'INVITED',
      hasPendingPasswordLink: false,
      passwordLinkExpiresAt: null,
    });
    expect((await momo.get(`/api/members/${memberId('Lolo')}`)).status()).toBe(200);
    await momo.dispose();
  });

  test('nothing about members is given to someone who is not signed in', async ({ request }) => {
    for (const address of [
      '/api/members',
      '/api/members/1',
      '/api/members/1/photo',
      '/api/sections',
    ]) {
      const response = await request.get(address);
      expect(response.status(), address).toBe(401);
      expect(await response.json()).toEqual({ error: 'notSignedIn' });
    }
  });
});

test.describe('inviting a member', () => {
  test('who manages members creates a member, invited, with their password link', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const response = await momo.post('/api/members', {
      data: record({ nickname: '  Marilou la Tornade ', email: ' Marilou@Example.org ' }),
    });

    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      nickname: 'Marilou la Tornade',
      email: 'marilou@example.org',
      status: 'INVITED',
      roles: [],
      mobilePhone: null,
      hasPendingPasswordLink: true,
    });
    // Given once; the database only holds its hash.
    expect(created.passwordLinkToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sql('SELECT tokenHash FROM memberPasswordLink')).not.toBe(created.passwordLinkToken);
    expect(sql(`SELECT language, passwordHash IS NULL FROM member WHERE id = ${created.id}`)).toBe(
      'fr\t1',
    );
    expect(JSON.stringify(await (await momo.get('/api/members')).json())).not.toContain(
      created.passwordLinkToken,
    );
    await momo.dispose();
  });

  test('a member who does not manage members cannot invite', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const response = await zaza.post('/api/members', { data: record() });

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    expect(sql('SELECT COUNT(*) FROM member')).toBe('6');
    await zaza.dispose();
  });

  test('a faulty record is refused, field by field', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const refused = async (changes: object, fields: object) => {
      const response = await momo.post('/api/members', { data: record(changes) });
      expect(response.status(), JSON.stringify(changes)).toBe(422);
      expect((await response.json()).fields).toEqual(fields);
    };

    await refused(
      { nickname: ' ', firstName: '', lastName: ' ' },
      {
        nickname: 'required',
        firstName: 'required',
        lastName: 'required',
      },
    );
    await refused({ nickname: 'x'.repeat(51) }, { nickname: 'tooLong' });
    await refused({ email: 'marilou@example' }, { email: 'invalid' });
    await refused({ mobilePhone: '06 12 34 56 78' }, { mobilePhone: 'invalid' });
    await refused({ countryCode: 'France' }, { countryCode: 'invalid' });
    // Two letters that are no country.
    await refused({ countryCode: 'ZZ' }, { countryCode: 'invalid' });
    // Not rewritten into another number.
    await refused({ mobilePhone: '+33 (0)6 12 34 56 78' }, { mobilePhone: 'invalid' });
    // A name is read by the others: signs and invisible characters are not one.
    await refused(
      { nickname: '\u3164', firstName: '\u2800', lastName: '!!!' },
      {
        nickname: 'invalid',
        firstName: 'invalid',
        lastName: 'invalid',
      },
    );
    await refused({ instrumentId: 9999 }, { instrumentId: 'invalid' });
    await refused({ city: 'x'.repeat(81) }, { city: 'tooLong' });
    // The same nickname for the database: case and accents do not count.
    await refused({ nickname: 'JIBE' }, { nickname: 'duplicate' });
    await refused({ email: 'ZAZA@example.org' }, { email: 'duplicate' });
    // The email of a member who left is still theirs: they can be invited again.
    await refused({ email: email('Lolo') }, { email: 'duplicate' });
    // A status or roles are not part of a record.
    await refused({ status: 'ACTIVE' }, { status: 'invalid' });
    await refused({ roles: ['ADMIN'] }, { roles: 'invalid' });

    expect(sql('SELECT COUNT(*) FROM member')).toBe('6');
    await momo.dispose();
  });

  test('an invitation is cancelled by deleting the invited member, and only them', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const zaza = await deviceOf(playwright, email('Zaza'));

    expect((await zaza.delete(`/api/members/${memberId('Titi')}`)).status()).toBe(403);
    // A member who has been active is never deleted.
    for (const nickname of ['Zaza', 'Popo', 'Lolo']) {
      const response = await momo.delete(`/api/members/${memberId(nickname)}`);
      expect(response.status(), nickname).toBe(409);
      expect(await response.json()).toEqual({ error: 'notInvited' });
    }
    expect((await momo.delete(`/api/members/${memberId('Titi')}`)).status()).toBe(200);

    expect(sql("SELECT COUNT(*) FROM member WHERE nickname = 'Titi'")).toBe('0');
    expect(sql('SELECT COUNT(*) FROM member')).toBe('5');
    await momo.dispose();
    await zaza.dispose();
  });

  test('who manages members cannot cancel the invitation of a member an admin gave roles to', async ({
    playwright,
  }) => {
    const titi = memberId('Titi');
    sql(`INSERT INTO memberRole (memberId, role) VALUES (${titi}, 'ADMIN')`);
    const momo = await deviceOf(playwright, email('Momo'));

    expect((await momo.delete(`/api/members/${titi}`)).status()).toBe(403);
    expect(sql(`SELECT COUNT(*) FROM member WHERE id = ${titi}`)).toBe('1');
    await momo.dispose();
  });
});

test.describe('editing a record', () => {
  test('a member edits their own record, contact details included', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const response = await zaza.put(`/api/members/${memberId('Zaza')}`, {
      data: record({
        nickname: 'Zaza',
        email: 'zaza.nouveau@example.org',
        mobilePhone: '+33 6 12 34 56 78',
        streetAddress: ' 12 bis rue des Tanneurs \r\n Bâtiment C ',
        postalCode: '69007',
        city: 'Lyon',
        countryCode: 'fr',
        addressInstructions: 'Code 4812B, 3e étage gauche',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      firstName: 'Marie-Lou',
      email: 'zaza.nouveau@example.org',
      // Stored in international format, the spaces typed for the eye removed.
      mobilePhone: '+33612345678',
      // An address keeps its lines, each one tidied.
      streetAddress: '12 bis rue des Tanneurs\nBâtiment C',
      countryCode: 'FR',
      status: 'ACTIVE',
    });
    expect(sql(`SELECT updatedByMemberId FROM member WHERE nickname = 'Zaza'`)).toBe(
      String(memberId('Zaza')),
    );

    // A contact field left out is erased.
    await zaza.put(`/api/members/${memberId('Zaza')}`, { data: record({ nickname: 'Zaza' }) });
    expect(
      sql("SELECT mobilePhone IS NULL, city IS NULL FROM member WHERE nickname = 'Zaza'"),
    ).toBe('1\t1');
    await zaza.dispose();
  });

  test('a member cannot edit the record of someone else; who manages members can', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const momo = await deviceOf(playwright, email('Momo'));
    const popo = memberId('Popo');

    const refused = await zaza.put(`/api/members/${popo}`, { data: record() });
    expect(refused.status()).toBe(403);
    expect(sql(`SELECT nickname FROM member WHERE id = ${popo}`)).toBe('Popo');

    const accepted = await momo.put(`/api/members/${popo}`, { data: record() });
    expect(accepted.status()).toBe(200);
    expect(sql(`SELECT nickname, status FROM member WHERE id = ${popo}`)).toBe(
      'Marilou la Tornade\tPOWER_MEMBER',
    );
    // An invited member too.
    const invited = await momo.put(`/api/members/${memberId('Titi')}`, {
      data: record({ nickname: 'Titi', email: 'titi.autre@example.org' }),
    });
    expect(invited.status()).toBe(200);
    await zaza.dispose();
    await momo.dispose();
  });

  test('who manages members cannot change the email or the status of a member holding a role they lack', async ({
    playwright,
  }) => {
    const lulu = addMember({ nickname: 'Lulu', roles: ['SONG_MANAGER'] });
    const momo = await deviceOf(playwright, email('Momo'));

    const response = await momo.put(`/api/members/${memberId('Lulu')}`, {
      data: record({ nickname: 'Lulu', email: 'lulu.autre@example.org' }),
    });
    expect(response.status()).toBe(403);
    expect(sql("SELECT email FROM member WHERE nickname = 'Lulu'")).toBe(lulu);
    const left = await momo.put(`/api/members/${memberId('Lulu')}/status`, {
      data: { status: 'LEFT' },
    });
    expect(left.status()).toBe(403);
    await momo.dispose();
  });

  test('nothing about members is changed by someone who is not signed in', async ({ request }) => {
    const zaza = memberId('Zaza');
    const writes = [
      request.post('/api/members', { data: record() }),
      request.put(`/api/members/${zaza}`, { data: record() }),
      request.delete(`/api/members/${memberId('Titi')}`),
      request.put(`/api/members/${zaza}/status`, { data: { status: 'LEFT' } }),
      request.put(`/api/members/${zaza}/roles`, { data: { roles: ['ADMIN'] } }),
      request.put(`/api/members/${zaza}/photo`, { data: { image: '' } }),
      request.delete(`/api/members/${zaza}/photo`),
      request.delete(`/api/members/${zaza}/passwordLink`),
      request.put('/api/me/preferences', { data: {} }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(response.status(), response.url()).toBe(401);
    }
    expect(sql('SELECT COUNT(*) FROM member')).toBe('6');
  });

  test('the record of a member who left is not written again', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const response = await momo.put(`/api/members/${memberId('Lolo')}`, {
      data: record({ nickname: 'Lolo', email: email('Lolo'), mobilePhone: '+33612345678' }),
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'memberLeft' });
    await momo.dispose();
  });

  test('who manages members cannot change the email of an admin: it would give them the account', async ({
    playwright,
    request,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const jibe = memberId('Jibé');
    const hashBefore = sql(`SELECT emailHash FROM member WHERE id = ${jibe}`);
    const same = {
      nickname: admin.nickname,
      firstName: admin.firstName,
      lastName: admin.lastName,
      instrumentId: Number(sql(`SELECT instrumentId FROM member WHERE id = ${jibe}`)),
    };

    const taken = await momo.put(`/api/members/${jibe}`, {
      data: { ...same, email: 'momo.bis@example.org' },
    });
    expect(taken.status()).toBe(403);
    // Encrypted: unchanged is told by its hash.
    expect(sql(`SELECT emailHash FROM member WHERE id = ${jibe}`)).toBe(hashBefore);

    // The rest of the record, yes.
    const other = await momo.put(`/api/members/${jibe}`, {
      data: { ...same, email: admin.email, city: 'Lyon' },
    });
    expect(other.status()).toBe(200);

    // And the admin changes their own email.
    await request.post('/api/session', { data: { email: admin.email, password: admin.password } });
    const own = await request.put(`/api/members/${jibe}`, {
      data: { ...same, email: 'jibe.nouveau@example.org' },
    });
    expect(own.status()).toBe(200);
    await momo.dispose();
  });
});

test.describe('the life cycle', () => {
  const setStatus = (
    device: Awaited<ReturnType<typeof deviceOf>>,
    nickname: string,
    status: string,
  ) => device.put(`/api/members/${memberId(nickname)}/status`, { data: { status } });

  test('an active member becomes a power member and back: nothing is erased', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const zaza = await deviceOf(playwright, email('Zaza'));
    sql(`UPDATE member SET mobilePhone = '+33612345678' WHERE nickname = 'Zaza'`);

    const power = await setStatus(momo, 'Zaza', 'POWER_MEMBER');
    expect(power.status()).toBe(200);
    expect(await power.json()).toMatchObject({
      status: 'POWER_MEMBER',
      mobilePhone: '+33612345678',
    });
    // Still signed in, on the same session.
    expect((await zaza.get('/api/me')).status()).toBe(200);

    const active = await setStatus(momo, 'Zaza', 'ACTIVE');
    expect((await active.json()).status).toBe('ACTIVE');
    await momo.dispose();
    await zaza.dispose();
  });

  test('a member who leaves is signed out everywhere, and what served only in the band is erased', async ({
    playwright,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const zaza = memberId('Zaza');
    sql(`UPDATE member SET mobilePhone = '+33612345678', streetAddress = '1 rue A', postalCode = '69007',
         city = 'Lyon', countryCode = 'FR', addressInstructions = 'Code 1' WHERE id = ${zaza}`);
    sql(`INSERT INTO memberRole (memberId, role) VALUES (${zaza}, 'SONG_MANAGER')`);
    await jibe.post(`/api/members/${zaza}/passwordLink`);
    const device = await deviceOf(playwright, email('Zaza'));

    const response = await setStatus(jibe, 'Zaza', 'LEFT');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'LEFT',
      // Kept: who they were.
      nickname: 'Zaza',
      email: email('Zaza'),
      mobilePhone: null,
      streetAddress: null,
      postalCode: null,
      city: null,
      countryCode: null,
      addressInstructions: null,
      roles: [],
      hasPendingPasswordLink: false,
    });
    expect(
      sql(`SELECT instrumentId IS NOT NULL, passwordHash IS NULL FROM member WHERE id = ${zaza}`),
    ).toBe('1\t1');
    expect(sql(`SELECT COUNT(*) FROM memberSession WHERE memberId = ${zaza}`)).toBe('0');
    expect((await device.get('/api/me')).status()).toBe(401);
    // And cannot sign in again.
    const signIn = await device.post('/api/session', {
      data: { email: email('Zaza'), password: 'grosse-caisse-claire-7' },
    });
    expect(signIn.status()).toBe(401);
    await jibe.dispose();
    await device.dispose();
  });

  test('a member who left is brought back as invited, with a new password link', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const response = await setStatus(momo, 'Lolo', 'INVITED');

    expect(response.status()).toBe(200);
    const back = await response.json();
    expect(back.status).toBe('INVITED');
    expect(back.passwordLinkToken).toMatch(/^[0-9a-f]{64}$/);
    expect(back.hasPendingPasswordLink).toBe(true);
    await momo.dispose();
  });

  test('a status changes only along the life cycle', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const impossible = [
      // Invited becomes active by choosing a password, never by hand.
      ['Titi', 'ACTIVE'],
      ['Titi', 'LEFT'],
      ['Zaza', 'INVITED'],
      ['Zaza', 'ACTIVE'],
      ['Lolo', 'ACTIVE'],
      ['Lolo', 'POWER_MEMBER'],
      ['Zaza', 'RETIRED'],
    ] as const;

    for (const [nickname, status] of impossible) {
      const response = await setStatus(momo, nickname, status);
      expect(response.status(), `${nickname} to ${status}`).toBe(409);
      expect(await response.json()).toEqual({ error: 'invalidTransition' });
    }
    expect(
      sql("SELECT status FROM member WHERE nickname IN ('Titi', 'Zaza', 'Lolo') ORDER BY nickname"),
    ).toBe('LEFT\nINVITED\nACTIVE');
    await momo.dispose();
  });

  test('a member who does not manage members changes no status', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));

    expect((await setStatus(zaza, 'Popo', 'ACTIVE')).status()).toBe(403);
    expect((await setStatus(zaza, 'Zaza', 'POWER_MEMBER')).status()).toBe(403);
    expect(sql("SELECT status FROM member WHERE nickname = 'Popo'")).toBe('POWER_MEMBER');
    await zaza.dispose();
  });

  test('who manages members cannot change the status of an admin', async ({ playwright }) => {
    addMember({ nickname: 'Dédé', roles: ['ADMIN'] });
    const momo = await deviceOf(playwright, email('Momo'));

    const response = await setStatus(momo, 'Dédé', 'LEFT');
    expect(response.status()).toBe(403);
    expect(sql("SELECT status FROM member WHERE nickname = 'Dédé'")).toBe('ACTIVE');
    await momo.dispose();
  });

  test('the last admin cannot leave; with another admin, they can', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const alone = await setStatus(jibe, 'Jibé', 'LEFT');
    expect(alone.status()).toBe(409);
    expect(await alone.json()).toEqual({ error: 'lastAdmin' });

    // An invited admin is not a current member: it does not count.
    sql(`INSERT INTO memberRole (memberId, role) VALUES (${memberId('Titi')}, 'ADMIN')`);
    expect((await setStatus(jibe, 'Jibé', 'LEFT')).status()).toBe(409);

    sql(`INSERT INTO memberRole (memberId, role) VALUES (${memberId('Popo')}, 'ADMIN')`);
    const popo = await deviceOf(playwright, email('Popo'));
    expect((await setStatus(popo, 'Jibé', 'LEFT')).status()).toBe(200);
    // And now Popo is the last one.
    expect((await setStatus(popo, 'Popo', 'LEFT')).status()).toBe(409);
    // With another admin, a power member leaves like an active one.
    sql(`INSERT INTO memberRole (memberId, role) VALUES (${memberId('Zaza')}, 'ADMIN')`);
    expect((await (await setStatus(popo, 'Popo', 'LEFT')).json()).status).toBe('LEFT');
    await jibe.dispose();
    await popo.dispose();
  });
});

test.describe('roles', () => {
  const setRoles = (
    device: Awaited<ReturnType<typeof deviceOf>>,
    nickname: string,
    roles: string[],
  ) => device.put(`/api/members/${memberId(nickname)}/roles`, { data: { roles } });

  test('an admin sets the roles of a member, and they apply at once', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    const zaza = await deviceOf(playwright, email('Zaza'));
    expect((await zaza.post('/api/members', { data: record() })).status()).toBe(403);

    const response = await setRoles(jibe, 'Zaza', ['MEMBER_MANAGER', 'GIG_MANAGER', 'GIG_MANAGER']);
    expect(response.status()).toBe(200);
    expect((await response.json()).roles).toEqual(['MEMBER_MANAGER', 'GIG_MANAGER']);
    expect((await zaza.post('/api/members', { data: record() })).status()).toBe(201);

    // Setting roles replaces them all.
    await setRoles(jibe, 'Zaza', []);
    expect(sql(`SELECT COUNT(*) FROM memberRole WHERE memberId = ${memberId('Zaza')}`)).toBe('0');
    expect((await (await zaza.get('/api/me')).json()).permissions).toEqual([]);
    await jibe.dispose();
    await zaza.dispose();
  });

  test('only an admin sets roles', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));

    // Not even their own.
    for (const nickname of ['Zaza', 'Momo']) {
      const response = await setRoles(momo, nickname, ['ADMIN']);
      expect(response.status(), nickname).toBe(403);
    }
    const zaza = await deviceOf(playwright, email('Zaza'));
    expect((await setRoles(zaza, 'Zaza', ['ADMIN'])).status()).toBe(403);
    await zaza.dispose();
    expect(sql("SELECT COUNT(*) FROM memberRole WHERE role = 'ADMIN'")).toBe('1');
    await momo.dispose();
  });

  test('roles that do not exist, or for a member who left, are refused', async ({ playwright }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const unknown = await setRoles(jibe, 'Zaza', ['GIG_MANAGER', 'CONDUCTOR']);
    expect(unknown.status()).toBe(422);
    expect((await unknown.json()).fields).toEqual({ 'roles.1': 'invalid' });

    const left = await setRoles(jibe, 'Lolo', ['GIG_MANAGER']);
    expect(left.status()).toBe(409);
    expect(await left.json()).toEqual({ error: 'memberLeft' });
    expect((await setRoles(jibe, 'Nobody', [])).status()).toBe(404);
    await jibe.dispose();
  });

  test('the last admin cannot lose the role; with another admin, they can', async ({
    playwright,
  }) => {
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const alone = await setRoles(jibe, 'Jibé', ['MEMBER_MANAGER']);
    expect(alone.status()).toBe(409);
    expect(await alone.json()).toEqual({ error: 'lastAdmin' });

    await setRoles(jibe, 'Zaza', ['ADMIN']);
    // Two admins each removing the other at the same instant: one of them stays.
    const zaza = await deviceOf(playwright, email('Zaza'));
    await Promise.all([setRoles(jibe, 'Zaza', []), setRoles(zaza, 'Jibé', [])]);
    expect(sql("SELECT COUNT(*) FROM memberRole WHERE role = 'ADMIN'")).toBe('1');
    await zaza.dispose();
    sql("DELETE FROM memberRole WHERE role = 'ADMIN'");
    sql(
      `INSERT INTO memberRole (memberId, role) VALUES (${memberId('Jibé')}, 'ADMIN'), (${memberId('Zaza')}, 'ADMIN')`,
    );
    expect((await setRoles(jibe, 'Jibé', ['MEMBER_MANAGER'])).status()).toBe(200);
    expect(
      sql(
        "SELECT m.nickname FROM memberRole r JOIN member m ON m.id = r.memberId WHERE r.role = 'ADMIN'",
      ),
    ).toBe('Zaza');
    await jibe.dispose();
  });
});
