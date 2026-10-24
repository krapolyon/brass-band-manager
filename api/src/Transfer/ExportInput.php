<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// What the screen "Exporter" sends: the parts ticked, and the password of the
// admin, asked again (model/export-import.md, "Who, and how").
final class ExportInput
{
    /**
     * @param list<string> $parts
     */
    public function __construct(
        public readonly string $password,
        public readonly array $parts,
    ) {
    }
}
