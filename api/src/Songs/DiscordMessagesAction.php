<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Discord\Discord;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/songs/{id}/discord: the messages of the channel of a song that tag
// the section of the member who asks, the three latest, the latest first
// (model/songs.md, "Display"). For every signed-in member.
//
// The last 100 messages of the channel are read through the bot of the band
// and kept 10 minutes on the server (Discord). Without a bot, without a role
// for the section, without a channel, or when Discord does not answer, the
// answer is the same as for a channel where nothing tags the section: no
// message, and the screen shows the button alone. Nothing is ever an error.
final class DiscordMessagesAction
{
    // What the sheet of a song shows (model/songs.md, "Display").
    public const SHOWN = 3;

    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly Discord $discord,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $song = $this->songs->row((int) $arguments['id']);

        return Json::write($response, $this->read(CurrentMember::of($request), $song));
    }

    /**
     * @param array<string, mixed> $song
     * @return array{roleName: string|null, messages: list<array{id: string, author: string, postedAt: string, text: string, url: string}>}
     */
    private function read(CurrentMember $member, array $song): array
    {
        $nothing = ['roleName' => null, 'messages' => []];
        $serverId = DiscordLinks::bandServer($this->database);
        $channelId = is_string($song['discordChannelId']) ? $song['discordChannelId'] : null;
        $roleId = $this->database->fetchOne(
            'SELECT c.discordRoleId FROM member m JOIN instrument i ON i.id = m.instrumentId JOIN section c ON c.id = i.sectionId WHERE m.id = ?',
            [$member->id],
        );
        if ($serverId === null || $channelId === null || !is_string($roleId) || !$this->discord->hasBot()) {
            return $nothing;
        }

        $roleNames = [];
        foreach ($this->discord->roles($serverId) ?? [] as $role) {
            $roleNames[$role['id']] = $role['name'];
        }
        $roleName = $roleNames[$roleId] ?? null;
        $messages = $this->discord->messages($channelId);
        if ($messages === null) {
            return ['roleName' => $roleName, 'messages' => []];
        }

        $shown = [];
        foreach ($messages as $message) {
            if (!in_array($roleId, $message['mentionRoles'], true)) {
                continue;
            }
            $shown[] = [
                'id' => $message['id'],
                // The name the author shows on Discord: shown, never stored.
                'author' => $message['author'],
                'postedAt' => $message['postedAt'],
                'text' => Discord::readable($message['content'], $roleNames, $message['mentions']),
                'url' => DiscordLinks::messageUrl($serverId, $channelId, $message['id']),
            ];
            if (count($shown) === self::SHOWN) {
                break;
            }
        }

        return ['roleName' => $roleName, 'messages' => $shown];
    }
}
