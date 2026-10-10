<?php

declare(strict_types=1);

namespace BrassBand\Install;

final class InstallSectionInput
{
    /**
     * @param list<string> $instruments In the order they will be listed
     */
    public function __construct(
        public readonly string $name,
        public readonly array $instruments,
    ) {
    }
}
