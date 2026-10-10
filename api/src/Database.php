<?php

declare(strict_types=1);

namespace BrassBand;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use PDO;
use Pdo\Mysql;

// The only place where the connection to the database is set up.
//
// It returns a Doctrine DBAL connection, which every action uses for its
// queries. Values are always passed apart from the SQL, never glued into it:
//
//   $database->fetchAssociative('SELECT id, firstName FROM member WHERE email = ?', [$email]);
//   $database->insert('song', ['title' => $title, 'status' => 'PROPOSED']);
//
// The connection is opened by the first query, not here: a request that needs
// no data opens nothing.
final class Database
{
    /**
     * @param array{host: string, port: int, name: string, user: string, password: string} $settings
     */
    public static function connect(array $settings): Connection
    {
        return DriverManager::getConnection([
            'driver' => 'pdo_mysql',
            'host' => $settings['host'],
            'port' => $settings['port'],
            'dbname' => $settings['name'],
            'user' => $settings['user'],
            'password' => $settings['password'],
            'charset' => 'utf8mb4',
            'driverOptions' => [
                // Real prepared statements, sent to MySQL separately from their values.
                PDO::ATTR_EMULATE_PREPARES => false,
                // Instants are stored and read in UTC, whatever the clock of the server.
                Mysql::ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
            ],
        ]);
    }
}
