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

// POST /api/members/{id}/invitation: "Renvoyer l'invitation" (0.4.0, issue
// #50; model/members.md, "Sending the invitation again"). Creates a new link
// for an invited member and sends it by email: the former link stops working.
// Asks for MANAGE_MEMBERS, and covers the access of the member like any link.
//
// Refused without a mail server (emailUnavailable), for a member who is not
// invited (notInvited), and within 5 minutes of the previous email
// (emailedRecently): nothing changes then, the former link included. The
// token is never in the answer: the email carries it.
final class SendInvitationAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
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
        if (!$this->invitations->canSend()) {
            throw new ApiError(409, 'emailUnavailable');
        }

        $token = $this->database->transactional(function () use ($me, $arguments): string {
            $target = $this->members->target((int) $arguments['id'], lock: true);
            if ($target['status'] !== 'INVITED') {
                throw new ApiError(409, 'notInvited');
            }
            Members::mustCover($me, $target);
            if ($this->links->wasEmailedRecently($target['id'])) {
                throw new ApiError(409, 'emailedRecently');
            }

            return $this->links->create($target['id'], $me->id, emailed: true, isInvitation: true);
        });
        $this->invitations->sendLater([(int) $arguments['id'] => $token]);

        return Json::write($response, $this->members->oneVisibleTo($me, (int) $arguments['id']));
    }
}
