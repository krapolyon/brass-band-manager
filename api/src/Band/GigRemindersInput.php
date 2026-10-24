<?php

declare(strict_types=1);

namespace BrassBand\Band;

// The settings of the screen "Plans et setlists", all at once: the reminders
// of gigs (a number of days left out or null means that this reminder is not
// sent), the time counted between two songs of a setlist, and the length of
// a setlist the generator proposes first (0.4.0, issue #60).
final class GigRemindersInput
{
    public function __construct(
        public readonly int $gigReminderHour,
        public readonly int $setlistGapSeconds,
        public readonly int $setlistTargetMinutes,
        public readonly ?int $gigFirstReminderDays = null,
        public readonly ?int $gigSecondReminderDays = null,
    ) {
    }
}
