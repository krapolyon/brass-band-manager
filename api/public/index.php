<?php

declare(strict_types=1);

// Single entry point of the API: every /api/... request arrives here.
// See docs/architecture.md, "How a request travels".

use BrassBand\Database;
use BrassBand\Http\ErrorHandler;
use Slim\Factory\AppFactory;

$config = require __DIR__ . '/../bootstrap.php';

header_remove('X-Powered-By');

$database = Database::connect($config['database']);

$app = AppFactory::create();

// Reads a JSON body into an array, for the routes that receive data.
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// Added last, so that it wraps everything above: whatever goes wrong in a
// route ends in ErrorHandler. Slim's own display and logging are turned off.
$app->addErrorMiddleware(false, false, false)
    ->setDefaultErrorHandler(new ErrorHandler($app->getResponseFactory()));

(require __DIR__ . '/../routes.php')($app, $database);

$app->run();
