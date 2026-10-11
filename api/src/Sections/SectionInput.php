<?php

declare(strict_types=1);

namespace BrassBand\Sections;

final class SectionInput
{
    /**
     * @param int|null $position Place in the list of sections, 1 being the first. Left out: unchanged, or last for a new one
     */
    public function __construct(
        public readonly string $name,
        public readonly ?int $position = null,
    ) {
    }
}
