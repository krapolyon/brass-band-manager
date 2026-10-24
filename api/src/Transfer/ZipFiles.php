<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

// Reads a file of a zip to import without trusting the size it claims. A zip
// of 250 MB can hold a file of several gigabytes once unpacked: read whole,
// it would stop PHP. Each file is read only when the zip says it fits, and
// never beyond its limit.
final class ZipFiles
{
    /** A table of a reprise, or the data of a part of an export. */
    public const DATA_MAX_BYTES = 20_000_000;
    /** Any other file: the largest a song may have (SongFiles::MAX_BYTES). */
    public const FILE_MAX_BYTES = 10_000_000;

    /** Whether the zip holds this file and it is larger than $maxBytes. */
    public static function isTooBig(\ZipArchive $zip, string $name, int $maxBytes): bool
    {
        $stat = $zip->statName($name);

        return $stat !== false && (int) $stat['size'] > $maxBytes;
    }

    /**
     * The content of a file of the zip; null when it is not there or when it
     * is larger than $maxBytes.
     */
    public static function read(\ZipArchive $zip, string $name, int $maxBytes): ?string
    {
        if ($zip->statName($name) === false || self::isTooBig($zip, $name, $maxBytes)) {
            return null;
        }
        // The size of the directory can lie: never more than the limit is unpacked.
        $content = $zip->getFromName($name, $maxBytes + 1);

        return $content === false || strlen($content) > $maxBytes ? null : $content;
    }
}
