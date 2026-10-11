<?php

declare(strict_types=1);

namespace BrassBand\Access;

final class UsePasswordLinkInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $token,
        #[\SensitiveParameter]
        public readonly string $password,
    ) {
    }
}
