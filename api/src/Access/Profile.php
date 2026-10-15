<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Members\PhotoStore;
use Doctrine\DBAL\Connection;

// What a member receives about themself: their own record, their preferences,
// and what they are allowed to do. Sent after sign-in and by GET /api/me.
//
// The columns are listed one by one on purpose: a column added to the member
// table is never sent to the front by accident, and the password hash and the
// sign-in counters are not in the list.
final class Profile
{
    private const BOOLEANS = [
        'hasHighContrast',
        'hasIncreasedSpacing',
        'hasLegibleFont',
        'hasReducedMotion',
        'hasExtendedTimeouts',
    ];

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function of(CurrentMember $member): array
    {
        $profile = $this->database->fetchAssociative(
            'SELECT id, nickname, firstName, lastName, email, mobilePhone,
                    streetAddress, postalCode, city, countryCode, addressInstructions, photoPath,
                    instrumentId, status, language, colorScheme, accentTheme,
                    hasHighContrast, hasIncreasedSpacing, hasLegibleFont, hasReducedMotion, hasExtendedTimeouts
             FROM member
             WHERE id = ?',
            [$member->id],
        );
        if ($profile === false) {
            // The member was deleted between the check of the session and now.
            throw new ApiError(401, 'notSignedIn');
        }

        foreach (self::BOOLEANS as $field) {
            $profile[$field] = (bool) $profile[$field];
        }
        $profile['photoUrl'] = PhotoStore::url((int) $profile['id'], $profile['photoPath']);
        unset($profile['photoPath']);
        $profile['roles'] = array_map(fn (Role $role) => $role->value, $member->roles);
        $profile['permissions'] = $member->permissions();

        return $profile;
    }
}
