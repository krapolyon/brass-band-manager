import { expect, test } from '@playwright/test';
import { emptyDatabase } from '../support/database.ts';
import { addGig } from '../support/gigs.ts';
import { emptyMailbox, mailsAfterAWhile, receivedMails } from '../support/mail.ts';
import { emptyPushes, endpointOf, sentPushes, subscribe } from '../support/push.ts';
import { addMember, admin, install, signIn } from '../support/scenario.ts';

// An instance that only writes to some members (config.php,
// "allowedRecipients"): the one used to try a version out with a copy of the
// real data. The server of port 8083 may only write to zaza@example.org.
// docs/architecture.md, "Deployment".

const allowedOnly = 'http://localhost:8083';
test.use({ baseURL: allowedOnly });

test.beforeEach(async ({ playwright }) => {
  emptyDatabase();
  emptyPushes();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL: allowedOnly });
  await install(setup);
  await setup.dispose();
});

test('an email leaves for a listed address', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza' });

  const response = await request.post('/api/passwordLink/request', { data: { email } });

  expect(await response.json()).toEqual({ sent: true });
  const [mail] = await receivedMails(1);
  expect(mail?.to).toBe(email);
});

test('an email for anyone else is not sent, and the answer does not tell', async ({ request }) => {
  const email = addMember({ nickname: 'Momo' });

  const response = await request.post('/api/passwordLink/request', { data: { email } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ sent: true });
  expect(await mailsAfterAWhile()).toEqual([]);
});

test('a reminder notifies the listed member only', async ({ playwright, request }) => {
  const devices = new Map<string, string>();
  for (const nickname of ['Zaza', 'Momo']) {
    const context = await playwright.request.newContext({ baseURL: allowedOnly });
    await signIn(context, addMember({ nickname }));
    expect((await subscribe(context, nickname.toLowerCase())).status()).toBe(200);
    devices.set(nickname, endpointOf(nickname.toLowerCase()));
  }
  // Neither has answered for this gig: both are due a reminder.
  const { gigId } = addGig('Carnaval de quartier');

  await signIn(request, admin.email, admin.password);
  expect((await request.post(`/api/gigs/${gigId}/reminder`)).status()).toBe(200);

  await expect.poll(() => sentPushes().length).toBe(1);
  expect(sentPushes().map((push) => push.endpoint)).toEqual([devices.get('Zaza')]);
});
