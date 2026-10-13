<?php

declare(strict_types=1);

namespace BrassBand\Band;

// The reminders of gigs, all three at once: a number of days left out or null
// means that this reminder is not sent.
final class GigRemindersInput
{
    public function __construct(
        public readonly int $gigReminderHour,
        public readonly ?int $gigFirstReminderDays = null,
        public readonly ?int $gigSecondReminderDays = null,
    ) {
    }
}
