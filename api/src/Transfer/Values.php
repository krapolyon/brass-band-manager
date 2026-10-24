<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Install\Languages;
use BrassBand\Songs\FileNames;

// How a cell of a reprise is read (model/export-import.md, "Rules for every
// CSV file"): a value of a list by its code or by its label in the app, case
// and accents ignored; dates, times and durations in the ways a spreadsheet
// writes them; several values in one cell separated by "|".
final class Values
{
    /** @var array<string, array<mixed>> */
    private static array $files = [];

    /**
     * The values of a list of the model, code => label, in the language of
     * the band (api/resources/transfer.<language>.json).
     *
     * @return array<string, string>
     */
    public static function list(string $name, string $language): array
    {
        $lists = self::file($language)['lists'] ?? [];
        $list = is_array($lists) ? ($lists[$name] ?? []) : [];

        return is_array($list) ? array_map(strval(...), $list) : [];
    }

    /**
     * The made-up example rows of a template.
     *
     * @return list<list<string>>
     */
    public static function examples(string $name, string $language): array
    {
        $examples = self::file($language)['examples'] ?? [];
        $rows = is_array($examples) ? ($examples[$name] ?? []) : [];

        return is_array($rows) ? array_values(array_map(fn ($row) => array_values(array_map(strval(...), (array) $row)), $rows)) : [];
    }

    /**
     * The code a cell names, among code => label; null when it names none.
     *
     * @param array<string, string> $list
     */
    public static function code(string $cell, array $list): ?string
    {
        $wanted = self::plain($cell);
        foreach ($list as $code => $label) {
            if ($wanted === self::plain((string) $code) || $wanted === self::plain($label)) {
                return (string) $code;
            }
        }

        return null;
    }

    /**
     * The values of a cell that holds several, separated by "|".
     *
     * @return list<string>
     */
    public static function several(string $cell): array
    {
        return array_values(array_filter(array_map('trim', explode('|', $cell)), fn (string $one) => $one !== ''));
    }

    // Lowercase, without accents, its words only: how names are compared,
    // the way the names of files are read (FileNames::words).
    public static function plain(string $text): string
    {
        return implode(' ', FileNames::words($text));
    }

    /** A day written YYYY-MM-DD or DD/MM/YYYY, as YYYY-MM-DD; null when it is neither, or no real day. */
    public static function day(string $cell): ?string
    {
        $cell = trim($cell);
        if (preg_match('#\A(\d{1,2})/(\d{1,2})/(\d{4})\z#', $cell, $found) === 1) {
            $cell = sprintf('%04d-%02d-%02d', $found[3], $found[2], $found[1]);
        }
        $day = \DateTimeImmutable::createFromFormat('!Y-m-d', $cell, new \DateTimeZone('UTC'));

        return $day !== false && $day->format('Y-m-d') === $cell ? $cell : null;
    }

    /** A time written HH:MM (or H:MM, or HH:MM:SS from a spreadsheet), as HH:MM; null otherwise. */
    public static function time(string $cell): ?string
    {
        if (preg_match('/\A([01]?\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?\z/', trim($cell), $found) !== 1) {
            return null;
        }

        return sprintf('%02d:%s', $found[1], $found[2]);
    }

    /** A length in seconds, written as seconds or m:ss; null otherwise. */
    public static function seconds(string $cell): ?int
    {
        $cell = trim($cell);
        if (preg_match('/\A\d{1,4}\z/', $cell) === 1) {
            return (int) $cell;
        }
        if (preg_match('/\A(\d{1,2}):([0-5]\d)\z/', $cell, $found) === 1) {
            return (int) $found[1] * 60 + (int) $found[2];
        }

        return null;
    }

    /** A whole number; null otherwise. */
    public static function integer(string $cell): ?int
    {
        return preg_match('/\A-?\d{1,9}\z/', trim($cell)) === 1 ? (int) trim($cell) : null;
    }

    /** A decimal number, with a point or a comma; null otherwise. */
    public static function decimal(string $cell): ?float
    {
        $cell = str_replace(',', '.', trim($cell));

        return is_numeric($cell) ? (float) $cell : null;
    }

    /** @return array<mixed> */
    private static function file(string $language): array
    {
        // The file name is built from a value of Languages::AVAILABLE, never from what was sent.
        $language = Languages::isAvailable($language) ? $language : Languages::DEFAULT;
        if (!isset(self::$files[$language])) {
            $file = __DIR__ . "/../../resources/transfer.{$language}.json";
            self::$files[$language] = (array) json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
        }

        return self::$files[$language];
    }
}
