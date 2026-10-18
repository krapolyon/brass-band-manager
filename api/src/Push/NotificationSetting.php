<?php

declare(strict_types=1);

namespace BrassBand\Push;

// The notification settings of an account (model/members.md, "Notification
// settings"): one column of member each, holding a NotificationChannel. What
// a member receives, and how, belongs to the account; whether a device
// receives belongs to the device (pushSubscription).
enum NotificationSetting: string
{
    case GIG_REMINDER = 'notifyGigReminder';
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

    // The reminders to answer are never off: a band needs the answers. The
    // live setlist is never sent by email: it would arrive too late for the
    // next song. The database checks both too.
    public function allows(NotificationChannel $channel): bool
    {
        return match ($this) {
            self::GIG_REMINDER => $channel !== NotificationChannel::OFF,
            self::LIVE_SETLIST => !$channel->hasEmail(),
            default => true,
        };
    }
}
