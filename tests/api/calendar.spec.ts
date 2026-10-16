import { expect, test } from '@playwright/test';
import { emptyDatabase, sql } from '../support/database.ts';
import { addGig, answerOf, day } from '../support/gigs.ts';
import { addMember, admin, deviceOf, install, memberId } from '../support/scenario.ts';

// The calendar address of a member and the feed it gives. Rules:
// model/members.md ("Calendar address"), model/gigs.md (entry 5, "Calendar
// feed"). The gigs are examples; nobody here is real.

// The band: Jibé the admin, Zaza and Riton members.
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);
  await setup.dispose();
  addMember({ nickname: 'Zaza' });
  addMember({ nickname: 'Riton' });
});

const email = (nickname: string) => `${nickname.toLowerCase()}@example.org`;
const band = 'La Fanfare des Cuivres Déchaînés';

/** The events of a feed, unfolded, one object of fields each. */
function eventsOf(feed: string): Record<string, string>[] {
  const lines = feed.replace(/\r\n /g, '').split('\r\n');
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) {
      const at = line.indexOf(':');
      current[line.slice(0, at)] = line.slice(at + 1);
    }
  }
  return events;
}

test.describe('the address', () => {
  test('none at first; created when asked, kept when asked again, replaced on reset', async ({
    playwright,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    expect(await (await zaza.get('/api/me/calendar')).json()).toEqual({ token: null });

    const created = (await (await zaza.post('/api/me/calendar')).json()).token;
    expect(created).toMatch(/^[0-9a-f]{32}$/);
    expect((await (await zaza.post('/api/me/calendar')).json()).token).toBe(created);
    expect((await (await zaza.get('/api/me/calendar')).json()).token).toBe(created);

    const reset = (await (await zaza.put('/api/me/calendar')).json()).token;
    expect(reset).toMatch(/^[0-9a-f]{32}$/);
    expect(reset).not.toBe(created);
    // The old address answers nothing from now on.
    const old = await zaza.get(`/api/calendar/${created}.ics`);
    expect(old.status()).toBe(404);
    expect((await zaza.get(`/api/calendar/${reset}.ics`)).status()).toBe(200);
  });

  test('seen by the member only: not in /api/me, not in the directory, not for an admin', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const token = (await (await zaza.post('/api/me/calendar')).json()).token;
    const jibe = await deviceOf(playwright, admin.email, admin.password);

    expect(JSON.stringify(await (await zaza.get('/api/me')).json())).not.toContain(token);
    expect(JSON.stringify(await (await jibe.get('/api/members')).json())).not.toContain(token);
    expect(
      JSON.stringify(await (await jibe.get(`/api/members/${memberId('Zaza')}`)).json()),
    ).not.toContain(token);
    // The admin's own address is another one.
    expect((await (await jibe.get('/api/me/calendar')).json()).token).toBeNull();
    // Not signed in: nothing.
    expect((await request.get('/api/me/calendar')).status()).toBe(401);
    expect((await request.post('/api/me/calendar')).status()).toBe(401);
    expect((await request.put('/api/me/calendar')).status()).toBe(401);
  });

  test('a member who leaves loses it: the address answers like one that never existed', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const token = (await (await zaza.post('/api/me/calendar')).json()).token;
    const jibe = await deviceOf(playwright, admin.email, admin.password);
    await jibe.put(`/api/members/${memberId('Zaza')}/status`, { data: { status: 'LEFT' } });

    expect(sql(`SELECT calendarToken FROM member WHERE id = ${memberId('Zaza')}`)).toBe('NULL');
    const gone = await request.get(`/api/calendar/${token}.ics`);
    const never = await request.get(`/api/calendar/${'0'.repeat(32)}.ics`);
    const wrong = await request.get('/api/calendar/not-a-token.ics');
    for (const answer of [gone, never, wrong]) {
      expect(answer.status()).toBe(404);
      expect(await answer.json()).toEqual({ error: 'notFound' });
    }
  });
});

