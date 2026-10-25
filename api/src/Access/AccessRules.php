<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The numbers behind the access rules of model/members.md, in one place.
// They are fixed in the code for now; the model plans to make them settings
// of the band if a band needs different ones.
final class AccessRules
{
    // A session ends after this long without being used...
    public const SESSION_IDLE_DAYS = 90;
    // ...and in any case this long after sign-in.
    public const SESSION_MAX_DAYS = 365;
    // The "last used" instant of a session is not rewritten more often than this.
    public const SESSION_TOUCH_MINUTES = 5;

    // After this many wrong passwords in a row, sign-in is refused for a while.
    public const SIGN_IN_MAX_FAILURES = 5;
    public const SIGN_IN_LOCK_MINUTES = 15;

    public const PASSWORD_MIN_CHARACTERS = 10;
    // The hashing function of PHP ignores what comes after 72 bytes: a longer
    // password is refused rather than silently cut.
    public const PASSWORD_MAX_BYTES = 72;

    // A password link created by a member manager can be used this long.
    public const PASSWORD_LINK_DAYS = 7;
    // A link the app sends by email, for a forgotten password, lasts this long...
    public const EMAILED_LINK_MINUTES = 60;
    // ...and no new email is sent to the same member before this long.
    public const EMAIL_INTERVAL_MINUTES = 5;

    // An invitation whose record was refused this many times because a
    // nickname or an email is taken is cancelled: its link says what is taken.
    public const INVITATION_MAX_REFUSALS = 10;

    // The statuses of a member who can sign in ("current member" in the model).
    public const SIGN_IN_STATUSES = ['ACTIVE', 'POWER_MEMBER'];
    // The same list, as an SQL "status IN (...)" reads it. Keep the two in step.
    public const SIGN_IN_STATUSES_SQL = "'ACTIVE', 'POWER_MEMBER'";
}
