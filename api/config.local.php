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

    // Where the thumbnail of a clip is fetched. Left out, it is YouTube. The
    // test server fetches a file of its own instead (docker-compose.yml).
    ...(getenv('BRASS_BAND_CLIP_THUMBNAIL_URL') ? ['clipThumbnailUrls' => [getenv('BRASS_BAND_CLIP_THUMBNAIL_URL')]] : []),

    // A key pair made for the local stack only: it is public, like the rest
    // of this file. The test server (port 8081) records the notifications in
    // a file instead of sending them.
    'push' => [
        'publicKey' => 'BPVjeNfgr_yJsrN4IaNlfldXO6r7qVveK23-TNk8ay5jkpqndtzN0F98VVAKG3XUTWDFPOE5BQiym0Cz0PCRt7Y',
        'privateKey' => 'ILLY9TvTFQGBXKJiHw_boqBAwqopGIOU6C0fgX9m7ds',
        'recordTo' => getenv('BRASS_BAND_PUSH_LOG') ?: '',
    ],
    // The test server reads the tiles of the map at an address of its own,
    // which the tests answer: they ask nothing of another site.
    ...(getenv('BRASS_BAND_MAP_TILES_URL') !== false ? ['mapTilesUrl' => getenv('BRASS_BAND_MAP_TILES_URL')] : []),
    'session' => [
        // The local stack has no HTTPS, and a browser refuses a secure cookie without it.
        'secureCookie' => false,
    ],
];
