import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addGig, day } from '../support/gigs.ts';
import { emptyMailbox, receivedMails } from '../support/mail.ts';
import { emptyPushes } from '../support/push.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';
import { songRecord } from '../support/songFiles.ts';

// The emails of the app in HTML, with their plain text beside them (0.4.0,
// issue #65; Figma, page Emails). Drawn in the Dark scheme and the default
// theme of the band, never the theme of a member. The gigs, songs and people
// here are made up.

test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  emptyPushes();
  await emptyMailbox();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Sonia', roles: ['SONG_MANAGER'] });
  // Zaza alone takes the email: the others keep the push, and have no device.
  sql(
    `UPDATE member SET notifyGigReminder = 'EMAIL', notifySongNew = 'EMAIL' WHERE id = ${memberId('Zaza')}`,
  );
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const theme = JSON.parse(readFileSync('api/resources/emailTheme.json', 'utf8')).themes;

test('a reminder shows each gig as its card, with the answer and what the gig lacks', async ({
  playwright,
}) => {
  const { gigId } = addGig('Carnaval <de> quartier', {
    status: 'ACCEPTED',
    startsOn: day(20),
    meetingTime: '17:30',
  });
  sql(`UPDATE gig SET placeName = 'Salle des fêtes' WHERE id = ${gigId}`);
  const jibe = await deviceOf(playwright, admin.email, admin.password);
  await jibe.post(`/api/gigs/${gigId}/reminder`);

  // Sonia and Jibé get it too, by email for want of a device.
  const mail = (await receivedMails(3)).find((one) => one.to === email('Zaza'));
  expect(mail?.subject).toBe('La Fanfare des Cuivres Déchaînés – Présence manquante');
  // HTML, and the same words in plain text.
  expect(mail?.html).toMatch(/^<!doctype html>/);
  // The texts write their no-break spaces; compared here with plain ones.
  const flat = (text = '') => text.replace(/[\u00a0\u202f]/g, ' ');
  for (const words of [
    'Il te reste 1 plan à répondre',
    'Salle des fêtes',
    'RDV 17 h 30',
    'Accepté',
    'À répondre',
    'Manque',
  ]) {
    expect(flat(mail?.text), words).toContain(words);
    expect(flat(mail?.html), words).toContain(words);
  }
  // What a member typed is written as text, never as HTML.
  expect(mail?.html).toContain('Carnaval &lt;de&gt; quartier');
  expect(mail?.html).not.toContain('<de>');
  // One button, and its link written under it.
  expect(
    mail?.html.match(new RegExp(`href="http://localhost:8081/gigs/${gigId}"`, 'g')),
  ).toHaveLength(2);
  expect(mail?.html).toContain('href="http://localhost:8081/settings/notifications"');
});

test('the colours are those of the theme of the band, never of the member', async ({
  playwright,
}) => {
  sql(`UPDATE member SET accentTheme = 'raspberry' WHERE id = ${memberId('Zaza')}`);
  sql(`UPDATE band SET defaultAccentTheme = 'azure'`);
  const sonia = await deviceOf(playwright, email('Sonia'));
  await sonia.post('/api/songs', {
    data: songRecord({ name: 'Rasputin', originalArtist: 'Boney M.' }),
  });

  const mail = (await receivedMails(1))[0];
  expect(mail?.to).toBe(email('Zaza'));
  expect(mail?.html).toContain(theme.azure.accent);
  expect(mail?.html).toContain(theme.azure.ground);
  expect(mail?.html).not.toContain(theme.raspberry.accent);
  expect(mail?.text).toContain('Rasputin – Boney M.');
});

test('no image but the icon of the band; the typefaces from the app', async ({ playwright }) => {
  const sonia = await deviceOf(playwright, email('Sonia'));
  await sonia.post('/api/songs', { data: songRecord({ name: 'Rasputin' }) });

  const html = (await receivedMails(1))[0]?.html ?? '';
  // Without an icon or a logo, the band has no image at all.
  expect(html).not.toContain('<img');
  for (const address of html.matchAll(/(?:src|url)\(?=?["']([^"')]+)/g)) {
    expect(address[1]).toMatch(/^http:\/\/localhost:8081\//);
  }
  expect(html).toContain("url('http://localhost:8081/fonts/BricolageGrotesque-latin.woff2')");
});

test('the forgotten password, in HTML too', async ({ request }) => {
  await request.post('/api/passwordLink/request', { data: { email: email('Zaza') } });

  const mail = (await receivedMails(1))[0];
  expect(mail?.subject).toBe('Ton nouveau mot de passe pour La Fanfare des Cuivres Déchaînés');
  expect(mail?.html).toContain('Choisis un nouveau mot de passe');
  expect(mail?.html).toMatch(/href="http:\/\/localhost:8081\/password#[0-9a-f]{64}"/);
  expect(mail?.text).toMatch(/http:\/\/localhost:8081\/password#[0-9a-f]{64}/);
});
