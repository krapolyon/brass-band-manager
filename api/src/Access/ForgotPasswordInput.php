<?php

declare(strict_types=1);

namespace BrassBand\Access;

final class ForgotPasswordInput
{
    public function __construct(
        public readonly string $email,
    ) {
    }
}
