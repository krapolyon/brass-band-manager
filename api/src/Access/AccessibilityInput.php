<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The six accessibility options of a member (model/members.md,
// "Accessibility options"), as an invited member sends them with the rest of
// their account.
final class AccessibilityInput
{
    // The six steps of the design (Figma: the modes of the TextSize collection).
    public const TEXT_SIZES = [100, 120, 140, 160, 180, 200];

    public function __construct(
        public readonly int $textSizePercent,
        public readonly bool $hasHighContrast,
        public readonly bool $hasIncreasedSpacing,
        public readonly bool $hasLegibleFont,
        public readonly bool $hasReducedMotion,
        public readonly bool $hasExtendedTimeouts,
    ) {
    }

    /**
     * @return array<string, int> Column => value
     */
    public function columns(): array
    {
        return [
            'textSizePercent' => $this->textSizePercent,
            'hasHighContrast' => (int) $this->hasHighContrast,
            'hasIncreasedSpacing' => (int) $this->hasIncreasedSpacing,
            'hasLegibleFont' => (int) $this->hasLegibleFont,
            'hasReducedMotion' => (int) $this->hasReducedMotion,
            'hasExtendedTimeouts' => (int) $this->hasExtendedTimeouts,
        ];
    }
}
