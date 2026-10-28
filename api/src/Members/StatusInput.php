<?php

declare(strict_types=1);

namespace BrassBand\Members;

final class StatusInput
{
    public function __construct(
        public readonly string $status,
    ) {
    }
}
