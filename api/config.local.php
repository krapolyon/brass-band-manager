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

    // The test server (port 8081) says its own address.
    'appUrl' => getenv('BRASS_BAND_APP_URL') ?: 'http://localhost:8080',

    // Mailpit, the mailbox of the local stack: it receives every email and
    // sends none further. Read them at http://localhost:8025.
    // A third local server (port 8082) has no mail server, to test an
    // instance that cannot send email.
    'mail' => [
        'from' => 'app@example.org',
        'host' => getenv('BRASS_BAND_NO_MAIL') ? '' : 'mail',
        'port' => 1025,
        'encryption' => '',
        'user' => '',
        'password' => '',
    ],

    'session' => [
        // The local stack has no HTTPS, and a browser refuses a secure cookie without it.
        'secureCookie' => false,
    ],
];
