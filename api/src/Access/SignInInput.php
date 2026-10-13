<?php

declare(strict_types=1);

namespace BrassBand\Access;

final class SignInInput
{
    public function __construct(
        public readonly string $email,
        #[\SensitiveParameter]
        public readonly string $password,
    ) {
    }
}
