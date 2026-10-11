<?php

declare(strict_types=1);

namespace BrassBand\Access;

use Doctrine\DBAL\Connection;

// Password links (memberPasswordLink table): a single-use address that lets a
// member choose a password. It serves for the invitation of a new member and
// for a forgotten password. Rules: model/members.md, entry 3.
//
// Like a session, a link is a random token of which the database only holds
// the SHA-256. The token is given once, to whoever creates the link, and is
// never found again.
final class PasswordLinks
{
    public function __construct(private readonly Connection $database)
    {
    }

    // Creates the link of a member and returns its token. A member has one
    // pending link at most: a new one cancels the previous one.
    public function create(int $memberId, ?int $byMemberId): string
    {
        $token = bin2hex(random_bytes(32));
        $this->cancel($memberId);
        $this->database->executeStatement(
            'INSERT INTO memberPasswordLink (memberId, tokenHash, expiresAt, updatedByMemberId)
             VALUES (?, ?, NOW() + INTERVAL ? DAY, ?)',
            [$memberId, self::hash($token), AccessRules::PASSWORD_LINK_DAYS, $byMemberId],
        );

        return $token;
    }

    public function cancel(int $memberId): void
    {
        $this->database->delete('memberPasswordLink', ['memberId' => $memberId]);
    }

    /**
     * The member a token lets choose a password, or null when the token opens
     * nothing: unknown, too old, or of a member who has left. Inside a
     * transaction, $lock holds the link until the end, so that it is used once.
     *
     * @return array{memberId: int, nickname: string, status: string}|null
     */
    public function find(string $token, bool $lock = false): ?array
    {
        // A token is 64 hexadecimal characters. Anything else is not looked up.
        if (preg_match('/\A[0-9a-f]{64}\z/', $token) !== 1) {
            return null;
        }

        $found = $this->database->fetchAssociative(
            'SELECT m.id AS memberId, m.nickname, m.status
             FROM memberPasswordLink l
             JOIN member m ON m.id = l.memberId
             WHERE l.tokenHash = ? AND l.expiresAt > NOW() AND m.status <> ?'
            . ($lock ? ' FOR UPDATE' : ''),
            [self::hash($token), 'LEFT'],
        );
        if ($found === false) {
            return null;
        }

        return [
            'memberId' => (int) $found['memberId'],
            'nickname' => (string) $found['nickname'],
            'status' => (string) $found['status'],
        ];
    }

    // Removes the links that can no longer be used.
    public function removeExpired(): void
    {
        $this->database->executeStatement('DELETE FROM memberPasswordLink WHERE expiresAt <= NOW()');
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
