<?php

declare(strict_types=1);

// Prints a new pair of keys for push notifications (VAPID), to copy into
// config.php, under "push". Run once per instance, on a computer:
//
//     npm run push:keys
//
// Changing the keys of an instance later makes every device accept
// notifications again. The private key is a secret: never commit it.

use Minishlink\WebPush\VAPID;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../vendor/autoload.php';

$keys = VAPID::createVapidKeys();

echo "    'push' => [\n";
echo "        'publicKey' => '{$keys['publicKey']}',\n";
echo "        'privateKey' => '{$keys['privateKey']}',\n";
echo "    ],\n";
