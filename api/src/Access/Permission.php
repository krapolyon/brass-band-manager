<?php

declare(strict_types=1);

namespace BrassBand\Access;

// What a member may be allowed to do beyond viewing and answering for gigs.
// A route that changes something asks for one of these, through
// RequirePermission (see routes.php).
//
// THE TABLE BELOW IS THE ONLY PLACE THAT SAYS WHICH ROLES GRANT WHAT.
// It mirrors "Roles and permissions" in model/members.md: change both together.
//
// The values are sent to the front, which uses them to show or hide actions.
// Hiding is a comfort: the check that counts is the one made here, on the server.
enum Permission: string
{
    case MANAGE_MEMBERS = 'manageMembers';
    case MANAGE_ROLES = 'manageRoles';
    case MANAGE_SECTIONS = 'manageSections';
    case MANAGE_BAND = 'manageBand';
    case MANAGE_SONGS = 'manageSongs';
    case MANAGE_GIGS = 'manageGigs';
    case MANAGE_COSTUMES = 'manageCostumes';
    case MANAGE_SETLISTS = 'manageSetlists';
    case MANAGE_QUOTES = 'manageQuotes';
    case RUN_MIGRATIONS = 'runMigrations';

    /**
     * The roles that grant this permission. ADMIN grants every one of them
     * and is therefore not repeated on each line.
     *
     * @return list<Role>
     */
    private function grantedBy(): array
    {
        return match ($this) {
            self::MANAGE_MEMBERS => [Role::MEMBER_MANAGER],
            self::MANAGE_ROLES => [],
            self::MANAGE_SECTIONS => [],
            self::MANAGE_BAND => [],
            self::MANAGE_SONGS => [Role::SONG_MANAGER],
            self::MANAGE_GIGS => [Role::GIG_MANAGER],
            self::MANAGE_COSTUMES => [],
            self::MANAGE_SETLISTS => [Role::SETLIST_MANAGER],
            self::MANAGE_QUOTES => [Role::QUOTE_MANAGER],
            self::RUN_MIGRATIONS => [],
        };
    }

    /**
     * @param list<Role> $roles The roles a member holds
     */
    public function isGrantedTo(array $roles): bool
    {
        if (in_array(Role::ADMIN, $roles, true)) {
            return true;
        }

        foreach ($this->grantedBy() as $role) {
            if (in_array($role, $roles, true)) {
                return true;
            }
        }

        return false;
    }
}
