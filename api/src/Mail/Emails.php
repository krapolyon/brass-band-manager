<?php

declare(strict_types=1);

namespace BrassBand\Mail;

use BrassBand\Install\Languages;

// The texts of the emails, one file per language
// (api/resources/emails.<language>.json). Everything else the app says is
// translated by the front; an email is the one text the server writes.
final class Emails
{
    /** @var array<string, array<mixed>> The files read, by language */
    private static array $files = [];

    /**
     * A text of an email, in a language, with its values filled in. The key
     * is a path in the file ("gig.status.ACCEPTED"). With a count, the key
     * takes "_one" or "_other", as the translations of the front do.
     *
     * @param array<string, string|int> $values What replaces each {name} of the text
     */
    public static function text(string $key, string $language, array $values = [], ?int $count = null): string
    {
        if ($count !== null) {
            $key .= $count === 1 ? '_one' : '_other';
            $values['count'] = $count;
        }
        $found = self::file($language);
        foreach (explode('.', $key) as $part) {
            $found = is_array($found) ? ($found[$part] ?? null) : null;
        }
        $text = is_string($found) ? $found : '';
        foreach ($values as $name => $value) {
            $text = str_replace('{' . $name . '}', (string) $value, $text);
        }

        return $text;
    }

    /** Whether the file of a language has a text at this key. */
    public static function has(string $key, string $language): bool
    {
        return self::text($key, $language) !== '';
    }

    /** @return array<mixed> */
    private static function file(string $language): array
    {
        // The file name is built from a value of Languages::AVAILABLE, never from what was sent.
        $language = Languages::isAvailable($language) ? $language : Languages::DEFAULT;
        if (!isset(self::$files[$language])) {
            $file = __DIR__ . "/../../resources/emails.{$language}.json";
            self::$files[$language] = (array) json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
        }

        return self::$files[$language];
    }
}
