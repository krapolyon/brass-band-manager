<?php

declare(strict_types=1);

namespace BrassBand\Http;

// Tidies a one-line text typed by a member before it is checked and saved:
// removes invisible control characters, and the spaces of any kind at both
// ends (including the non-breaking space, which PHP's trim() leaves in place).
//
// FieldErrors checks the cleaned text; save the cleaned text too:
//
//   $name = Text::clean($input->name);
final class Text
{
    public static function clean(string $text): string
    {
        $text = preg_replace('/\p{C}+/u', '', $text) ?? '';

        return preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', $text) ?? '';
    }
}
