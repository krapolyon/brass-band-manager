<?php

// Configuration of the LOCAL Docker stack (docker-compose.yml).
// "npm run setup" copies this file to config.php, which is never committed.
//
// NEVER USE THIS FILE ON THE HOST: every value here is public. The host starts
// from config.example.php.

return [
    'database' => [
        'host' => 'db',
        'port' => 3306,
        // The local test server (port 8081) sets BRASS_BAND_DATABASE to its own database.
        'name' => getenv('BRASS_BAND_DATABASE') ?: 'brassBand',
        'user' => 'brassBand',
        'password' => 'local-only',
    ],

    // At least 16 characters, like a real one.
    'installKey' => 'local-install-key',

    'session' => [
        // The local stack has no HTTPS, and a browser refuses a secure cookie without it.
        'secureCookie' => false,
    ],
];
