<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\AccessRules;
use BrassBand\Access\CurrentMember;
use BrassBand\Access\Permission;
use BrassBand\Access\Role;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;

// What the actions on members share: who sees whom, what a member looks like
// in an answer, and the rules that protect accounts. Rules: model/members.md.
final class Members
{
    // What is sent about a member: the directory of the band. The columns are
    // listed one by one on purpose: the password hash, the sign-in counters
    // and the preferences are not here, and a column added to the table is
    // never sent by accident.
    private const COLUMNS = 'id, nickname, firstName, lastName, email, mobilePhone, streetAddress,
        postalCode, city, countryCode, addressInstructions, instrumentId, status, photoPath';

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * The members a viewer may see, by nickname. Every signed-in member sees
     * the current members; who manages members also sees the invited ones and
     * those who left.
     *
     * @return list<array<string, mixed>>
     */
    public function visibleTo(CurrentMember $viewer): array
    {
        $members = $this->database->fetchAllAssociative(
            'SELECT ' . self::COLUMNS . ' FROM member WHERE ' . self::visibility($viewer) . ' ORDER BY nickname',
        );

        return array_map(fn (array $member) => $this->view($viewer, $member), $members);
    }

    /**
     * One member, as a viewer may see them. 404 when the viewer may not: a
     * member who is hidden and a member who does not exist look the same.
     *
     * @return array<string, mixed>
     */
    public function oneVisibleTo(CurrentMember $viewer, int $memberId): array
    {
        $member = $this->database->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM member WHERE id = ? AND ' . self::visibility($viewer),
            [$memberId],
        );
        if ($member === false) {
            throw new ApiError(404, 'notFound');
        }

        return $this->view($viewer, $member);
    }

    /**
     * What an action needs to know about the member it acts on. 404 when
     * there is no such member. Inside a transaction, $lock holds the row
     * until the end.
     *
     * @return array{id: int, status: string, email: string, photoPath: ?string, roles: list<Role>}
     */
    public function target(int $memberId, bool $lock = false): array
    {
        $member = $this->database->fetchAssociative(
            'SELECT id, status, email, photoPath FROM member WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''),
            [$memberId],
        );
        if ($member === false) {
            throw new ApiError(404, 'notFound');
        }

        return [
            'id' => (int) $member['id'],
            'status' => (string) $member['status'],
            'email' => (string) $member['email'],
            'photoPath' => is_string($member['photoPath']) ? $member['photoPath'] : null,
            'roles' => $this->roles($memberId),
        ];
    }

    /**
     * @return list<Role>
     */
    public function roles(int $memberId): array
    {
        $roles = $this->database->fetchFirstColumn('SELECT role FROM memberRole WHERE memberId = ? ORDER BY role', [$memberId]);

        return array_map(fn (string $role) => Role::from($role), $roles);
    }

    /**
     * Refuses to let someone act on the access of a member who may do more
     * than they do: their email, their password link, their status. Without
     * this, who manages members could send themself the password link of an
     * admin and become one.
     *
     * @param array{id: int, roles: list<Role>} $target
     */
    public static function mustCover(CurrentMember $actor, array $target): void
    {
        if ($target['id'] !== $actor->id && !$actor->covers($target['roles'])) {
            throw new ApiError(403, 'forbidden');
        }
    }

    /**
     * The current members who hold the admin role, their rows held until the
     * end of the transaction: the rule "always one admin" is then judged on
     * a count nobody else is changing.
     *
     * @return list<int>
     */
    public function lockCurrentAdmins(): array
    {
        $ids = $this->database->fetchFirstColumn(
            'SELECT m.id
             FROM member m
             JOIN memberRole r ON r.memberId = m.id
             WHERE r.role = ? AND m.status IN (?, ?)
             FOR UPDATE',
            [Role::ADMIN->value, ...AccessRules::SIGN_IN_STATUSES],
        );

        return array_map(intval(...), $ids);
    }

    // The SQL condition that keeps the members a viewer may see.
    private static function visibility(CurrentMember $viewer): string
    {
        return $viewer->can(Permission::MANAGE_MEMBERS) ? '1 = 1' : "status IN ('ACTIVE', 'POWER_MEMBER')";
    }

    /**
     * @param array<string, mixed> $member A row with COLUMNS
     * @return array<string, mixed>
     */
    private function view(CurrentMember $viewer, array $member): array
    {
        $id = (int) $member['id'];
        $member['photoUrl'] = PhotoStore::url($id, $member['photoPath']);
        unset($member['photoPath']);
        $member['roles'] = array_map(fn (Role $role) => $role->value, $this->roles($id));

        // Whether a password link is waiting, and until when (in UTC): for who
        // manages members only. A link that has expired counts as none.
        if ($viewer->can(Permission::MANAGE_MEMBERS)) {
            $expiresAt = $this->database->fetchOne(
                "SELECT DATE_FORMAT(expiresAt, '%Y-%m-%dT%H:%i:%sZ') FROM memberPasswordLink WHERE memberId = ? AND expiresAt > NOW()",
                [$id],
            );
            $member['hasPendingPasswordLink'] = is_string($expiresAt);
            $member['passwordLinkExpiresAt'] = is_string($expiresAt) ? $expiresAt : null;
        }

        return $member;
    }
}
