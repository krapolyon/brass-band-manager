<?php

declare(strict_types=1);

namespace BrassBand\Migrations;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\InvalidFieldNameException;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Throwable;

// Tells whether a failure comes from a database that has not followed the
// code yet: a new version is on the host, its migrations wait, and a query
// asks for a column or a table they create (model/band.md, "Updating the
// database"). The API then answers 503 "databaseBehind" instead of a bare
// error, and the front leads an admin to the screen that applies them.
//
// Without this, the first thing the app asks (who is signed in) can fail, and
// the screen of the migrations is never reached.
final class DatabaseBehind
{
    public function __construct(
        private readonly Connection $database,
        private readonly string $folder,
    ) {
    }

    public function explains(Throwable $thrown): bool
    {
        if (!$thrown instanceof InvalidFieldNameException && !$thrown instanceof TableNotFoundException) {
            return false;
        }

        try {
            return Migrations::pendingIn($this->database, $this->folder) !== [];
        } catch (Throwable) {
            // The database does not answer this either: the error stays what it was.
            return false;
        }
    }
}
