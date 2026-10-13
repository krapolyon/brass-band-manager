<?php

declare(strict_types=1);

namespace BrassBand\Mail;

use BrassBand\Install\Languages;

// The texts of the emails, one file per language
// (api/resources/emails.<language>.json). Everything else the app says is
// translated by the front; an email is the one text the server writes.
final class Emails
{
    /**
     * The subject and the body of an email, in a language, with its values filled in.
     *
     * @param array<string, string> $values What replaces each {name} of the text
     * @return array{subject: string, body: string}
     */
    public static function text(string $email, string $language, array $values): array
    {
        // The file name is built from a value of Languages::AVAILABLE, never from what was sent.
        $language = Languages::isAvailable($language) ? $language : Languages::DEFAULT;
        $file = __DIR__ . "/../../resources/emails.{$language}.json";
        $texts = (array) json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
        $text = is_array($texts[$email] ?? null) ? $texts[$email] : [];

        $fill = static function (mixed $template) use ($values): string {
            $filled = is_string($template) ? $template : '';
            foreach ($values as $name => $value) {
                $filled = str_replace('{' . $name . '}', $value, $filled);
            }

            return $filled;
        };

        return ['subject' => $fill($text['subject'] ?? ''), 'body' => $fill($text['body'] ?? '')];
    }
}
