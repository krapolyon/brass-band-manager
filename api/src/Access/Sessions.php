<?php

declare(strict_types=1);

namespace BrassBand\Access;

use Doctrine\DBAL\Connection;

// The signed-in devices of members (memberSession table).
//
// A device holds a random token in its cookie. The database only holds the
// SHA-256 of that token: someone who reads the database cannot sign in with
// what they find there.
final class Sessions
{
    public function __construct(private readonly Connection $database)
    {
    }

    // Signs a device in, and returns who is now signed in together with the
    // token to give to the device.
    /**
     * @return array{CurrentMember, string}
     */
    public function signIn(int $memberId): array
    {
        $token = $this->open($memberId);

        return [$this->find($token) ?? throw new \LogicException('A session that was just opened cannot be found.'), $token];
    }

    private function open(int $memberId): string
    {
        $token = bin2hex(random_bytes(32));

        $this->database->executeStatement(
            'INSERT INTO memberSession (memberId, tokenHash, lastUsedAt, expiresAt, updatedByMemberId)
             VALUES (?, ?, NOW(), NOW() + INTERVAL ? DAY, ?)',
            [$memberId, self::hash($token), AccessRules::SESSION_MAX_DAYS, $memberId],
        );

        return $token;
    }

    // The member behind a token, or null when the token opens nothing: unknown,
    // too old, unused for too long, or belonging to a member who can no longer
    // sign in.
    public function find(string $token): ?CurrentMember
    {
        // A token is 64 hexadecimal characters. Anything else is not looked up.
        if (preg_match('/\A[0-9a-f]{64}\z/', $token) !== 1) {
            return null;
        }

        $session = $this->database->fetchAssociative(
            'SELECT s.id AS sessionId, s.memberId, s.lastUsedAt < NOW() - INTERVAL ? MINUTE AS isStale
             FROM memberSession s
             JOIN member m ON m.id = s.memberId
             WHERE s.tokenHash = ?
               AND s.expiresAt > NOW()
               AND s.lastUsedAt > NOW() - INTERVAL ? DAY
               AND m.status IN (?, ?)',
            [
                AccessRules::SESSION_TOUCH_MINUTES,
                self::hash($token),
                AccessRules::SESSION_IDLE_DAYS,
                ...AccessRules::SIGN_IN_STATUSES,
            ],
        );
        if ($session === false) {
            return null;
        }

        if ((bool) $session['isStale']) {
            $this->database->executeStatement(
                'UPDATE memberSession SET lastUsedAt = NOW() WHERE id = ?',
                [$session['sessionId']],
            );
        }

        $roles = $this->database->fetchFirstColumn(
            'SELECT role FROM memberRole WHERE memberId = ?',
            [$session['memberId']],
        );

        return new CurrentMember(
            (int) $session['memberId'],
            (int) $session['sessionId'],
            array_map(fn (string $role) => Role::from($role), $roles),
        );
    }

    // Signs one device out.
    public function close(int $sessionId): void
    {
        $this->database->delete('memberSession', ['id' => $sessionId]);
    }

    // Signs every device of a member out.
    public function closeAll(int $memberId): void
    {
        $this->database->delete('memberSession', ['memberId' => $memberId]);
    }

    // Removes the sessions that can no longer be used. Called at each sign-in,
    // which is enough to keep the table small without a scheduled task.
    public function removeExpired(): void
    {
        $this->database->executeStatement(
            'DELETE FROM memberSession WHERE expiresAt <= NOW() OR lastUsedAt <= NOW() - INTERVAL ? DAY',
            [AccessRules::SESSION_IDLE_DAYS],
        );
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
