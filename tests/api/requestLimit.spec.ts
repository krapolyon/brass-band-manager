import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { emptyMailbox, receivedMails } from '../support/mail.ts';
import { addMember, admin, install, memberPassword, signIn } from '../support/scenario.ts';

// Limits per visitor on the public addresses (issue #51). Rules:
// model/members.md, entry 3, "Limits per visitor". Every request of a test
// comes from the same network address, as a band at a rehearsal would.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  sql('DELETE FROM memberSession');
});

const REFUSALS = 30;

/** The window of every count ends now: as if its quarter of an hour had passed. */
function endWindows() {
  sql('UPDATE requestLimit SET windowEndsAt = UTC_TIMESTAMP() - INTERVAL 1 SECOND');
}

test.describe('refusals', () => {
  test('after 30 refusals, sign-in answers 429 with the time to wait, right password included', async ({
    request,
  }) => {
    // Many emails, so that no member reaches the lock of their own account.
    for (let i = 0; i < REFUSALS; i++) {
      const wrong = await signIn(request, `nobody${i}@example.org`, 'pas-le-bon-mot');
      expect(wrong.status()).toBe(401);
    }

    const blocked = await signIn(request, admin.email, admin.password);
    expect(blocked.status()).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'tooManyRequests' });
    const wait = Number(blocked.headers()['retry-after']);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    // A refused request is not run: no session was made.
    expect(sql('SELECT COUNT(*) FROM memberSession')).toBe('0');
  });

  test('the count starts again when its window ends', async ({ request }) => {
    for (let i = 0; i < REFUSALS; i++) await signIn(request, `nobody${i}@example.org`, 'x');
    expect((await signIn(request, admin.email, admin.password)).status()).toBe(429);

    endWindows();

    expect((await signIn(request, admin.email, admin.password)).status()).toBe(200);
  });

  test('a successful sign-in is not counted: a band signs in from one network', async ({
    playwright,
    baseURL,
  }) => {
    const email = addMember({ nickname: 'Zaza' });
    for (let i = 0; i < REFUSALS + 5; i++) {
      const device = await playwright.request.newContext({ baseURL });
      expect((await signIn(device, email, memberPassword)).status()).toBe(200);
      await device.dispose();
    }
    expect(sql('SELECT COUNT(*) FROM requestLimit')).toBe('0');
  });

  test('the refusals of every guarded address add up', async ({ request }) => {
    for (let i = 0; i < 10; i++) {
      await signIn(request, `nobody${i}@example.org`, 'x');
      await request.post('/api/passwordLink/check', { data: { token: '0'.repeat(64) } });
      await request.post('/api/passwordLink/use', {
        data: { token: '0'.repeat(64), password: 'un-mot-de-passe-long' },
      });
    }

    const check = await request.post('/api/passwordLink/check', {
      data: { token: '0'.repeat(64) },
    });
    expect(check.status()).toBe(429);
    expect((await request.post('/api/install/key', { data: { installKey: 'x' } })).status()).toBe(
      429,
    );
  });

  test('what is stored is a hash of 32 bytes, never the network address', async ({ request }) => {
    await signIn(request, 'nobody@example.org', 'x');

    expect(sql('SELECT LENGTH(keyHash), hits FROM requestLimit')).toBe('32\t1');
    expect(sql("SELECT COUNT(*) FROM requestLimit WHERE keyHash LIKE '%.%'")).toBe('0');
  });

  test('the rows of ended windows are deleted at the next count', async ({ request }) => {
    await signIn(request, 'nobody@example.org', 'x');
    endWindows();

    await signIn(request, 'nobody@example.org', 'x');

    expect(sql('SELECT COUNT(*) FROM requestLimit')).toBe('1');
    expect(sql('SELECT COUNT(*) FROM requestLimit WHERE windowEndsAt <= UTC_TIMESTAMP()')).toBe(
      '0',
    );
  });

  test('a database without the table yet is not limited: sign-in still reaches the migrations', async ({
    request,
  }) => {
    sql('RENAME TABLE requestLimit TO requestLimitAway');
    try {
      expect((await signIn(request, 'nobody@example.org', 'x')).status()).toBe(401);
      expect((await signIn(request, admin.email, admin.password)).status()).toBe(200);
    } finally {
      sql('RENAME TABLE requestLimitAway TO requestLimit');
    }
  });
});

test.describe('forgotten password', () => {
  test.beforeEach(async () => emptyMailbox());

  test('10 requests an hour per visitor, whatever the addresses; then 429 and no email', async ({
    request,
  }) => {
    const email = addMember({ nickname: 'Zaza' });
    for (let i = 0; i < 10; i++) {
      const asked = await request.post('/api/passwordLink/request', {
        data: { email: `nobody${i}@example.org` },
      });
      expect(asked.status()).toBe(200);
    }

    const blocked = await request.post('/api/passwordLink/request', { data: { email } });
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()['retry-after'])).toBeLessThanOrEqual(60 * 60);
    expect(sql('SELECT COUNT(*) FROM memberPasswordLink')).toBe('0');
    expect(await receivedMails(0)).toEqual([]);
  });

  test('its count is apart from the refusals of sign-in', async ({ request }) => {
    for (let i = 0; i < REFUSALS; i++) await signIn(request, `nobody${i}@example.org`, 'x');

    const asked = await request.post('/api/passwordLink/request', {
      data: { email: 'nobody@example.org' },
    });
    expect(asked.status()).toBe(200);
  });
});
