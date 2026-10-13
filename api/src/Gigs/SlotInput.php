<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class SlotInput
{
    /**
     * @param string|null $name Required as soon as the gig has several slots
     * @param int|null $costumeId One of the costumes of the gig
     * @param int|null $position Place among the slots of the gig, 1 being the first. Left out: unchanged, or last for a new one
     */
    public function __construct(
        public readonly ?string $name = null,
        public readonly ?string $note = null,
        public readonly ?int $costumeId = null,
        public readonly ?int $position = null,
    ) {
    }
}
