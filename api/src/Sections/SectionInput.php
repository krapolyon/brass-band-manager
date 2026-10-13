<?php

declare(strict_types=1);

namespace BrassBand\Sections;

final class SectionInput
{
    /**
     * @param int|null $position Place in the list of sections, 1 being the first. Left out: unchanged, or last for a new one
     * @param string|null $icon One of SectionIcons::AVAILABLE. Left out or null: the generic pictogram
     */
    public function __construct(
        public readonly string $name,
        public readonly ?int $position = null,
        public readonly ?string $icon = null,
    ) {
    }
}
