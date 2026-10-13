<?php

declare(strict_types=1);

namespace BrassBand\Songs;

final class AliasInput
{
    /**
     * @param string $alias The spelling as it was typed, or the name of a file without its extension
     * @param string|null $songName The name of the song the file belongs to: its words are not part of the spelling
     */
    public function __construct(
        public readonly string $alias,
        public readonly ?string $songName = null,
    ) {
    }
}
