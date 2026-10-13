<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

final class GigStatusInput
{
    public function __construct(public readonly GigStatus $status)
    {
    }
}
