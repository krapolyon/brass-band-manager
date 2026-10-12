<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Members\MemberRecord;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/passwordLink/validate: says whether the record an invited member
// has checked and completed would be accepted, and saves nothing. The first
// step of an invitation asks this before going to the password, so that a
// nickname already taken is said where it is typed.
//
// Public: whoever holds the link of an invitation. It tells them what the
// record form tells any member: that a nickname or an email is taken. These
// refusals are counted, and too many cancel the link (PasswordLinks).
final class ValidateInvitationAction
{
    public function __construct(
        private readonly PasswordLinks $links,
        private readonly MemberRecord $record,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ValidateInvitationInput::class);

        $link = $this->links->find($input->token);
        if ($link === null) {
            throw new ApiError(404, 'invalidPasswordLink');
        }
        if ($link['status'] !== 'INVITED') {
            throw new ApiError(409, 'notInvited');
        }
        $this->links->checkRecord($this->record, $input->member, $link['memberId']);

        return Json::write($response, ['valid' => true]);
    }
}
