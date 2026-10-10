<?php

declare(strict_types=1);

namespace BrassBand\Band;

final class UpdateBandInput
{
    public function __construct(
        public readonly string $name,
    ) {
    }
}
