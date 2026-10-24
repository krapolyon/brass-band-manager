<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// A zip of the folder "import" to read: its name, and the parts to read, all
// of them when left out.
final class ReadInput
{
    /**
     * @param list<string>|null $parts
     */
    public function __construct(
        public readonly string $name,
        public readonly ?array $parts = null,
    ) {
    }
}
