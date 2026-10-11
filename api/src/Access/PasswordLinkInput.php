<?php

declare(strict_types=1);

namespace BrassBand\Access;

final class PasswordLinkInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $token,
    ) {
    }
}
