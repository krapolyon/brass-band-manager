<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/gigs: the gigs to come that the member sees, the nearest first.
// With ?all, the cancelled gigs and those already played too. A draft is
// listed for who may edit it only.
final class ListGigsAction
{
    public function __construct(private readonly Gigs $gigs)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $everything = array_key_exists('all', $request->getQueryParams());

        return Json::write($response, $this->gigs->all(CurrentMember::of($request), $everything));
    }
}
