<?php

// Server configuration. Copy this file to config.php, which is never committed.
// The values below are those of the local Docker stack (docker-compose.yml):
// they are not secrets. On the host, config.php holds the real ones.

return [
    'database' => [
        'host' => 'db',
        'port' => 3306,
        'name' => 'brassBand',
        'user' => 'brassBand',
        'password' => 'local-only',
    ],
];
