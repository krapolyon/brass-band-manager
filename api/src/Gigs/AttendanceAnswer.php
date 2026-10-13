<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

// What a member answers for a slot, as in model/gigs.dbml. No answer is no
// row, not a value.
enum AttendanceAnswer: string
{
    case YES = 'YES';
    case NO = 'NO';
    case MAYBE = 'MAYBE';
    case IF_NEEDED = 'IF_NEEDED';
}
