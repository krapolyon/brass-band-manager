<?php

declare(strict_types=1);

namespace BrassBand\Songs;

final class SongStatusInput
{
    public function __construct(public readonly SongStatus $status)
    {
    }
}
