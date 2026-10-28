<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/members/{id}/passwordLink: cancels the pending password link of
// a member. Asks for MANAGE_MEMBERS.
final class DeletePasswordLinkAction
{
    public function __construct(
        private readonly Members $members,
        private readonly PasswordLinks $links,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $target = $this->members->target((int) $arguments['id']);
        // Like creating one: acting on the access of a member.
        Members::mustCover(CurrentMember::of($request), $target);
        $this->links->cancel($target['id']);

        return Json::write($response, ['deleted' => true]);
    }
}
