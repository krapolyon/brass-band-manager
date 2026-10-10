<?php

declare(strict_types=1);

namespace BrassBand\Install;

// What the install screen sends, in one piece, at its last step.
// Nothing is saved before: an abandoned install leaves an empty database.
final class InstallInput
{
    /**
     * @param list<InstallSectionInput> $sections In the order they will be listed
     */
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $installKey,
        public readonly string $language,
        public readonly string $bandName,
        public readonly array $sections,
        public readonly InstallAdminInput $admin,
    ) {
    }
}
