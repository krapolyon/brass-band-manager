<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class LiveInput
{
    /**
     * @param int $position The position of the song being played, 1 being the first
     */
    public function __construct(public readonly int $position)
    {
    }
}
