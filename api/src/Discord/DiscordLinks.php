<?php

declare(strict_types=1);

namespace BrassBand\Discord;

use BrassBand\Http\FieldErrors;
use Doctrine\DBAL\Connection;

// The links of Discord: reading the one a member pastes, writing the ones the
// app shows. Rules: model/band.md, "Discord", and the field discordChannelId
// of model/songs.md and model/gigs.md.
//
// A member pastes what Discord copies ("Copier le lien du salon"):
//
//   https://discord.com/channels/1000312294715883560/1000359811281600622
//                                <server>            <channel>
//
// or the identifier alone. The app keeps the identifiers, never the link.
final class DiscordLinks
{
    // What Discord calls a snowflake: digits only.
    public const ID = '/\A[0-9]{17,20}\z/';

    // The hosts Discord copies its links from: the app, its test builds, and
    // the older domain.
    private const HOSTS = ['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com'];

    /**
     * The channel of a song or a gig, from what was typed in its form: the
     * identifier to save, or null for none. A link of another server than the
     * one of the band is refused (otherServer); so is any channel while the
     * band has no server (model/songs.md, "Instance settings"). The channel
     * the object already has is kept as it is, whatever the server: a form
     * sends back what it was given.
     */
    public static function channelField(FieldErrors $errors, string $field, ?string $typed, ?string $bandServerId, ?string $current): ?string
    {
        $typed = trim($typed ?? '');
        if ($typed === '') {
            return null;
        }
        if ($current !== null && $typed === $current) {
            return $current;
        }
        $read = self::read($typed, alone: 'channel');
        if ($read === null || $read['channelId'] === null || $bandServerId === null) {
            $errors->add($field, 'invalid');
            return null;
        }
        if ($read['serverId'] !== null && $read['serverId'] !== $bandServerId) {
            $errors->add($field, 'otherServer');
            return null;
        }

        return $read['channelId'];
    }

    // The server of the band, or null for a band without Discord.
    public static function bandServer(Connection $database): ?string
    {
        $serverId = $database->fetchOne('SELECT discordServerId FROM band WHERE id = 1');

        return is_string($serverId) && $serverId !== '' ? $serverId : null;
    }


    /**
     * What a pasted text names: a server, and a channel when the link has
     * one. Null when the text is neither a link of Discord nor an identifier.
     * An identifier alone is a channel when $alone is 'channel', a server
     * when it is 'server'.
     *
     * @param 'channel'|'server' $alone
     * @return array{serverId: string|null, channelId: string|null}|null
     */
    public static function read(string $text, string $alone): ?array
    {
        $text = trim($text);
        if (preg_match(self::ID, $text) === 1) {
            return $alone === 'channel'
                ? ['serverId' => null, 'channelId' => $text]
                : ['serverId' => $text, 'channelId' => null];
        }

        $parts = parse_url($text);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || !in_array(strtolower($parts['host'] ?? ''), self::HOSTS, true)) {
            return null;
        }
        // /channels/<server>, /channels/<server>/<channel>, or the link of a
        // message, /channels/<server>/<channel>/<message>.
        if (preg_match('#\A/channels/([0-9]{17,20})(?:/([0-9]{17,20})(?:/[0-9]{17,20})?)?/?\z#', $parts['path'] ?? '', $found) !== 1) {
            return null;
        }

        return ['serverId' => $found[1], 'channelId' => ($found[2] ?? '') === '' ? null : $found[2]];
    }

    // The link that opens a channel: in the app of a phone that has it, in
    // the browser otherwise.
    public static function channelUrl(string $serverId, string $channelId): string
    {
        return "https://discord.com/channels/{$serverId}/{$channelId}";
    }

    public static function messageUrl(string $serverId, string $channelId, string $messageId): string
    {
        return "https://discord.com/channels/{$serverId}/{$channelId}/{$messageId}";
    }
}
