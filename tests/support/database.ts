import { execFileSync } from 'node:child_process';

// Direct access to the test database (brassBandTest), for what a test cannot
// do through the API: starting from nothing, creating members in a given
// state, moving a date into the past, looking at what was saved.

const tables = [
  'setlistSong',
  'songSpokenName',
  'setlist',
  'gigSlotAttendance',
  'gigSlot',
  'gigCostume',
  'gigOrganizer',
  'gig',
  'costume',
  'pushSubscription',
  'memberSong',
  'songPart',
  'songPosition',
  'songTiringSection',
  'songTrickySection',
  'song',
  'instrumentAlias',
  'memberPasswordLink',
  'memberSession',
  'memberRole',
  'member',
  'instrument',
  'section',
  'band',
];

/** Runs SQL and returns what it prints, one row per line, columns separated by tabs. */
export function sql(query: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'mysql',
      '--default-character-set=utf8mb4',
      '-ubrassBand',
      '-plocal-only',
      'brassBandTest',
      '--batch',
      '--skip-column-names',
      '-e',
      query,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

/** Back to a database on which the app has never been installed. */
export function emptyDatabase(): void {
  sql(
    `SET FOREIGN_KEY_CHECKS = 0; ${tables.map((table) => `TRUNCATE TABLE ${table};`).join(' ')} SET FOREIGN_KEY_CHECKS = 1;`,
  );
}

const hashes = new Map<string, string>();

/** The hash PHP would store for a password, so that a test can create a member who can sign in. */
export function passwordHash(password: string): string {
  let hash = hashes.get(password);
  if (!hash) {
    hash = execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'web-test',
        'php',
        '-r',
        'echo password_hash($argv[1], PASSWORD_DEFAULT);',
        password,
      ],
      { encoding: 'utf8' },
    ).trim();
    hashes.set(password, hash);
  }
  return hash;
}
