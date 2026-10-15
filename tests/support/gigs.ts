import { sql } from './database.ts';
import { memberId } from './scenario.ts';

// Gigs created straight in the test database, for what the tests of the
// screens and of the API start from. The gigs are examples; nobody is real.

/**
 * A day counted from today, as 2026-12-04, in UTC: the clock the server reads
 * the end of a gig and the reminders on, in the tests.
 */
export function day(fromToday: number): string {
  return new Date(Date.now() + fromToday * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The same, on the clock of the computer: the one the browser reads "today"
 * on. Between midnight and the hour of UTC, day(0) is still yesterday there.
 */
export function localDay(fromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + fromToday);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type NewGig = {
  status?: 'DRAFT' | 'PROPOSED' | 'ACCEPTED' | 'CONFIRMED' | 'CANCELLED';
  startsOn?: string;
  endsOn?: string;
  meetingTime?: string;
  placeName?: string;
  city?: string;
  notes?: string;
  /** How many days ago members first saw the gig. Today when left out; never for a draft. */
  proposedDaysAgo?: number;
  /** The names of its slots; one slot without a name when left out. */
  slots?: string[];
};

const text = (value: string | undefined) =>
  value === undefined ? 'NULL' : `'${value.replace(/'/g, "''")}'`;

/** Creates a gig with its slots. Returns its id and the ids of its slots, in order. */
export function addGig(name: string, gig: NewGig = {}) {
  const gigId = Number(
    sql(
      `INSERT INTO gig (name, status, startsOn, endsOn, meetingTime, placeName, city, notes, proposedAt)
       VALUES (${text(name)}, '${gig.status ?? 'PROPOSED'}', '${gig.startsOn ?? day(30)}', ${text(gig.endsOn)},
               ${text(gig.meetingTime)}, ${text(gig.placeName)}, ${text(gig.city)}, ${text(gig.notes)},
               ${gig.status === 'DRAFT' ? 'NULL' : `UTC_TIMESTAMP() - INTERVAL ${gig.proposedDaysAgo ?? 0} DAY`});
       SELECT LAST_INSERT_ID();`,
    ),
  );
  const slotIds = (gig.slots ?? [undefined]).map((slot, index) =>
    Number(
      sql(
        `INSERT INTO gigSlot (gigId, name, position) VALUES (${gigId}, ${text(slot)}, ${index + 1}); SELECT LAST_INSERT_ID();`,
      ),
    ),
  );
  return { gigId, slotIds, slotId: slotIds[0] as number };
}

export function addCostume(name: string): number {
  return Number(
    sql(
      `INSERT INTO costume (name, position) SELECT ${text(name)}, COUNT(*) + 1 FROM costume; SELECT LAST_INSERT_ID();`,
    ),
  );
}

export function organise(gigId: number, nickname: string) {
  sql(`INSERT INTO gigOrganizer (gigId, memberId) VALUES (${gigId}, ${memberId(nickname)})`);
}

export function answerOf(nickname: string, slotId: number, answer: string) {
  sql(
    `REPLACE INTO gigSlotAttendance (gigSlotId, memberId, answer) VALUES (${slotId}, ${memberId(nickname)}, '${answer}')`,
  );
}

/** Gives a member another instrument of the band, by its name. */
export function plays(nickname: string, instrument: string) {
  sql(
    `UPDATE member SET instrumentId = (SELECT id FROM instrument WHERE name = ${text(instrument)}) WHERE id = ${memberId(nickname)}`,
  );
}

/** A song of the band, by its name. The titles are examples. */
export function addSong(
  name: string,
  status:
    | 'PROPOSED'
    | 'IN_PROGRESS'
    | 'IN_REPERTOIRE'
    | 'TEMPORARY'
    | 'ABANDONED' = 'IN_REPERTOIRE',
): number {
  return Number(
    sql(
      `INSERT INTO song (name, originalTitle, originalArtist, status) VALUES (${text(name)}, ${text(name)}, 'Exemple', '${status}'); SELECT LAST_INSERT_ID();`,
    ),
  );
}

/** A setlist written straight in the database. Returns its id. */
export function addSetlist(gigId: number, slotId: number, songIds: number[], description?: string) {
  const id = Number(
    sql(
      `INSERT INTO setlist (gigId, gigSlotId, number, description)
       SELECT ${gigId}, ${slotId}, COALESCE(MAX(number), 0) + 1, ${text(description)} FROM setlist WHERE gigId = ${gigId};
       SELECT LAST_INSERT_ID();`,
    ),
  );
  songIds.forEach((songId, index) => {
    sql(
      `INSERT INTO setlistSong (setlistId, position, songId) VALUES (${id}, ${index + 1}, ${songId})`,
    );
  });
  return id;
}
