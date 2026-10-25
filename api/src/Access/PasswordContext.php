<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Members\PersonalData;
use Doctrine\DBAL\Connection;

// What a new password is compared with, besides the most used passwords: the
// email of the member who chooses it and the name of the band
// (model/members.md, "passwordHash"). A password built from them is the first
// one someone who knows the member would try.
final class PasswordContext
{
    public function __construct(
        public readonly string $email,
        public readonly string $bandName,
    ) {
    }

    // For a member of the database: their email as it is saved.
    public static function ofMember(Connection $database, PersonalData $personal, int $memberId): self
    {
        $row = $database->fetchAssociative('SELECT email FROM member WHERE id = ?', [$memberId]);
        $email = $row === false ? null : $personal->opened($row)['email'];

        return self::withEmail($database, is_string($email) ? $email : '');
    }

    // For an email that is not saved yet: the one an invited member is sending.
    public static function withEmail(Connection $database, string $email): self
    {
        $bandName = $database->fetchOne('SELECT name FROM band WHERE id = 1');

        return new self($email, is_string($bandName) ? $bandName : '');
    }
}
