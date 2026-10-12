<?php

declare(strict_types=1);

namespace BrassBand\Band;

final class UpdateBandInput
{
    /**
     * What is left out, or null, is not changed.
     */
    public function __construct(
        public readonly ?string $name = null,
        public readonly ?string $defaultAccentTheme = null,
        public readonly ?string $defaultLanguage = null,
        public readonly ?string $defaultCountryCode = null,
    ) {
    }
}
