<?php

declare(strict_types=1);

namespace BrassBand\Mail;

use BrassBand\Access\AccentThemes;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;

// What every email shows of the band (Figma, page Emails, Email/Header and
// Email/Footer): its name, its icon, and the colours of its default accent
// theme in the Dark scheme, never the theme a member chose: an email cannot
// know the device it is read on (issue #65).
final class EmailBand
{
    /**
     * @param array<string, string> $colours The Dark colours of the theme, from api/resources/emailTheme.json
     * @param array<string, int|float> $sizes The sizes of the design, in pixels
     */
    public function __construct(
        public readonly string $name,
        public readonly ?string $iconUrl,
        public readonly array $colours,
        public readonly array $sizes,
        public readonly string $appUrl,
    ) {
    }

    public static function of(Connection $database, Mailer $mailer): self
    {
        // SELECT *: read by the forgotten password, which must work on a
        // database not updated yet.
        $band = $database->fetchAssociative('SELECT * FROM band WHERE id = 1') ?: [];
        $theme = is_string($band['defaultAccentTheme'] ?? null) ? $band['defaultAccentTheme'] : '';

        // The square icon of the band, an image every mail client shows (a
        // logo can be an SVG, which Gmail does not). The address carries its
        // version, as in the app. Without an icon or a logo, none.
        $icon = is_string($band['iconPath'] ?? null) ? $band['iconPath'] : null;
        $logo = is_string($band['logoPath'] ?? null) ? $band['logoPath'] : null;
        $version = Files::version($icon) ?? Files::version($logo);

        return self::themed(
            is_string($band['name'] ?? null) ? $band['name'] : '',
            $version === null ? null : $mailer->url("/api/band/icon/192?v={$version}"),
            $theme,
            $mailer->url(''),
        );
    }

    /** The band with the colours of a theme; the first theme when this one is not shipped. */
    public static function themed(string $name, ?string $iconUrl, string $theme, string $appUrl): self
    {
        $file = (array) json_decode(
            (string) file_get_contents(__DIR__ . '/../../resources/emailTheme.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        $themes = is_array($file['themes'] ?? null) ? $file['themes'] : [];
        $colours = $themes[in_array($theme, AccentThemes::AVAILABLE, true) ? $theme : AccentThemes::AVAILABLE[0]] ?? [];

        return new self(
            $name,
            $iconUrl,
            array_map(fn (mixed $value) => (string) $value, is_array($colours) ? $colours : []),
            array_map(fn (mixed $value) => is_int($value) || is_float($value) ? $value : 0, is_array($file['sizes'] ?? null) ? $file['sizes'] : []),
            $appUrl,
        );
    }
}
