<?php

declare(strict_types=1);

// Sends the automatic reminders of gigs that are due (model/gigs.md, rule
// "Automatic reminders"). To run every hour, as a scheduled task of the host:
//
//     php api/tasks/gigReminders.php
//
// Running it more than once changes nothing: a gig is reminded for once a
// day at most. It prints how many gigs it reminded for.
//
// --now="2026-11-20 18:05" runs it as if it were that moment, to try it out.

use BrassBand\Database;
use BrassBand\Gigs\Reminders;
use BrassBand\Http\AfterResponse;
use BrassBand\Push\PushSetup;

// Never from a browser: it is not an address of the app.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require __DIR__ . '/../bootstrap.php';
$database = Database::connect($config['database']);

$now = new DateTimeImmutable();
foreach (array_slice($argv, 1) as $argument) {
    if (str_starts_with($argument, '--now=')) {
        $now = new DateTimeImmutable(substr($argument, 6));
    }
}

$count = (new Reminders($database, PushSetup::from($config, $database)))->sendDue($now);

// The notifications are put aside to leave after the answer of a request:
// here there is none, they leave now.
AfterResponse::run();

echo "{$count} gig(s) reminded for.\n";
