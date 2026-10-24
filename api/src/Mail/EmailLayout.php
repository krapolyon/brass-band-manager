<?php

declare(strict_types=1);

namespace BrassBand\Mail;

// The template of every email the app sends (Figma, page Emails, issue #65):
// the ground of the band, Email/Header (the icon and the name of the band),
// one sheet that holds a title, one or two sentences, what the email is
// about as in the app (a gig, a song), one Primary button with its link
// written under it, then Email/Footer: why it was sent, the link to the
// notification settings for a notification, who sent it.
//
// Written for mail clients, not browsers: a table layout, inline styles, a
// button that is a link drawn with padding (it shows even where images are
// blocked), no halo and no glass, no image but the icon the app serves. The
// colours and sizes are those of tokens.css, through emailTheme.json. The
// typefaces of the app are offered by @font-face from the app; a client that
// refuses them takes the sans-serif of the system.
//
// Every value is escaped: names of gigs and songs are typed by members.
// The plain text version says the same, for clients that show no HTML.
final class EmailLayout
{
    private const WIDTH = 600;
    private const FONT_DISPLAY = "'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    private const FONT_TEXT = "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

    /**
     * @param array{
     *     subject: string,
     *     title: string,
     *     paragraphs?: list<string>,
     *     cards?: list<array<string, mixed>>,
     *     button: array{label: string, url: string},
     *     after?: list<string>,
     *     reason?: string|null,
     *     settingsUrl?: string|null,
     * } $email
     * @return array{subject: string, html: string, text: string}
     */
    public static function render(EmailBand $band, string $language, array $email): array
    {
        return [
            'subject' => $email['subject'],
            'html' => self::html($band, $language, $email),
            'text' => self::text($band, $language, $email),
        ];
    }

    /** @param array<string, mixed> $email */
    private static function html(EmailBand $band, string $language, array $email): string
    {
        $c = $band->colours;
        $s = $band->sizes;
        $e = static fn (string $text): string => htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $px = static fn (string $size): string => ((int) ($s[$size] ?? 0)) . 'px';
        $text = static fn (string $size, string $colour, string $weight = '400', string $lineHeight = '1.4', bool $display = false): string => 'margin:0;font-family:' . ($display ? self::FONT_DISPLAY : self::FONT_TEXT)
            . ';font-size:' . $px($size) . ';line-height:' . $lineHeight . ';font-weight:' . $weight . ';color:' . $colour . ';';

        $button = $email['button'];
        $buttonUrl = (string) $button['url'];

        // Email/Header: the icon of the band, or the accent with a note when
        // it has none (Band/Mention), and its name.
        $icon = $band->iconUrl !== null
            ? '<img src="' . $e($band->iconUrl) . '" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:' . $px('radiusSm') . ';">'
            : '<div style="width:40px;height:40px;line-height:40px;text-align:center;border-radius:' . $px('radiusSm') . ';background:' . $c['accent'] . ';color:' . $c['onAccent'] . ';font-size:22px;" aria-hidden="true">&#9835;</div>';
        $header = '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td style="padding:0 ' . $px('spaceSm') . ' 0 0;vertical-align:middle;">' . $icon . '</td>'
            . '<td style="vertical-align:middle;"><p style="' . $text('textSizeHeading', $c['text'], '700', '1.2', true) . '">' . $e($band->name) . '</p></td>'
            . '</tr></table>';

        $body = '<h1 style="' . $text('textSizeTitle', $c['text'], '700', '1.1', true) . '">' . $e((string) $email['title']) . '</h1>';
        foreach ($email['paragraphs'] ?? [] as $paragraph) {
            $body .= self::gap($px('spaceMd')) . '<p style="' . $text('textSizeBodyLarge', $c['text']) . '">' . nl2br($e($paragraph), false) . '</p>';
        }
        foreach ($email['cards'] ?? [] as $card) {
            $body .= self::gap($px('spaceMd')) . self::card($band, $card, $e, $px, $text);
        }
        // A bulletproof button: a link drawn by its padding, in a cell of the accent.
        $body .= self::gap($px('spaceMd'))
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td style="border-radius:999px;background:' . $c['accent'] . ';">'
            . '<a href="' . $e($buttonUrl) . '" style="display:inline-block;padding:16px ' . $px('spaceXl') . ';border-radius:999px;'
            . self::inline($text('textSizeButton', $c['onAccent'], '700', '1.25')) . 'text-decoration:none;">' . $e((string) $button['label']) . '</a>'
            . '</td></tr></table>';
        foreach ($email['after'] ?? [] as $paragraph) {
            $body .= self::gap($px('spaceMd')) . '<p style="' . $text('textSizeBodyLarge', $c['textMuted'], '400') . 'font-size:15px;">' . $e($paragraph) . '</p>';
        }
        // The link written under the button, for clients that block it.
        $body .= self::gap($px('spaceMd')) . '<p style="' . $text('textSizeCaption', $c['textMuted'], '500', '1.35') . '">'
            . $e(Emails::text('common.linkFallback', $language, ['link' => ''])) . '<a href="' . $e($buttonUrl) . '" style="color:' . $c['textMuted'] . ';word-break:break-all;">' . $e($buttonUrl) . '</a></p>';

        $card = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' . $c['sheet'] . ';border-radius:' . $px('radiusLg') . ';">'
            . '<tr><td style="padding:' . $px('spaceXxl') . ';">' . $body . '</td></tr></table>';

        // Email/Footer.
        $footer = '';
        $caption = $text('textSizeCaption', $c['textMuted'], '500', '1.35') . 'text-align:center;';
        if (($email['reason'] ?? null) !== null) {
            $footer .= '<p style="' . $caption . '">' . $e((string) $email['reason']) . '</p>';
        }
        if (($email['settingsUrl'] ?? null) !== null) {
            $footer .= self::gap($px('spaceXs')) . '<p style="' . $caption . '"><a href="' . $e((string) $email['settingsUrl']) . '" style="color:' . $c['accentText'] . ';text-decoration:underline;">'
                . $e(Emails::text('common.settings', $language)) . '</a></p>';
        }
        $footer .= ($footer === '' ? '' : self::gap($px('spaceXs'))) . '<p style="' . $caption . '">' . $e(Emails::text('common.sender', $language, ['band' => $band->name])) . '</p>';

        $fonts = '';
        foreach ([['Bricolage Grotesque', 'BricolageGrotesque', '200 800'], ['Instrument Sans', 'InstrumentSans', '400 700']] as [$family, $file, $weights]) {
            $fonts .= "@font-face{font-family:'{$family}';src:url('" . $e($band->appUrl . "/fonts/{$file}-latin.woff2") . "') format('woff2');font-weight:{$weights};font-style:normal;}";
        }

        return '<!doctype html><html lang="' . $e($language) . '"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1">'
            // Said dark already, so that a client that darkens emails leaves it as drawn.
            . '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
            . '<title>' . $e((string) $email['subject']) . '</title>'
            . '<style>' . $fonts . ':root{color-scheme:dark;}body{margin:0;padding:0;}a{color:inherit;}</style>'
            . '</head><body style="margin:0;padding:0;background:' . $c['ground'] . ';">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' . $c['ground'] . ';"><tr><td align="center">'
            . '<table role="presentation" width="' . self::WIDTH . '" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:' . self::WIDTH . 'px;">'
            . '<tr><td style="padding:' . $px('spaceXxl') . ' ' . $px('spaceXl') . ';">'
            . $header . self::gap($px('spaceXl')) . $card . self::gap($px('spaceXl')) . $footer
            . '</td></tr></table></td></tr></table></body></html>';
    }

