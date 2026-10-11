import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { png, svg } from '../support/images.ts';
import {
  addMember,
  admin,
  deviceOf,
  install,
  memberId,
  memberPassword,
  signIn,
} from '../support/scenario.ts';
import { emptyStorage, storedFiles } from '../support/storage.ts';

// What a member does on their own account: preferences, password, profile
// photo. Rules: model/members.md, "Profile photo", "Rules" and "Personal data".

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyStorage();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Momo', roles: ['MEMBER_MANAGER'] });
  addMember({ nickname: 'Titi', status: 'INVITED' });
  addMember({ nickname: 'Lolo', status: 'LEFT' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const photo = (image: Buffer = png(512)) => ({ image: image.toString('base64') });

test.describe('preferences', () => {
  const preferences = (changes: object = {}) => ({
    language: 'fr',
    colorScheme: 'DARK',
    accentTheme: 'mint',
    textSizePercent: 140,
    hasHighContrast: true,
    hasIncreasedSpacing: false,
    hasLegibleFont: true,
    hasReducedMotion: false,
    hasExtendedTimeouts: true,
    ...changes,
  });

  test('a member sets their preferences, and finds them again on any device', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const response = await zaza.put('/api/me/preferences', { data: preferences() });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject(preferences());

    const other = await deviceOf(playwright, email('Zaza'));
    expect(await (await other.get('/api/me')).json()).toMatchObject(preferences());
    // No theme chosen: the default one of the band.
    await other.put('/api/me/preferences', { data: preferences({ accentTheme: null }) });
    expect(sql("SELECT accentTheme IS NULL FROM member WHERE nickname = 'Zaza'")).toBe('1');
    await zaza.dispose();
    await other.dispose();
  });

  test('a preference that does not exist is refused', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const refused = async (changes: object, fields: object) => {
      const response = await zaza.put('/api/me/preferences', { data: preferences(changes) });
      expect(response.status(), JSON.stringify(changes)).toBe(422);
      expect((await response.json()).fields).toEqual(fields);
    };

    await refused({ language: 'xx' }, { language: 'invalid' });
    await refused({ colorScheme: 'SEPIA' }, { colorScheme: 'invalid' });
    await refused({ accentTheme: 'gold' }, { accentTheme: 'invalid' });
    await refused({ textSizePercent: 99 }, { textSizePercent: 'invalid' });
    await refused({ textSizePercent: 201 }, { textSizePercent: 'invalid' });
    // Six steps only, 100 to 200 by 20.
    await refused({ textSizePercent: 150 }, { textSizePercent: 'invalid' });
    await refused({ hasHighContrast: 'yes' }, { hasHighContrast: 'invalid' });
    await refused({ status: 'LEFT' }, { status: 'invalid' });
    expect(sql("SELECT colorScheme, textSizePercent FROM member WHERE nickname = 'Zaza'")).toBe(
      'AUTO\t100',
    );
    await zaza.dispose();
  });

  test('the preferences of a member are shown to nobody else, an admin included', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    await zaza.put('/api/me/preferences', { data: preferences() });
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    const seen = await (await jibe.get(`/api/members/${memberId('Zaza')}`)).json();
    for (const field of Object.keys(preferences())) {
      expect(Object.keys(seen), field).not.toContain(field);
    }
    await zaza.dispose();
    await jibe.dispose();
  });
});

