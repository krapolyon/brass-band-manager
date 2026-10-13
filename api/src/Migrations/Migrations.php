<?php

declare(strict_types=1);

namespace BrassBand\Migrations;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;
use PDO;
use PDOException;

// The migrations: the numbered SQL scripts of database/migrations/, applied
// in the order of their numbers. The only code that applies them, for the
// three ways to ask: the command line (database/migrate.php), the install on
// an empty database, and the screen of the admin on a host without a command
// line.
//
// A script that has run is recorded in the schemaMigration table and is never
// run again. This is why a migration is never edited once it has run: write a
// new one instead.
final class Migrations
{
    // One run at a time, whoever asks: the name of the lock held in MySQL.
    private const LOCK = 'brassBandMigrations';

    public function __construct(
        private readonly Connection $database,
        private readonly string $folder,
    ) {
    }

    /**
     * The scripts that have not run yet, in the order they will.
     *
     * @return list<string> File names: "013_quotes.sql"
     */
    public function pending(): array
    {
        try {
            $applied = $this->database->fetchFirstColumn('SELECT name FROM schemaMigration');
        } catch (TableNotFoundException) {
            // A database nothing was ever applied to.
            $applied = [];
        }

        $names = array_map(basename(...), glob($this->folder . '/*.sql') ?: []);
        sort($names);

        return array_values(array_diff($names, $applied));
    }

    /**
     * Applies the scripts that have not run yet and stops at the first that
     * fails. MySQL does not undo table changes: what ran before the error
     * stays, and the database must be repaired by hand before trying again.
     *
     * @return array{applied: list<string>, failed: array{name: string, message: string}|null, busy: bool}
     *   "busy" when another run holds the lock: nothing was done.
     */
    public function run(): array
    {
        if ((int) $this->database->fetchOne('SELECT GET_LOCK(?, 0)', [self::LOCK]) !== 1) {
            return ['applied' => [], 'failed' => null, 'busy' => true];
        }

        // A run is not cut short: a script stopped halfway is neither applied
        // nor undone. It goes on when the browser gives up waiting, and for
        // as long as the host lets PHP run.
        ignore_user_abort(true);
        set_time_limit(0);

        try {
            return [...$this->apply(), 'busy' => false];
        } finally {
            $this->database->fetchOne('SELECT RELEASE_LOCK(?)', [self::LOCK]);
        }
    }

    /**
     * @return array{applied: list<string>, failed: array{name: string, message: string}|null}
     */
    private function apply(): array
    {
        $this->database->executeStatement(
            'CREATE TABLE IF NOT EXISTS schemaMigration (
                name VARCHAR(190) NOT NULL PRIMARY KEY,
                appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        );

        // A migration file holds several statements. They are sent through the
        // plain PHP connection, with the setting that accepts several
        // statements at once, for the time of the run only: the API keeps
        // real prepared statements.
        $pdo = $this->database->getNativeConnection();
        if (!$pdo instanceof PDO) {
            throw new \LogicException('Migrations need the PDO driver.');
        }
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

        $applied = [];
        try {
            foreach ($this->pending() as $name) {
                try {
                    // Walking through every result is what reports an error in
                    // any statement of the file, not only in the first one.
                    $statement = $pdo->query((string) file_get_contents($this->folder . '/' . $name));
                    if ($statement === false) {
                        throw new PDOException('The script could not be sent.');
                    }
                    while ($statement->nextRowset()) {
                    }
                    $statement->closeCursor();
                } catch (PDOException $exception) {
                    return ['applied' => $applied, 'failed' => ['name' => $name, 'message' => $exception->getMessage()]];
                }
                $this->database->insert('schemaMigration', ['name' => $name]);
                $applied[] = $name;
            }
        } finally {
            $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        }

        return ['applied' => $applied, 'failed' => null];
    }
}
