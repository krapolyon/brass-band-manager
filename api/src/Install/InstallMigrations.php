<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Http\ApiError;
use BrassBand\Migrations\Migrations;

// What the install does to the database before anything else: it applies the
// migrations that have not run, so that on a host the person who installs
// starts from an empty database and does one thing only.
//
// Called once the install key was accepted, and only while the app is not
// installed: afterwards the key opens nothing, and the migrations are for the
// admin (RunMigrationsAction).
final class InstallMigrations
{
    public static function apply(Migrations $migrations): void
    {
        if ($migrations->pending() === []) {
            return;
        }

        $result = $migrations->run();
        if ($result['busy']) {
            throw new ApiError(409, 'migrationsRunning');
        }
        if ($result['failed'] !== null) {
            // The name of the script only: it is in the repository. What MySQL
            // said is not answered to someone who is not signed in.
            error_log('The install could not apply ' . $result['failed']['name']);
            throw new ApiError(500, 'migrationFailed');
        }
    }
}
