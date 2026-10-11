<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/members: the directory of the band, as the signed-in member may
// see it (see Members::visibleTo).
final class ListMembersAction
{
    public function __construct(private readonly Members $members)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->members->visibleTo(CurrentMember::of($request)));
    }
}