test.describe('changing a password', () => {
  const newPassword = 'helicon-en-fa-diese-9';

  test('a member changes their password; their other devices are signed out', async ({
    playwright,
  }) => {
    const here = await deviceOf(playwright, email('Zaza'));
    const elsewhere = await deviceOf(playwright, email('Zaza'));

    const response = await here.put('/api/me/password', {
      data: { currentPassword: memberPassword, newPassword },
    });
    expect(response.status()).toBe(200);

    expect((await here.get('/api/me')).status()).toBe(200);
    expect((await elsewhere.get('/api/me')).status()).toBe(401);
    expect((await signIn(elsewhere, email('Zaza'), memberPassword)).status()).toBe(401);
    expect((await signIn(elsewhere, email('Zaza'), newPassword)).status()).toBe(200);
    await here.dispose();
    await elsewhere.dispose();
  });

  test('the current password is asked, and the new one follows the rule', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const elsewhere = await deviceOf(playwright, email('Zaza'));

    const wrong = await zaza.put('/api/me/password', {
      data: { currentPassword: 'not-my-password', newPassword },
    });
    expect(wrong.status()).toBe(422);
    expect((await wrong.json()).fields).toEqual({ currentPassword: 'invalid' });

    const short = await zaza.put('/api/me/password', {
      data: { currentPassword: memberPassword, newPassword: 'tubatuba' },
    });
    expect((await short.json()).fields).toEqual({ newPassword: 'tooShort' });

    // Nothing changed, nobody signed out.
    expect((await elsewhere.get('/api/me')).status()).toBe(200);
    expect((await signIn(elsewhere, email('Zaza'), memberPassword)).status()).toBe(200);
    await zaza.dispose();
    await elsewhere.dispose();
  });

  test('wrong current passwords count like wrong passwords at sign-in, and end the session', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const guess = () =>
      zaza.put('/api/me/password', { data: { currentPassword: 'a-wrong-guess-1', newPassword } });

    for (let attempt = 1; attempt <= 4; attempt++) {
      expect((await guess()).status()).toBe(422);
    }
    expect(sql("SELECT failedSignInCount FROM member WHERE nickname = 'Zaza'")).toBe('4');
    expect((await zaza.get('/api/me')).status()).toBe(200);

    // The fifth one locks sign-in and signs this device out.
    expect((await guess()).status()).toBe(422);
    expect(sql("SELECT signInLockedUntil > NOW() FROM member WHERE nickname = 'Zaza'")).toBe('1');
    expect((await zaza.get('/api/me')).status()).toBe(401);
    expect((await signIn(zaza, email('Zaza'), memberPassword)).status()).toBe(401);
    await zaza.dispose();
  });

  test('while sign-in is locked, the right current password is refused too', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    sql("UPDATE member SET signInLockedUntil = NOW() + INTERVAL 10 MINUTE WHERE nickname = 'Zaza'");

    const response = await zaza.put('/api/me/password', {
      data: { currentPassword: memberPassword, newPassword },
    });
    expect(response.status()).toBe(422);
    expect(sql("SELECT failedSignInCount FROM member WHERE nickname = 'Zaza'")).toBe('0');
    await zaza.dispose();
  });

  test('changing a password cancels a pending password link', async ({ playwright, request }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const { passwordLinkToken } = await (
      await momo.post(`/api/members/${memberId('Zaza')}/passwordLink`)
    ).json();
    const zaza = await deviceOf(playwright, email('Zaza'));
    await zaza.put('/api/me/password', { data: { currentPassword: memberPassword, newPassword } });

    const check = await request.post('/api/passwordLink/check', {
      data: { token: passwordLinkToken },
    });
    expect(check.status()).toBe(404);
    await momo.dispose();
    await zaza.dispose();
  });

  test('changing a password asks to be signed in', async ({ request }) => {
    const response = await request.put('/api/me/password', {
      data: { currentPassword: memberPassword, newPassword },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('profile photo', () => {
  test('a member gives themself a photo; the other members see it, nobody else', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const id = memberId('Zaza');

    const response = await zaza.put(`/api/members/${id}/photo`, { data: photo() });
    expect(response.status()).toBe(200);
    const { photoUrl } = await response.json();
    expect(photoUrl).toMatch(new RegExp(`^/api/members/${id}/photo\\?v=[0-9a-f]{16}$`));
    // Stored under a name chosen by the app.
    expect(sql(`SELECT photoPath FROM member WHERE id = ${id}`)).toMatch(
      /^members\/[0-9a-f]{16}\/photo\.png$/,
    );
    expect((await (await zaza.get('/api/me')).json()).photoUrl).toBe(photoUrl);

    const momo = await deviceOf(playwright, email('Momo'));
    const seen = await momo.get(photoUrl);
    expect(seen.status()).toBe(200);
    expect(await seen.body()).toEqual(png(512));
    expect(seen.headers()['content-type']).toBe('image/png');
    expect(seen.headers()['x-content-type-options']).toBe('nosniff');
    // Kept by the browser of the member only, and asked again each time: a
    // photo is not shown from a cache after a sign-out or a departure.
    expect(seen.headers()['cache-control']).toBe('private, no-cache');
    const unchanged = await momo.get(photoUrl, {
      headers: { 'If-None-Match': seen.headers().etag ?? '' },
    });
    expect(unchanged.status()).toBe(304);
    expect(await unchanged.body()).toHaveLength(0);

    // Never public, unlike the logo of the band.
    expect((await request.get(photoUrl)).status()).toBe(401);
    await zaza.dispose();
    await momo.dispose();
  });

  test('a member changes only their own photo; who manages members changes any', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const momo = await deviceOf(playwright, email('Momo'));

    expect(
      (await zaza.put(`/api/members/${memberId('Momo')}/photo`, { data: photo() })).status(),
    ).toBe(403);
    expect((await zaza.delete(`/api/members/${memberId('Momo')}/photo`)).status()).toBe(403);
    expect(storedFiles('members')).toEqual([]);

    expect(
      (await momo.put(`/api/members/${memberId('Zaza')}/photo`, { data: photo() })).status(),
    ).toBe(200);
    // An invited member too, before they have joined.
    expect(
      (
        await momo.put(`/api/members/${memberId('Titi')}/photo`, { data: photo(png(256)) })
      ).status(),
    ).toBe(200);
    expect(storedFiles('members')).toHaveLength(2);
    await zaza.dispose();
    await momo.dispose();
  });

  test('the photo of a member the viewer may not see is not served', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const titi = memberId('Titi');
    const { photoUrl } = await (
      await momo.put(`/api/members/${titi}/photo`, { data: photo() })
    ).json();
    expect((await momo.get(photoUrl)).status()).toBe(200);

    const zaza = await deviceOf(playwright, email('Zaza'));
    expect((await zaza.get(photoUrl)).status()).toBe(404);
    // A member without a photo: 404 as well.
    expect((await zaza.get(`/api/members/${memberId('Momo')}/photo`)).status()).toBe(404);
    await momo.dispose();
    await zaza.dispose();
  });

  test('replacing a photo deletes the old file, and removing it leaves none', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const address = `/api/members/${memberId('Zaza')}/photo`;

    const first = (await (await zaza.put(address, { data: photo() })).json()).photoUrl;
    const second = (await (await zaza.put(address, { data: photo(png(128)) })).json()).photoUrl;
    expect(second).not.toBe(first);
    expect(storedFiles('members')).toHaveLength(1);

    const removed = await zaza.delete(address);
    expect((await removed.json()).photoUrl).toBeNull();
    expect(storedFiles('members')).toEqual([]);
    expect((await zaza.get(second)).status()).toBe(404);
    await zaza.dispose();
  });

  test('photos sent at the same instant leave one file only', async ({ playwright }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const address = `/api/members/${memberId('Zaza')}/photo`;

    await Promise.all(Array.from({ length: 6 }, () => zaza.put(address, { data: photo() })));
    expect(storedFiles('members')).toHaveLength(1);
    await zaza.dispose();
  });

  test('what is not a square photo of the expected size is refused, and nothing is kept', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const address = `/api/members/${memberId('Zaza')}/photo`;
    const refused = async (data: object, problem: string) => {
      const response = await zaza.put(address, { data });
      expect(response.status()).toBe(422);
      expect((await response.json()).fields).toEqual({ photo: problem });
    };
    // 1024 by 512: the height of a PNG is written at byte 20.
    const wide = Buffer.from(png(512));
    wide.writeUInt32BE(1024, 16);

    // Larger than what the browser is asked to send.
    await refused(photo(png(1024)), 'invalid');
    await refused(photo(wide), 'invalid');
    // A photo is never a drawing: no SVG.
    await refused(photo(svg), 'invalid');
    await refused(photo(Buffer.from('%PDF-1.7')), 'invalid');
    // The first bytes of a JPEG (its size is written there), followed by something else.
    const fakeJpeg = Buffer.from('ffd8ffc0001108004000400301220002110103110100', 'hex');
    await refused(
      photo(Buffer.concat([fakeJpeg, Buffer.from('<html><script>1</script>')])),
      'invalid',
    );
    // Too small to be a photo.
    await refused(photo(png(8)), 'invalid');
    await refused(
      photo(Buffer.concat([png(64).subarray(0, 33), Buffer.from('<script>')])),
      'invalid',
    );
    await refused({ image: 'not base64 !' }, 'invalid');
    await refused(photo(Buffer.concat([png(64), Buffer.alloc(1_000_000)])), 'tooBig');
    expect((await zaza.put(address, { data: { ...photo(), name: '../x.php' } })).status()).toBe(
      422,
    );

    expect(sql("SELECT photoPath IS NULL FROM member WHERE nickname = 'Zaza'")).toBe('1');
    expect(storedFiles('members')).toEqual([]);
    await zaza.dispose();
  });

  test('the photo of a member who leaves is erased, and they get no new one', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const zaza = memberId('Zaza');
    await momo.put(`/api/members/${zaza}/photo`, { data: photo() });
    expect(storedFiles('members')).toHaveLength(1);

    const left = await momo.put(`/api/members/${zaza}/status`, { data: { status: 'LEFT' } });
    expect((await left.json()).photoUrl).toBeNull();
    expect(storedFiles('members')).toEqual([]);

    const again = await momo.put(`/api/members/${zaza}/photo`, { data: photo() });
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: 'memberLeft' });
    await momo.dispose();
  });

  test('cancelling an invitation deletes the photo given to the invited member', async ({
    playwright,
  }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const titi = memberId('Titi');
    await momo.put(`/api/members/${titi}/photo`, { data: photo() });

    await momo.delete(`/api/members/${titi}`);
    expect(storedFiles('members')).toEqual([]);
    await momo.dispose();
  });
});

