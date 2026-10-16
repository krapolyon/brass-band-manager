<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The accessibility options of a member's account (model/members.md,
// "Accessibility options"), as an invited member sends them with the rest of
// their account. Five of the six: the text size stays on the device.
final class AccessibilityInput
{
    public function __construct(
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
            'hasHighContrast' => (int) $this->hasHighContrast,
            'hasIncreasedSpacing' => (int) $this->hasIncreasedSpacing,
            'hasLegibleFont' => (int) $this->hasLegibleFont,
            'hasReducedMotion' => (int) $this->hasReducedMotion,
            'hasExtendedTimeouts' => (int) $this->hasExtendedTimeouts,
        ];
    }
}
