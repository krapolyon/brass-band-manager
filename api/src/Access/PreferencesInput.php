<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The preferences of a member, all at once: the screen that changes one
// sends them all.
final class PreferencesInput
{
    public function __construct(
        public readonly string $language,
        public readonly string $colorScheme,
        public readonly ?string $accentTheme,
        public readonly int $textSizePercent,
        public readonly bool $hasHighContrast,
        public readonly bool $hasIncreasedSpacing,
        public readonly bool $hasLegibleFont,
        public readonly bool $hasReducedMotion,
        public readonly bool $hasExtendedTimeouts,
    ) {
    }
}
