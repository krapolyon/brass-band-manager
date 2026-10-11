// Makes sure the test database exists and has every migration: npm run test:prepare
// Run automatically before "npm test". The tests empty this database, never
// the one the app uses on port 8080.

import { execFileSync } from 'node:child_process';

const sql = `
  CREATE DATABASE IF NOT EXISTS brassBandTest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON brassBandTest.* TO 'brassBand'@'%';
`;

execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'db', 'mysql', '-uroot', '-plocal-only', '-e', sql],
  {
    stdio: ['ignore', 'inherit', 'ignore'],
  },
);
execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'web-test', 'php', '/var/www/database/migrate.php'],
  {
    stdio: 'inherit',
  },
);
