<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// The two levels a member gives a song, sent together. Null: not said.
final class LevelsInput
{
    public function __construct(
        public readonly ?int $masteryLevel = null,
        public readonly ?int $enjoymentLevel = null,
    ) {
    }
}
