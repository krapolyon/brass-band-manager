<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Install\Languages;

// The texts of the notifications, one file per language
// (api/resources/push.<language>.json). A notification is drawn by the phone
// while the app is closed: like an email, it is a text the server writes.
final class PushTexts
{
    /**
     * A text in a language, with its values filled in.
     *
     * @param array<string, string|int> $values What replaces each {name} of the text
     */
    public static function text(string $key, string $language, array $values = []): string
    {
        // The file name is built from a value of Languages::AVAILABLE, never from what was sent.
        $language = Languages::isAvailable($language) ? $language : Languages::DEFAULT;
        $file = __DIR__ . "/../../resources/push.{$language}.json";
        $texts = (array) json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
        $text = is_string($texts[$key] ?? null) ? $texts[$key] : '';
        foreach ($values as $name => $value) {
            $text = str_replace('{' . $name . '}', (string) $value, $text);
        }

        return $text;
    }
}
