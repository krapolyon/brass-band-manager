<?php

declare(strict_types=1);

namespace BrassBand\Health;

use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception as DatabaseException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/health: tells whether the API reaches the database.
// Used by the shell of the front and by the local stack to know it is ready.
final class HealthAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $this->database->fetchOne('SELECT 1');
        } catch (DatabaseException) {
            return Json::write($response, ['database' => 'unreachable'], 503);
        }

        return Json::write($response, ['database' => 'ok']);
    }
}
