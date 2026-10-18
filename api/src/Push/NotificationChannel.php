<?php

declare(strict_types=1);

namespace BrassBand\Push;

// How a member is told of one kind of event (model/members.md, enum
// notificationChannel; issue #27). Not every value is allowed for every
// setting: NotificationSetting::allows() says which.
enum NotificationChannel: string
{
    case OFF = 'OFF';
    case PUSH = 'PUSH';
    case EMAIL = 'EMAIL';
    case PUSH_AND_EMAIL = 'PUSH_AND_EMAIL';

    public function hasPush(): bool
    {
        return $this === self::PUSH || $this === self::PUSH_AND_EMAIL;
    }

    public function hasEmail(): bool
    {
        return $this === self::EMAIL || $this === self::PUSH_AND_EMAIL;
    }
}
