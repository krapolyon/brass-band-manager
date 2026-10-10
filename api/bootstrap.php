<?php

declare(strict_types=1);

// Loaded first by every entry point (the API and the command-line scripts).
// Makes the libraries and the classes of src/ available, and returns the
// server configuration.

require __DIR__ . '/vendor/autoload.php';

return require __DIR__ . '/config.php';