    /**
     * A gig as Gig/Card shows it, or a song as Song/Tile with its name: what
     * the email is about. The cover of a song is not shown: it is served to
     * signed-in members only, so the tile is the placeholder of the app.
     *
     * @param array<string, mixed> $card
     * @param callable(string): string $e
     * @param callable(string): string $px
     * @param callable(string, string, string=, string=, bool=): string $text
     */
    private static function card(EmailBand $band, array $card, callable $e, callable $px, callable $text): string
    {
        $c = $band->colours;
        $chips = '';
        foreach (is_array($card['chips'] ?? null) ? $card['chips'] : [] as $chip) {
            [$background, $colour] = self::tone($c, (string) ($chip['tone'] ?? 'neutral'));
            $chips .= '<span style="display:inline-block;margin:' . $px('spaceXs') . ' ' . $px('spaceXs') . ' 0 0;padding:' . $px('spaceXxs') . ' ' . $px('spaceSm') . ';border-radius:999px;background:' . $background . ';'
                . self::inline($text('textSizeCaption', $colour, '500', '1.35')) . '">' . $e((string) ($chip['text'] ?? '')) . '</span>';
        }

        if (($card['kind'] ?? '') === 'song') {
            $tile = '<div style="width:44px;height:44px;line-height:44px;text-align:center;border-radius:' . $px('radiusSm') . ';background:' . $c['control'] . ';color:' . $c['textMuted'] . ';font-size:22px;" aria-hidden="true">&#9835;</div>';

            return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
                . '<td style="padding:0 ' . $px('spaceSm') . ' 0 0;vertical-align:top;">' . $tile . '</td>'
                . '<td style="vertical-align:top;"><p style="' . $text('textSizeCaption', $c['text'], '700', '1.35') . 'font-size:14px;">' . $e((string) ($card['name'] ?? '')) . '</p>'
                . '<p style="' . $text('textSizeCaption', $c['textMuted'], '500', '1.35') . 'font-size:14px;">' . $e((string) ($card['artist'] ?? '')) . '</p>'
                . $chips . '</td></tr></table>';
        }

        $banner = '';
        if (is_array($card['banner'] ?? null)) {
            [$background, $colour] = self::tone($c, (string) ($card['banner']['tone'] ?? 'neutral'));
            $banner = '<tr><td colspan="2" style="padding:0 0 ' . $px('spaceSm') . ' 0;"><p style="padding:' . $px('spaceXs') . ' ' . $px('spaceSm') . ';border-radius:' . $px('radiusSm') . ';background:' . $background . ';'
                . self::inline($text('textSizeCaption', $colour, '500', '1.35')) . '">' . $e((string) ($card['banner']['text'] ?? '')) . '</p></td></tr>';
        }
        $date = '<table role="presentation" width="64" cellpadding="0" cellspacing="0" border="0" style="width:64px;background:' . $c['control'] . ';border-radius:' . $px('radiusSm') . ';"><tr><td align="center" style="padding:' . $px('spaceXs') . ' ' . $px('spaceXxs') . ';">'
            . '<p style="' . $text('textSizeCaption', $c['textMuted'], '500', '1.35') . '">' . $e((string) ($card['weekday'] ?? '')) . '</p>'
            . '<p style="' . $text('textSizeHeading', $c['text'], '700', '1.2', true) . '">' . $e((string) ($card['day'] ?? '')) . '</p>'
            . '<p style="' . $text('textSizeCaption', $c['textMuted'], '500', '1.35') . '">' . $e((string) ($card['month'] ?? '')) . '</p>'
            . '</td></tr></table>';
        $lines = '<p style="' . $text('textSizeBodyLarge', $c['text']) . '">' . $e((string) ($card['name'] ?? '')) . '</p>';
        foreach (['place', 'meeting'] as $line) {
            if (is_string($card[$line] ?? null) && $card[$line] !== '') {
                $lines .= '<p style="' . $text('textSizeCaption', $c['textMuted'], '500', '1.35') . '">' . $e($card[$line]) . '</p>';
            }
        }

        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' . $banner
            . '<tr><td width="64" style="width:64px;padding:0 ' . $px('spaceSm') . ' 0 0;vertical-align:top;">' . $date . '</td>'
            . '<td style="vertical-align:top;">' . $lines . $chips . '</td></tr></table>';
    }

