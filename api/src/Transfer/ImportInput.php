<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// What the screen "Importer" sends once the admin confirms: the zip, the parts
// ticked, whether the invitations leave by email (#50), and the password of
// the admin, asked again.
final class ImportInput
{
    /**
     * @param list<string> $parts
     */
    public function __construct(
        public readonly string $name,
        public readonly string $password,
        public readonly array $parts,
        public readonly bool $sendInvitations = true,
    ) {
    }
}
