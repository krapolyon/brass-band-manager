<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

// The statuses of a gig, as in model/gigs.dbml, and which one can follow
// which by hand (model/gigs.md, "Life cycle"). "In progress" and "past" are
// not statuses: the screen reads them from the dates.
enum GigStatus: string
{
    case DRAFT = 'DRAFT';
    case PROPOSED = 'PROPOSED';
    case ACCEPTED = 'ACCEPTED';
    case CONFIRMED = 'CONFIRMED';
    case CANCELLED = 'CANCELLED';

    // The statuses in which members answer.
    public const OPEN = ['PROPOSED', 'ACCEPTED', 'CONFIRMED'];

    /**
     * @return list<self> The statuses this one can be changed to by hand
     */
    public function next(): array
    {
        return match ($this) {
            self::DRAFT => [self::PROPOSED, self::CANCELLED],
            // CONFIRMED from PROPOSED is the gig forced without a quote.
            self::PROPOSED => [self::ACCEPTED, self::CONFIRMED, self::CANCELLED],
            self::ACCEPTED => [self::CONFIRMED, self::CANCELLED],
            // Put back by hand, for a confirmation made by mistake (model/gigs.md,
            // "Put back by hand").
            self::CONFIRMED => [self::ACCEPTED, self::PROPOSED, self::CANCELLED],
            // A cancelled gig is reopened.
            self::CANCELLED => [self::DRAFT, self::PROPOSED],
        };
    }
}
