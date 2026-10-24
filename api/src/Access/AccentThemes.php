<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The accent themes a member can choose: the modes of the "Theme" collection
// of the design, in lowercase.
//
// This list exists in three places that must agree: here, web/src/themes.ts
// and the blocks of web/src/styles/tokens.css.
final class AccentThemes
{
    public const AVAILABLE = ['brass', 'tangerine', 'raspberry', 'orchid', 'cornflower', 'azure', 'lagoon', 'emerald', 'lime', 'ivory'];
}
