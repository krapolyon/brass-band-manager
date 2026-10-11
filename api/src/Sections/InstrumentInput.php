<?php

declare(strict_types=1);

namespace BrassBand\Sections;

final class InstrumentInput
{
    /**
     * @param int|null $position Place in its section, 1 being the first. Left out: unchanged, or last for a new one or one that changes section
     */
    public function __construct(
        public readonly string $name,
        public readonly int $sectionId,
        public readonly ?int $position = null,
    ) {
    }
}
