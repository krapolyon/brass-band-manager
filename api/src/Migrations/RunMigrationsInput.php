<?php

declare(strict_types=1);

namespace BrassBand\Migrations;

final class RunMigrationsInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $password,
    ) {
    }
}
