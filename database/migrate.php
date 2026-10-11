<?php

declare(strict_types=1);

// Applies the migrations that have not run yet, in the order of their numbers.
// Run from the command line: php database/migrate.php
//
// A script that has run is recorded in the schemaMigration table and is never
// run again. This is why a migration is never edited once it has run: write a
// new one instead.

use BrassBand\Database;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require __DIR__ . '/../api/bootstrap.php';

$database = Database::connect($config['database']);

$database->executeStatement(
    'CREATE TABLE IF NOT EXISTS schemaMigration (
        name VARCHAR(190) NOT NULL PRIMARY KEY,
        appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
);

// A migration file holds several statements. They are sent through the plain
// PHP connection, with the setting that accepts several statements at once.
$pdo = $database->getNativeConnection();
assert($pdo instanceof PDO);
$pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

$applied = $database->fetchFirstColumn('SELECT name FROM schemaMigration');
$files = glob(__DIR__ . '/migrations/*.sql') ?: [];
sort($files);

$count = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (in_array($name, $applied, true)) {
        continue;
    }

    echo "Applying {$name}… ";
    try {
        // Walking through every result is what reports an error in any
        // statement of the file, not only in the first one.
        $statement = $pdo->query((string) file_get_contents($file));
        assert($statement !== false);
        while ($statement->nextRowset()) {
        }
    } catch (PDOException $exception) {
        // MySQL does not undo table changes: what ran before the error stays.
        echo "failed.\n" . $exception->getMessage() . "\n";
        echo "Fix the database by hand, or restore it, before running migrations again.\n";
        exit(1);
    }
    $database->insert('schemaMigration', ['name' => $name]);
    echo "done.\n";
    $count++;
}

echo $count === 0 ? "Nothing to apply.\n" : "$count migration(s) applied.\n";
