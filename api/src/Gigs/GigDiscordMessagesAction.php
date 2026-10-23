<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Discord\Discord;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/gigs/{id}/discord: the messages of the channel of a gig that tag
// the app, all of them, the latest first, without the tag of the app
// (model/gigs.md, "Discord on a gig", issue #45). For every member who sees
// the gig: a draft is not found by who cannot edit it, as everywhere.
//
// Read as for a song (Songs\DiscordMessagesAction): the last 100 messages,
// kept 10 minutes on the server, never in the database. Without a bot, a
// channel or a server, or when Discord does not answer, no message: the card
// shows its sentence and its button. Nothing is ever an error.
final class GigDiscordMessagesAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly Discord $discord,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $gig = $this->gigs->rowVisibleTo(CurrentMember::of($request), (int) $arguments['id']);
        $serverId = DiscordLinks::bandServer($this->database);
        $channelId = is_string($gig['discordChannelId']) ? $gig['discordChannelId'] : null;
        $messages = $serverId === null || $channelId === null || !$this->discord->hasBot()
            ? null
            : $this->discord->messagesForApp($serverId, $channelId);

        return Json::write($response, ['messages' => $messages ?? []]);
    }
}
