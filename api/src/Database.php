<?php

declare(strict_types=1);

namespace BrassBand;

use PDO;

// The only place where a database connection is opened.
final class Database
{
    public static function connect(array $settings): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $settings['host'],
            $settings['port'],
            $settings['name'],
        );

        return new PDO($dsn, $settings['user'], $settings['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Real prepared statements, sent to MySQL separately from their values.
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
