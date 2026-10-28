<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// The outline of a recording, computed by the browser that sends it: how loud
// each slice of the recording is, from 0 to 100.
final class PeaksInput
{
    /**
     * @param list<int> $peaks
     * @param string $version The version of the recording they were computed from: the "v" of its address
     */
    public function __construct(
        public readonly array $peaks,
        public readonly string $version,
    ) {
    }
}
