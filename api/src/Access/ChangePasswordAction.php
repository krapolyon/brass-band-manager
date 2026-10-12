<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/me/password: the signed-in member changes their password. Asks for
// the current one: a device left signed in is not enough to take the account.
// Every other device of the member is signed out (model/members.md).
//
// A wrong current password counts like a wrong password at sign-in. At the
// limit, sign-in is locked and this device is signed out: a device left
// signed in cannot be used to guess the password either.
final class ChangePasswordAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sessions $sessions,
        private readonly PasswordLinks $links,
        private readonly SignInFailures $failures,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ChangePasswordInput::class);
        $me = CurrentMember::of($request);

        $errors = $this->database->transactional(function () use ($input, $me): FieldErrors {
            $errors = new FieldErrors();
            $member = $this->database->fetchAssociative(
                'SELECT passwordHash, signInLockedUntil IS NOT NULL AND signInLockedUntil > NOW() AS isLocked
                 FROM member WHERE id = ? FOR UPDATE',
                [$me->id],
            );

            // While sign-in is locked, even the right password is refused.
            $isRight = $member !== false
                && !(bool) $member['isLocked']
                && is_string($member['passwordHash'])
                && !Passwords::isTooLong($input->currentPassword)
                && Passwords::matches($input->currentPassword, $member['passwordHash']);
            if (!$isRight) {
                $errors->add('currentPassword', 'invalid');
                if ($member !== false && !(bool) $member['isLocked'] && $this->failures->count($me->id)) {
                    $this->sessions->close($me->sessionId);
                }

                return $errors;
            }

            Passwords::check($errors, 'newPassword', $input->newPassword);
            if ($errors->isEmpty()) {
                $this->database->update(
                    'member',
                    [
                        'passwordHash' => Passwords::hash($input->newPassword),
                        'failedSignInCount' => 0,
                        'updatedByMemberId' => $me->id,
                    ],
                    ['id' => $me->id],
                );
                $this->database->executeStatement(
                    'DELETE FROM memberSession WHERE memberId = ? AND id <> ?',
                    [$me->id, $me->sessionId],
                );
                // A link asked for a forgotten password has no use left.
                $this->links->cancel($me->id);
            }

            return $errors;
        });
        // Refused once the count of wrong passwords is saved, not before.
        $errors->throwIfAny();

        return Json::write($response, ['changed' => true]);
    }
}
