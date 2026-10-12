<?php

declare(strict_types=1);

namespace BrassBand\Sections;

// The pictograms a section can take: those drawn in the design system
// (Figma: Icon/Trumpet, Icon/Saxophone…), in lowercase. A section without one
// shows the generic pictogram.
//
// This list exists in two places that must agree: here and
// web/src/components/pictograms.ts.
final class SectionIcons
{
    public const AVAILABLE = ['trumpet', 'saxophone', 'trombone', 'tuba', 'sousaphone', 'drum', 'flute', 'clarinet'];

    public static function exists(string $icon): bool
    {
        return in_array($icon, self::AVAILABLE, true);
    }
}
