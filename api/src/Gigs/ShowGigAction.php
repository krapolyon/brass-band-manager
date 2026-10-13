<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/gigs/{id}: one gig, with its slots and the answer of every member.
// A draft answers 404 to who cannot edit it.
final class ShowGigAction
{
    public function __construct(private readonly Gigs $gigs)
    {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        return Json::write($response, $this->gigs->one(CurrentMember::of($request), (int) $arguments['id']));
    }
}
