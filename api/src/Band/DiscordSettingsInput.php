<?php

declare(strict_types=1);

namespace BrassBand\Band;

// The screen "Discord" of the band settings, sent whole: the link of a
// channel of the server (or its identifier), empty for a band without
// Discord, and the role of each section, null for a section not tagged.
final class DiscordSettingsInput
{
    /**
     * @param list<SectionRoleInput> $sectionRoles
     */
    public function __construct(
        public readonly ?string $link = null,
        public readonly array $sectionRoles = [],
    ) {
    }
}
