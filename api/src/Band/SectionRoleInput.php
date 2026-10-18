<?php

declare(strict_types=1);

namespace BrassBand\Band;

// The Discord role of one section, chosen among the roles of the server.
final class SectionRoleInput
{
    public function __construct(
        public readonly int $sectionId,
        public readonly ?string $discordRoleId = null,
    ) {
    }
}
