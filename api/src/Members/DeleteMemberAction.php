<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/members/{id}: cancels an invitation. Asks for MANAGE_MEMBERS.
//
// Only a member who is still INVITED is deleted: nothing refers to them yet.
// A member who has been active is never deleted, they are marked as gone
// (model/members.md, "Life cycle").
final class DeleteMemberAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly PhotoStore $photos,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $photoPath = $this->database->transactional(function () use ($request, $arguments): ?string {
            $target = $this->members->target((int) $arguments['id'], lock: true);
            if ($target['status'] !== 'INVITED') {
                throw new ApiError(409, 'notInvited');
            }
            Members::mustCover(CurrentMember::of($request), $target);

            // Their password link and their roles go with them (ON DELETE CASCADE).
            $this->database->delete('member', ['id' => $target['id']]);

            return $target['photoPath'];
        });
        $this->photos->delete($photoPath);

        return Json::write($response, ['deleted' => true]);
    }
}
