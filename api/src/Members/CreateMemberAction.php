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

// POST /api/members: invites a new member. Asks for MANAGE_MEMBERS.
//
// The member is created INVITED, with no password, and their password link is
// created with them. Its token is in the answer, this once and never again:
// whoever invites sends the link by the means of their choice.
final class CreateMemberAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly MemberRecord $record,
        private readonly PasswordLinks $links,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $input = Input::from($request, MemberInput::class);
        $values = $this->record->check($input, null);

        try {
            [$memberId, $token] = $this->database->transactional(function () use ($values, $me): array {
                $this->database->insert('member', [
                    ...$values,
                    'status' => 'INVITED',
                    'language' => $this->database->fetchOne('SELECT defaultLanguage FROM band WHERE id = 1'),
                    'updatedByMemberId' => $me->id,
                ]);
                $memberId = (int) $this->database->lastInsertId();

                return [$memberId, $this->links->create($memberId, $me->id)];
            });
        } catch (UniqueConstraintViolationException) {
            // Taken between the check and the save, by a request sent at the
            // same instant: the check now says which field.
            $this->record->check($input, null);
            throw new ApiError(422, 'invalidInput', ['nickname' => 'duplicate']);
        }

        return Json::write(
            $response,
            [...$this->members->oneVisibleTo($me, $memberId), 'passwordLinkToken' => $token],
            201,
        );
    }
}
