<?php

declare(strict_types=1);

namespace BrassBand\Push;

// How a member is told of one kind of event (model/members.md, enum
// notificationChannel). EMAIL will come later: the values stay open.
enum NotificationChannel: string
{
    case OFF = 'OFF';
    case PUSH = 'PUSH';
}
