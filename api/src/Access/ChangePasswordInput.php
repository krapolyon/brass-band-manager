<?php

declare(strict_types=1);

namespace BrassBand\Access;

final class ChangePasswordInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $currentPassword,
        #[\SensitiveParameter]
        public readonly string $newPassword,
    ) {
    }
}
