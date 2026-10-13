<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class CostumeInput
{
    /**
     * @param int|null $position Place in the list of costumes, 1 being the first. Left out: unchanged, or last for a new one
     */
    public function __construct(
        public readonly string $name,
        public readonly ?int $position = null,
    ) {
    }
}
