import { execFileSync } from 'node:child_process';

// The personal fields of a member are encrypted in the database (0.3.1,
// model/members.md, "Encryption"): a test reads them back the way the app
// does, through the classes of the test server and its key, never with a key
// of its own.

const script = `<?php
$config = require '/var/www/api/bootstrap.php';
$database = BrassBand\\Database::connect($config['database']);
$personal = BrassBand\\Members\\PersonalData::from($config, $database);
$row = $database->fetchAssociative('SELECT ' . $argv[1] . ' FROM member m WHERE m.nickname = ?', [$argv[2]]);
echo implode("\\t", array_map(fn ($value) => $value === null ? 'NULL' : (string) $value, $personal->opened($row ?: [])));
`;

/**
 * Columns of the row of a member ("firstName, city"), tab-separated like
 * sql(), the personal fields in clear. "NULL" for an empty one.
 */
export function memberColumns(nickname: string, columns: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'web-test', 'php', '--', columns, nickname],
    { encoding: 'utf8', input: script },
  ).trim();
}
