<?php

declare(strict_types=1);

namespace BrassBand\Install;

final class InstallKeyInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $installKey,
    ) {
    }
}
