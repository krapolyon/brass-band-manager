<?php

declare(strict_types=1);

namespace BrassBand\Songs;

final class FileNamesInput
{
    /**
     * @param list<string> $names The names of the files dropped, as they are on the device; or the names of the tracks of a MIDI file
     */
    public function __construct(public readonly array $names)
    {
    }
}
