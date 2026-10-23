<?php

declare(strict_types=1);

// Applies the migrations that have not run yet, in the order of their numbers.
// Run from the command line: php database/migrate.php
//
// On a host without a command line, the same work is asked through the API,
// by the install or by the admin: see BrassBand\Migrations\Migrations.

use BrassBand\Database;
use BrassBand\Members\PersonalData;
use BrassBand\Migrations\Migrations;

// Never from a browser: it is not an address of the app.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require __DIR__ . '/../api/bootstrap.php';

$database = Database::connect($config['database']);
$personal = PersonalData::from($config, $database);
if (!$personal->hasKey()) {
    // Without it, nothing of the members would be readable after the run.
    echo "config.php has no encryption key (encryptionKey). Make one with \"npm run encryption:key\".\n";
    exit(1);
}
$migrations = new Migrations($database, $config['migrationsFolder'], $personal);
$result = $migrations->run();

if ($result['busy']) {
    echo "Migrations are already being applied.\n";
    exit(1);
}
foreach ($result['applied'] as $name) {
    echo "Applied {$name}.\n";
}
if ($result['failed'] !== null) {
    // MySQL does not undo table changes: what ran before the error stays.
    echo "{$result['failed']['name']} failed.\n{$result['failed']['message']}\n";
    echo "Fix the database by hand, or restore it, before running migrations again.\n";
    exit(1);
}

$count = count($result['applied']);
echo $count === 0 ? "Nothing to apply.\n" : "{$count} migration(s) applied.\n";
if ($result['encrypted'] > 0) {
    echo "{$result['encrypted']} member record(s) encrypted.\n";
}
