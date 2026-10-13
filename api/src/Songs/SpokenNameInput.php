<?php

declare(strict_types=1);

namespace BrassBand\Songs;

final class SpokenNameInput
{
    /**
     * @param string $phrase The phrase as it was heard or typed
     * @param bool $moves Added by hand: take it from the song that has it, once the member said yes
     */
    public function __construct(
        public readonly string $phrase,
        public readonly bool $moves = false,
    ) {
    }
}
