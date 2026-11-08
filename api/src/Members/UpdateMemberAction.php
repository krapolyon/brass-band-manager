<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/members/{id}: edits the record of a member. A member edits their
// own; who holds MANAGE_MEMBERS edits any. Roles and status are not part of
// the record: they have their own routes.
//
// When the email of an invited member changes, their link is cancelled: it
// went to the former address, perhaps to someone else (1.1.0, owner). With
// a mail server, a new invitation leaves at once for the new address, and its
// token is in the answer this once, as when it is sent again. The former link
// is deleted with its date of sending, so the 5 minutes between two emails
// do not stop this one: it goes to another address.
final class UpdateMemberAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly MemberRecord $record,
        private readonly PasswordLinks $links,
        private readonly Invitations $invitations,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $input = Input::from($request, MemberInput::class);
        $memberId = (int) $arguments['id'];

        try {
            $token = $this->database->transactional(function () use ($me, $input, $memberId): ?string {
                // Held until the end: a departure sent at the same instant
                // comes before or after this, never in the middle.
                $target = $this->members->target($memberId, lock: true);

                // What was erased when a member left is not written again behind their back.
                if ($target['status'] === 'LEFT') {
                    throw new ApiError(409, 'memberLeft');
                }

                $values = $this->record->check($input, $target['id']);

                // The email is what a member signs in with: changing the one
                // of someone else is acting on their access.
                if ($values['email'] !== $target['email']) {
                    Members::mustCover($me, $target);
                }

                $this->database->update('member', [...$this->record->stored($values), 'updatedByMemberId' => $me->id], ['id' => $target['id']]);

                if ($target['status'] !== 'INVITED' || $values['email'] === $target['email']) {
                    return null;
                }
                $this->links->cancel($target['id']);

                return $this->invitations->canSend()
                    ? $this->links->create($target['id'], $me->id, emailed: true, isInvitation: true)
                    : null;
            });
        } catch (UniqueConstraintViolationException) {
            // Taken between the check and the save: the check now says which field.
            $this->record->check($input, $memberId);
            throw new ApiError(422, 'invalidInput', ['nickname' => 'duplicate']);
        }

        if ($token === null) {
            return Json::write($response, $this->members->oneVisibleTo($me, $memberId));
        }
        $this->invitations->sendLater([$memberId => $token]);

        return Json::write(
            $response,
            [...$this->members->oneVisibleTo($me, $memberId), 'passwordLinkToken' => $token, 'invitationEmailed' => true],
        );
    }
}
