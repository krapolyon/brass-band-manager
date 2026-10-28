<?php

declare(strict_types=1);

// Loaded first by every entry point (the API and the command-line scripts).
// Makes the libraries and the classes of src/ available, and returns the
// server configuration.

require __DIR__ . '/vendor/autoload.php';

// Where config.php and storage/ are. On a host, a deployment replaces the
// folder of the app, so what must survive it lives beside that folder, in the
// folder of the same name followed by "-data": the app in /home/band/app, its
// data in /home/band/app-data. When that folder exists, both are read there,
// never one there and the other here. Without it (the local stack, or a host
// where nothing replaces the folder), they are where they always were:
// api/config.php and storage/.
$appFolder = dirname(__DIR__);
$dataFolder = dirname($appFolder) . '/' . basename($appFolder) . '-data';
$hasDataFolder = is_dir($dataFolder);

$config = require ($hasDataFolder ? $dataFolder : __DIR__) . '/config.php';

// Not settings of config.php: where the files of the app are on this server.
$config['storageFolder'] = ($hasDataFolder ? $dataFolder : $appFolder) . '/storage';
// The folder an admin drops a large export or reprise into by FTP, at the
// root of the data folder (0.4.0, issue #43, decided with the owner): the app
// lists the zips it finds there, and an upload from the browser lands there too.
$config['importFolder'] = ($hasDataFolder ? $dataFolder : $appFolder) . '/import';
$config['migrationsFolder'] = $appFolder . '/database/migrations';

// The clock of the app is the one of the band: the hour of the reminders of
// gigs, and the day a gig is over, are read on it.
if (is_string($config['timeZone'] ?? null) && $config['timeZone'] !== '') {
    date_default_timezone_set($config['timeZone']);
}

return $config;