test.describe('requests that cross each other', () => {
  test('a photo sent while its invitation is cancelled leaves no file', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const other = await deviceOf(playwright, email('Momo'));

    for (let round = 0; round < 6; round++) {
      const nickname = `Invite${round}`;
      addMember({ nickname, status: 'INVITED' });
      const id = memberId(nickname);
      await Promise.all([
        momo.put(`/api/members/${id}/photo`, { data: photo(png(64)) }),
        other.delete(`/api/members/${id}`),
      ]);
    }

    expect(sql("SELECT COUNT(*) FROM member WHERE nickname LIKE 'Invite%'")).toBe('0');
    expect(storedFiles('members')).toEqual([]);
    await momo.dispose();
    await other.dispose();
  });

  test('a record and a photo sent while the member leaves are not kept', async ({ playwright }) => {
    const momo = await deviceOf(playwright, email('Momo'));
    const other = await deviceOf(playwright, email('Momo'));
    const instrumentId = Number(sql('SELECT MIN(id) FROM instrument'));

    for (let round = 0; round < 6; round++) {
      const nickname = `Partant${round}`;
      addMember({ nickname });
      const id = memberId(nickname);
      await Promise.all([
        momo.put(`/api/members/${id}`, {
          data: {
            nickname,
            firstName: 'Prénom',
            lastName: 'Nom',
            email: `${nickname.toLowerCase()}@example.org`,
            instrumentId,
            mobilePhone: '+33612345678',
            city: 'Lyon',
          },
        }),
        momo.put(`/api/members/${id}/photo`, { data: photo(png(64)) }),
        other.put(`/api/members/${id}/status`, { data: { status: 'LEFT' } }),
      ]);
    }

    // Whatever the order they were handled in: who left has nothing left.
    expect(
      sql(`SELECT COUNT(*) FROM member WHERE nickname LIKE 'Partant%' AND status = 'LEFT'
           AND mobilePhone IS NULL AND city IS NULL AND photoPath IS NULL`),
    ).toBe('6');
    expect(storedFiles('members')).toEqual([]);
    await momo.dispose();
    await other.dispose();
  });
});
