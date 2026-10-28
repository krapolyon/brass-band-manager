<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Http\ApiError;

// The install key: a text written in the configuration of the server
// (api/config.php, "installKey") by the person who put the app online, and
// asked again by the install screen. Only someone who can read the files of
// the server knows it, so only they can install the app and become its admin.
//
// Guessing it leads nowhere:
//   - a key shorter than MIN_LENGTH is treated as no key at all, and install
//     stays closed until a real one is written;
//   - wrong keys are counted per visitor (RequestLimit, in routes.php).
final class InstallKey
{
    public const MIN_LENGTH = 16;

    public function __construct(#[\SensitiveParameter] private readonly string $key)
    {
    }

    // Refuses with 403 unless the given text is the install key. A server
    // that has no key answers like a wrong key (model/members.md): the screen
    // sends the person to the configuration of the server in both cases.
    public function check(#[\SensitiveParameter] string $given): void
    {
        $isSet = strlen($this->key) >= self::MIN_LENGTH;

        if (!$isSet || !hash_equals($this->key, $given)) {
            throw new ApiError(403, 'invalidInstallKey');
        }
    }
}
