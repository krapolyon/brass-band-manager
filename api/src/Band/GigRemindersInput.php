<?php

declare(strict_types=1);

namespace BrassBand\Band;

// The settings of the screen "Plans et setlists", all at once: the reminders
// of gigs (a number of days left out or null means that this reminder is not
// sent) and the time counted between two songs of a setlist.
final class GigRemindersInput
{
    public function __construct(
        public readonly int $gigReminderHour,
        public readonly int $setlistGapSeconds,
        public readonly ?int $gigFirstReminderDays = null,
        public readonly ?int $gigSecondReminderDays = null,
    ) {
    }
}
