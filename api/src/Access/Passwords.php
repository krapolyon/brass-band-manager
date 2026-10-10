<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\FieldErrors;

// Everything about passwords: the rule a new one must follow, and the hashing,
// which is PHP's own (password_hash, password_verify). A password is never
// stored, logged or sent back; only its hash is kept.
final class Passwords
{
    // Checks a password a member is choosing. The only rule is its length.
    public static function check(FieldErrors $errors, string $field, string $password): void
    {
        if (str_contains($password, "\0")) {
            // The hashing function of PHP refuses this character.
            $errors->add($field, 'invalid');
        } elseif (mb_strlen($password) < AccessRules::PASSWORD_MIN_CHARACTERS) {
            $errors->add($field, 'tooShort');
        } elseif (strlen($password) > AccessRules::PASSWORD_MAX_BYTES) {
            $errors->add($field, 'tooLong');
        }
    }

    public static function hash(#[\SensitiveParameter] string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    public static function matches(#[\SensitiveParameter] string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    // True when PHP's recommended hashing has become stronger since this hash
    // was made: the password is then hashed again at the next sign-in.
    public static function isOutdated(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_DEFAULT);
    }

    // Spends the time a real check would take. Used when there is nothing to
    // check against, so that the answer to an unknown email is not faster
    // than the answer to a wrong password.
    //
    // It runs the same function as a real check, against the hash of a random
    // text nobody knows, so that it also behaves the same on any input.
    public static function spendTime(#[\SensitiveParameter] string $password): void
    {
        password_verify($password, self::NOBODY);
    }

    // True when a text cannot be the password of anyone, because no password
    // this long is accepted when one is chosen.
    public static function isTooLong(#[\SensitiveParameter] string $password): bool
    {
        return strlen($password) > AccessRules::PASSWORD_MAX_BYTES;
    }

    // Made with password_hash(), at the cost PHP 8.4 uses by default. If that
    // cost changes one day, make a new one so that spendTime() stays as slow
    // as a real check.
    private const NOBODY = '$2y$12$OiQv8Wbopx8e7WbJXif2OuksVXP.gCTjm58BL3W4oeWvSCVnWl/KK';
}
