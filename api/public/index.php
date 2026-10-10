<?php

declare(strict_types=1);

// Single entry point of the API: every /api/... request arrives here.
// See docs/architecture.md, "How a request travels".

use BrassBand\Access\SameSiteOnly;
use BrassBand\Database;
use BrassBand\Http\ErrorHandler;
use Slim\Factory\AppFactory;

// An error is never shown to whoever made the request, whatever the host is
// set to: it goes to the log.
ini_set('display_errors', '0');

$config = require __DIR__ . '/../bootstrap.php';

header_remove('X-Powered-By');

// Over HTTPS (always, on the host), tell the browser to never come back over
// plain HTTP, where the session cookie would not be sent anyway.
if ($config['session']['secureCookie'] ?? true) {
    header('Strict-Transport-Security: max-age=31536000');
}

$database = Database::connect($config['database']);

$app = AppFactory::create();

// Reads a JSON body into an array, for the routes that receive data.
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// Refuses a request that changes something when it comes from another site.
$app->add(new SameSiteOnly());

// Added last, so that it wraps everything above: whatever goes wrong in a
// route ends in ErrorHandler. Slim's own display and logging are turned off.
$app->addErrorMiddleware(false, false, false)
    ->setDefaultErrorHandler(new ErrorHandler($app->getResponseFactory()));

(require __DIR__ . '/../routes.php')($app, $database, $config);

$app->run();
