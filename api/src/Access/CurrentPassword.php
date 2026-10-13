<?php

declare(strict_types=1);

namespace BrassBand\Access;

use Doctrine\DBAL\Connection;

// The password of the signed-in member, asked again before something a device
// left signed in must not be enough for: changing the password, applying the
// migrations.
//
// A wrong one counts like a wrong password at sign-in (SignInFailures). At
// the limit, sign-in is locked and this device is signed out: a device left
// signed in cannot be used to guess the password either.
final class CurrentPassword
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sessions $sessions,
        private readonly SignInFailures $failures,
    ) {
    }

    // Tries are judged one at a time for a member: the row is held while one
    // is judged. Called inside a transaction, it holds the row until that
    // transaction ends.
    public function isRight(CurrentMember $me, #[\SensitiveParameter] string $password): bool
    {
        return $this->database->transactional(function () use ($me, $password): bool {
            $member = $this->database->fetchAssociative(
                'SELECT passwordHash, signInLockedUntil IS NOT NULL AND signInLockedUntil > NOW() AS isLocked
                 FROM member WHERE id = ? FOR UPDATE',
                [$me->id],
            );

            // While sign-in is locked, even the right password is refused.
            $isRight = $member !== false
                && !(bool) $member['isLocked']
                && is_string($member['passwordHash'])
                && !Passwords::isTooLong($password)
                && Passwords::matches($password, $member['passwordHash']);
            if (!$isRight && $member !== false && !(bool) $member['isLocked'] && $this->failures->count($me->id)) {
                $this->sessions->close($me->sessionId);
            }

            return $isRight;
        });
    }
}
