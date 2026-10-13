<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/members/{id}: one member, as the signed-in member may see them.
final class ShowMemberAction
{
    public function __construct(private readonly Members $members)
    {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        return Json::write(
            $response,
            $this->members->oneVisibleTo(CurrentMember::of($request), (int) $arguments['id']),
        );
    }
}
