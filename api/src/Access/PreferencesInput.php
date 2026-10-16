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
        public readonly bool $hasHighContrast,
        public readonly bool $hasIncreasedSpacing,
        public readonly bool $hasLegibleFont,
        public readonly bool $hasReducedMotion,
        public readonly bool $hasExtendedTimeouts,
        // The text size is a setting of the device since 0.1.1 (model/members.md
        // v1.20): never read nor saved. Accepted and ignored, so that a page
        // left open on an older version is not refused; removed in 0.2.0.
        public readonly ?int $textSizePercent = null,
    ) {
    }
}
