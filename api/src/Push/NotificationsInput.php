<?php

declare(strict_types=1);

namespace BrassBand\Push;

// The six notification settings of an account, all at once: the screen that
// changes one sends them all, like the preferences.
final class NotificationsInput
{
    public function __construct(
        public readonly NotificationChannel $notifyGigPlayable,
        public readonly NotificationChannel $notifyGigConfirmed,
        public readonly NotificationChannel $notifyLiveSetlist,
        public readonly NotificationChannel $notifySongNew,
        public readonly NotificationChannel $notifySongScore,
        public readonly NotificationChannel $notifySongPart,
    ) {
    }

    /**
     * @return array<string, string> Column => value
     */
    public function columns(): array
    {
        $columns = [];
        foreach (NotificationSetting::cases() as $setting) {
            $columns[$setting->column()] = $this->{$setting->column()}->value;
        }

        return $columns;
    }
}
