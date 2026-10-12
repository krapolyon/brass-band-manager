<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/instrumentAliases: every instrument of the band with its known
// spellings. Asks for MANAGE_SONGS (model/songs.md, entry 2, "Access rights").
final class ListAliasesAction
{
    public function __construct(private readonly InstrumentAliases $aliases)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->aliases->all());
    }
}