    /**
     * The background and the text of a chip or a banner (Chip in Figma).
     *
     * @param array<string, string> $c
     * @return array{string, string}
     */
    private static function tone(array $c, string $tone): array
    {
        return match ($tone) {
            'accent' => [$c['accent'], $c['onAccent']],
            'info' => [$c['infoSoft'], $c['info']],
            'success' => [$c['successSoft'], $c['success']],
            'warning' => [$c['warningSoft'], $c['warning']],
            default => [$c['control'], $c['text']],
        };
    }

    /** @param array<string, mixed> $email */
    private static function text(EmailBand $band, string $language, array $email): string
    {
        $lines = [$band->name, '', (string) $email['title'], ''];
        foreach ($email['paragraphs'] ?? [] as $paragraph) {
            $lines[] = $paragraph;
            $lines[] = '';
        }
        foreach ($email['cards'] ?? [] as $card) {
            if (($card['kind'] ?? '') === 'song') {
                $lines[] = $card['name'] . ' – ' . $card['artist'];
            } else {
                if (is_array($card['banner'] ?? null)) {
                    $lines[] = (string) $card['banner']['text'];
                }
                $lines[] = $card['weekday'] . ' ' . $card['day'] . ' ' . $card['month'] . ' – ' . $card['name'];
                foreach (['place', 'meeting'] as $line) {
                    if (is_string($card[$line] ?? null) && $card[$line] !== '') {
                        $lines[] = $card[$line];
                    }
                }
            }
            $chips = array_map(fn (array $chip) => (string) $chip['text'], is_array($card['chips'] ?? null) ? $card['chips'] : []);
            if ($chips !== []) {
                $lines[] = implode(' · ', $chips);
            }
            $lines[] = '';
        }
        $lines[] = $email['button']['label'] . "\u{00A0}: " . $email['button']['url'];
        $lines[] = '';
        foreach ($email['after'] ?? [] as $paragraph) {
            $lines[] = $paragraph;
            $lines[] = '';
        }
        $lines[] = '—';
        if (($email['reason'] ?? null) !== null) {
            $lines[] = (string) $email['reason'];
        }
        if (($email['settingsUrl'] ?? null) !== null) {
            $lines[] = Emails::text('common.settingsText', $language, ['link' => (string) $email['settingsUrl']]);
        }
        $lines[] = Emails::text('common.sender', $language, ['band' => $band->name]);

        return implode("\n", $lines) . "\n";
    }

    // Space between two blocks: a cell of that height, which every client keeps.
    private static function gap(string $height): string
    {
        return '<div style="height:' . $height . ';line-height:' . $height . ';font-size:1px;">&#8202;</div>';
    }

    // A style written for a block element, used on an inline one.
    private static function inline(string $style): string
    {
        return str_replace('margin:0;', '', $style);
    }
}
