<?php

declare(strict_types=1);

namespace BrassBand\Push;

// The notification settings of an account (model/members.md, "Notification
// settings"): one column of member each, holding a NotificationChannel. What
// a member receives belongs to the account; whether a device receives
// belongs to the device (pushSubscription). The reminders to answer for a gig
// are not a setting: they are always sent.
enum NotificationSetting: string
{
    case GIG_PLAYABLE = 'notifyGigPlayable';
    case GIG_CONFIRMED = 'notifyGigConfirmed';
    case LIVE_SETLIST = 'notifyLiveSetlist';
    case SONG_NEW = 'notifySongNew';
    case SONG_SCORE = 'notifySongScore';
    case SONG_PART = 'notifySongPart';

    /** The column of member, which is also the name of the field in the API. */
    public function column(): string
    {
        return $this->value;
    }
}
