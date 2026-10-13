<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Members\MemberInput;
use BrassBand\Members\MemberRecord;
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
    //
    // A link created by a member manager, who sends it himself, lasts 7 days.
    // A link the app sends by email ($emailed) lasts one hour.
    public function create(int $memberId, ?int $byMemberId, bool $emailed = false): string
    {
        $token = bin2hex(random_bytes(32));
        $this->cancel($memberId);
        $this->database->executeStatement(
            'INSERT INTO memberPasswordLink (memberId, tokenHash, expiresAt, emailedAt, updatedByMemberId)
             VALUES (?, ?, NOW() + INTERVAL ? MINUTE, IF(?, NOW(), NULL), ?)',
            [
                $memberId,
                self::hash($token),
                $emailed ? AccessRules::EMAILED_LINK_MINUTES : AccessRules::PASSWORD_LINK_DAYS * 24 * 60,
                (int) $emailed,
                $byMemberId,
            ],
        );

        return $token;
    }

    // Whether the app sent a link to this member by email in the last
    // minutes: no new email is sent that soon.
    public function wasEmailedRecently(int $memberId): bool
    {
        return (int) $this->database->fetchOne(
            'SELECT COUNT(*) FROM memberPasswordLink
             WHERE memberId = ? AND emailedAt > NOW() - INTERVAL ? MINUTE',
            [$memberId, AccessRules::EMAIL_INTERVAL_MINUTES],
        ) > 0;
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

    /**
     * Checks the record an invited member sends with their link. A refusal
     * tells whoever holds the link that a nickname or an email is taken, so
     * these refusals are counted: at the limit the link is cancelled, and a
     * member manager has to create another.
     *
     * @return array<string, int|string|null> Column => value
     */
    public function checkRecord(MemberRecord $record, MemberInput $input, int $memberId): array
    {
        try {
            return $record->check($input, $memberId);
        } catch (ApiError $refusal) {
            if (in_array('duplicate', $refusal->fields, true)) {
                $this->database->executeStatement(
                    'UPDATE memberPasswordLink SET refusedCount = refusedCount + 1 WHERE memberId = ?',
                    [$memberId],
                );
                $this->database->executeStatement(
                    'DELETE FROM memberPasswordLink WHERE memberId = ? AND refusedCount >= ?',
                    [$memberId, AccessRules::INVITATION_MAX_REFUSALS],
                );
            }
            throw $refusal;
        }
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
