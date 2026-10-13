<?php

declare(strict_types=1);

namespace BrassBand\Members;

final class RolesInput
{
    /**
     * @param list<string> $roles Every role the member holds from now on
     */
    public function __construct(
        public readonly array $roles,
    ) {
    }
}
