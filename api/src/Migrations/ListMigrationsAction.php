<?php

declare(strict_types=1);

namespace BrassBand\Migrations;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/migrations: the migrations that wait to be applied, for the admin
// (model/band.md, "Updating the database"). Changes nothing.
final class ListMigrationsAction
{
    public function __construct(private readonly Migrations $migrations)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, ['pending' => $this->migrations->pending()]);
    }
}
