<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Http\ApiError;

// The install key: a text written in the configuration of the server
// (api/config.php, "installKey") by the person who put the app online, and
// asked again by the install screen. Only someone who can read the files of
// the server knows it, so only they can install the app and become its admin.
//
// Guessing it is made pointless rather than counted:
//   - a key shorter than MIN_LENGTH is treated as no key at all, and install
//     stays closed until a real one is written;
//   - each wrong key costs a second.
// At that length and that pace, trying keys leads nowhere, and the app does
// not need to remember who tried.
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
            sleep(1);
            throw new ApiError(403, 'invalidInstallKey');
        }
    }
}
