<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/members/{id}/passwordLink: creates the password link of a member,
// for an invitation to send again or a forgotten password. Asks for
// MANAGE_MEMBERS. A new link cancels the previous one.
//
// The token is in the answer, this once and never again.
final class CreatePasswordLinkAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly PasswordLinks $links,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);

        $token = $this->database->transactional(function () use ($me, $arguments): string {
            $target = $this->members->target((int) $arguments['id'], lock: true);
            // A member who left is brought back first, which gives them a link.
            if ($target['status'] === 'LEFT') {
                throw new ApiError(409, 'memberLeft');
            }
            // Whoever holds the link of a member can become that member.
            Members::mustCover($me, $target);

            return $this->links->create($target['id'], $me->id);
        });

        return Json::write($response, ['passwordLinkToken' => $token], 201);
    }
}