test.describe('the feed', () => {
  test('the gigs the member comes to: firm for a yes, tentative for a maybe or an if needed', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const token = (await (await zaza.post('/api/me/calendar')).json()).token;
    const lumieres = addGig('Fête des Lumières', {
      status: 'CONFIRMED',
      startsOn: '2027-12-03',
      endsOn: '2027-12-05',
      meetingTime: '18:30:00',
      placeName: 'Place des Terreaux',
      city: 'Lyon',
      slots: ['Vendredi soir', 'Samedi', 'Dimanche'],
    });
    const soupe = addGig('Fête de la soupe', { status: 'PROPOSED', startsOn: day(40) });
    const marche = addGig('Marché de Noël', { status: 'ACCEPTED', startsOn: day(60) });
    // A no on the first day, a yes on the second: firm.
    answerOf('Zaza', lumieres.slotIds[0] as number, 'NO');
    answerOf('Zaza', lumieres.slotIds[1] as number, 'YES');
    answerOf('Zaza', soupe.slotId, 'MAYBE');
    answerOf('Zaza', marche.slotId, 'IF_NEEDED');

    const feed = await request.get(`/api/calendar/${token}.ics`);
    expect(feed.status()).toBe(200);
    expect(feed.headers()['content-type']).toBe('text/calendar; charset=utf-8');
    expect(feed.headers()['cache-control']).toBe('private, max-age=0');
    expect(feed.headers()['x-robots-tag']).toBe('noindex');
    const text = await feed.text();
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain(`X-WR-CALNAME:${band}`);

    const events = eventsOf(text);
    expect(events.map((event) => event.SUMMARY)).toEqual([
      `${band} – Proposition : Fête de la soupe`,
      `${band} – Accepté : Marché de Noël`,
      `${band} – Fête des Lumières`,
    ]);
    const [soupeEvent, marcheEvent, lumieresEvent] = events;
    expect(soupeEvent?.STATUS).toBe('TENTATIVE');
    expect(marcheEvent?.STATUS).toBe('TENTATIVE');
    // One event over the three days, from the meeting time to the midnight
    // that ends the last day, written in UTC from the time zone of the band:
    // the test server has none in its configuration, so it is UTC itself.
    expect(lumieresEvent).toMatchObject({
      STATUS: 'CONFIRMED',
      DTSTART: '20271203T183000Z',
      DTEND: '20271206T000000Z',
      LOCATION: 'Place des Terreaux\\, Lyon',
      UID: `gig-${lumieres.gigId}@localhost`,
      URL: `http://localhost:8081/gigs/${lumieres.gigId}`,
    });
    // Without a meeting time: whole days.
    expect(soupeEvent?.['DTSTART;VALUE=DATE']).toBe(day(40).replaceAll('-', ''));
    expect(soupeEvent?.['DTEND;VALUE=DATE']).toBe(day(41).replaceAll('-', ''));
    // Nothing about the other members.
    expect(text).not.toContain('Riton');
  });

  test('a no everywhere, a cancelled gig, a draft and a gig over a year ago are absent', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const token = (await (await zaza.post('/api/me/calendar')).json()).token;
    const no = addGig('Carnaval', { status: 'CONFIRMED', startsOn: day(10) });
    const cancelled = addGig('Vide-grenier', { status: 'CANCELLED', startsOn: day(11) });
    const draft = addGig('Anniversaire', { status: 'DRAFT', startsOn: day(12) });
    const old = addGig('Fête de la musique', { status: 'CONFIRMED', startsOn: day(-400) });
    const recent = addGig('Mariage', { status: 'CONFIRMED', startsOn: day(-300) });
    answerOf('Zaza', no.slotId, 'NO');
    answerOf('Zaza', cancelled.slotId, 'YES');
    answerOf('Zaza', draft.slotId, 'YES');
    answerOf('Zaza', old.slotId, 'YES');
    answerOf('Zaza', recent.slotId, 'YES');

    const events = eventsOf(await (await request.get(`/api/calendar/${token}.ics`)).text());
    expect(events.map((event) => event.SUMMARY)).toEqual([`${band} – Mariage`]);
  });

  test('a change of the gig or of the answer gives the event a higher version', async ({
    playwright,
    request,
  }) => {
    const zaza = await deviceOf(playwright, email('Zaza'));
    const token = (await (await zaza.post('/api/me/calendar')).json()).token;
    const { gigId, slotId } = addGig('Carnaval', { status: 'CONFIRMED', startsOn: day(10) });
    answerOf('Zaza', slotId, 'MAYBE');
    sql(`UPDATE gigSlotAttendance SET updatedAt = UTC_TIMESTAMP() - INTERVAL 1 DAY`);
    sql(`UPDATE gig SET updatedAt = UTC_TIMESTAMP() - INTERVAL 1 DAY WHERE id = ${gigId}`);
    const read = async () =>
      eventsOf(await (await request.get(`/api/calendar/${token}.ics`)).text())[0] ?? {};

    const before = await read();
    await zaza.put(`/api/gigs/${gigId}/slots/${slotId}/answer`, { data: { answer: 'YES' } });
    const after = await read();
    expect(after.STATUS).toBe('CONFIRMED');
    expect(Number(after.SEQUENCE)).toBeGreaterThan(Number(before.SEQUENCE));
    expect(after.UID).toBe(before.UID);
  });
});
