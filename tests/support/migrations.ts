import { execFileSync } from 'node:child_process';
import { sql } from './database.ts';

// The migrations of the test database, put in the states a host can be in
// after a deployment: one that waits, one that will fail.

export const LAST = '012_gigProposedAt.sql';

/** As if the last migration had never run: its change is undone and its record removed. */
export function unapplyLast() {
  sql(`ALTER TABLE gig DROP COLUMN proposedAt; DELETE FROM schemaMigration WHERE name = '${LAST}'`);
}

/** The record of the last migration is removed, but its change is still there: applying it fails. */
export function forgetLast() {
  sql(`DELETE FROM schemaMigration WHERE name = '${LAST}'`);
}

/** Whatever a test did to the tables, the test database is whole again. */
export function repairMigrations() {
  const columns = sql(
    `SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gig' AND COLUMN_NAME = 'proposedAt'`,
  );
  if (columns === '1') {
    sql(`INSERT IGNORE INTO schemaMigration (name) VALUES ('${LAST}')`);
  }
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'web-test', 'php', '/var/www/database/migrate.php'],
    { stdio: 'ignore' },
  );
}
