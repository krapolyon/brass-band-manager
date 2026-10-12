<?php

declare(strict_types=1);

namespace BrassBand\Access;

use Doctrine\DBAL\Connection;

// The count of wrong passwords of a member, and the lock it leads to
// (model/members.md, "Wrong passwords"). One count for every place where a
// password is tried: signing in, and changing one's password.
final class SignInFailures
{
    public function __construct(private readonly Connection $database)
    {
    }

    // One more wrong password. At the limit, sign-in is locked for a while and
    // the count starts again from zero. Returns true when this try locked it.
    public function count(int $memberId): bool
    {
        // MySQL applies the assignments from left to right, each one seeing the
        // result of the previous: the lock is decided on the count before it changes.
        $this->database->executeStatement(
            'UPDATE member
             SET signInLockedUntil = IF(failedSignInCount + 1 >= ?, NOW() + INTERVAL ? MINUTE, signInLockedUntil),
                 failedSignInCount = IF(failedSignInCount + 1 >= ?, 0, failedSignInCount + 1)
             WHERE id = ?',
            [
                AccessRules::SIGN_IN_MAX_FAILURES,
                AccessRules::SIGN_IN_LOCK_MINUTES,
                AccessRules::SIGN_IN_MAX_FAILURES,
                $memberId,
            ],
        );

        return $this->isLocked($memberId);
    }

    public function isLocked(int $memberId): bool
    {
        return (bool) $this->database->fetchOne(
            'SELECT signInLockedUntil IS NOT NULL AND signInLockedUntil > NOW() FROM member WHERE id = ?',
            [$memberId],
        );
    }
}
