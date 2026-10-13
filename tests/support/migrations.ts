import { execFileSync } from 'node:child_process';
import { sql } from './database.ts';

// The migrations of the test database, put in the states a host can be in
// after a deployment: one that waits, one that will fail.

// The migration these states are made with. It stays this one when later
// migrations are added, as long as none of them needs the column it adds.
export const LAST = '012_gigProposedAt.sql';

/** As if the last migration had never run: its change is undone and its record removed. */
export function unapplyLast() {
  sql(`ALTER TABLE gig DROP COLUMN proposedAt; DELETE FROM schemaMigration WHERE name = '${LAST}'`);
}

/** The record of the last migration is removed, but its change is still there: applying it fails. */
export function forgetLast() {
  sql(`DELETE FROM schemaMigration WHERE name = '${LAST}'`);
}

/** No table at all, as on a host where the database was just created. */
export function dropTables() {
  const tables = sql('SHOW TABLES').split('\n').filter(Boolean);
  if (tables.length === 0) return;
  sql(
    `SET FOREIGN_KEY_CHECKS = 0; ${tables.map((table) => `DROP TABLE \`${table}\`;`).join(' ')} SET FOREIGN_KEY_CHECKS = 1;`,
  );
}

/** Whatever a test did to the tables, the test database is whole again. */
export function repairMigrations() {
  // A first migration that was stopped halfway (a test puts a table in its
  // way): start again from no table at all.
  const tables = sql('SHOW TABLES').split('\n').filter(Boolean);
  const hasStarted =
    tables.includes('schemaMigration') &&
    sql("SELECT COUNT(*) FROM schemaMigration WHERE name LIKE '001\\_%'") === '1';
  if (!hasStarted) dropTables();
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
