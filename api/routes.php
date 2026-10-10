<?php

declare(strict_types=1);

// Every address the API answers, in one place. An address that is not listed
// here does not exist.
//
// A route is a method, an address and the action that answers it. An action is
// a class of src/<Domain>/ with an __invoke() method; what it needs (the
// database, most of the time) is given to it here.

use BrassBand\Health\HealthAction;
use Doctrine\DBAL\Connection;
use Slim\App;

return function (App $app, Connection $database): void {
    $app->get('/api/health', new HealthAction($database));
};
