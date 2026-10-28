<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/costumes: the costumes of the band, in its order.
final class ListCostumesAction
{
    public function __construct(private readonly Costumes $costumes)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->costumes->all());
    }
}
