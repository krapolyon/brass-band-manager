<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class SetlistInput
{
    /**
     * @param list<int> $songIds The songs in the order they are played; a song can come twice
     * @param int|null $gigSlotId One of the slots of the gig. Left out: the only slot of the gig
     */
    public function __construct(
        public readonly array $songIds,
        public readonly ?int $gigSlotId = null,
        public readonly ?string $description = null,
    ) {
    }
}
