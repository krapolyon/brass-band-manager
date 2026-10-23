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
// both the app and the section of the member who asks, all of them, the
// latest first, without the tag of the app (model/songs.md, "Display", issue
// #45). For every signed-in member.
//
// The last 100 messages of the channel are read through the bot of the band
// and kept 10 minutes on the server (Discord). Without a bot, without a role
// for the section, without a channel, or when Discord does not say who the
// app is or does not give the roles or the messages, nothing is known: no
// role is named and no message given, and the screen shows the button alone,
// without saying that nobody tagged the section. Nothing is ever an error.
final class DiscordMessagesAction
{
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

        // A role the server no longer has tags nobody.
        $roleName = null;
        foreach ($this->discord->roles($serverId) ?? [] as $role) {
            if ($role['id'] === $roleId) {
                $roleName = $role['name'];
            }
        }
        $messages = $roleName === null ? null : $this->discord->messagesForApp($serverId, $channelId, $roleId);

        return $roleName === null || $messages === null ? $nothing : ['roleName' => $roleName, 'messages' => $messages];
    }
}
