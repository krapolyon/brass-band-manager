<?php

declare(strict_types=1);

// Loaded first by every entry point (the API and the command-line scripts).
// Makes the libraries and the classes of src/ available, and returns the
// server configuration.

require __DIR__ . '/vendor/autoload.php';

$config = require __DIR__ . '/config.php';

// The clock of the app is the one of the band: the hour of the reminders of
// gigs, and the day a gig is over, are read on it.
if (is_string($config['timeZone'] ?? null) && $config['timeZone'] !== '') {
    date_default_timezone_set($config['timeZone']);
}

return $config;
