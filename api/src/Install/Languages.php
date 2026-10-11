<?php

declare(strict_types=1);

namespace BrassBand\Install;

// The languages the app is shipped in. Adding one here goes with its
// translation file in the front (web/src/locales/) and its starting library
// of instruments (api/resources/instrumentLibrary.<language>.json).
final class Languages
{
    public const AVAILABLE = ['fr'];
    public const DEFAULT = 'fr';

    // The country a band installed in a language starts with (model/band.md, "Country").
    public const COUNTRIES = ['fr' => 'FR'];

    public static function isAvailable(string $language): bool
    {
        return in_array($language, self::AVAILABLE, true);
    }

    /**
     * The starting library of sections and instruments offered at install.
     *
     * @return array<mixed>
     */
    public static function instrumentLibrary(string $language): array
    {
        // The file name is built from a value of AVAILABLE, never from what was sent.
        $language = self::isAvailable($language) ? $language : self::DEFAULT;
        $file = __DIR__ . "/../../resources/instrumentLibrary.{$language}.json";

        return (array) json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    }
}
