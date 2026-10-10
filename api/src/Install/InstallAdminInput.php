<?php

declare(strict_types=1);

namespace BrassBand\Install;

final class InstallAdminInput
{
    public function __construct(
        public readonly string $email,
        #[\SensitiveParameter]
        public readonly string $password,
        public readonly string $lastName,
        public readonly string $firstName,
        public readonly string $nickname,
        // Name of one of the instruments sent in the sections.
        public readonly string $instrument,
    ) {
    }
}
