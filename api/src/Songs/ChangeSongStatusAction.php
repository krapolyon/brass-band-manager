<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/songs/{id}/status: sets the status of a song. Asks for
// MANAGE_SONGS. Every status can follow every other, and nothing is erased.
final class ChangeSongStatusAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $song = $this->songs->row((int) $arguments['id']);
        $songId = (int) $song['id'];
        $status = Input::from($request, SongStatusInput::class)->status;

        $changes = ['status' => $status->value, 'updatedByMemberId' => $me->id];
        // The day it first enters the repertoire (model/songs.md, "Setlist
        // attributes"): kept when it was already set, by the app or by hand.
        if ($status === SongStatus::IN_REPERTOIRE && $song['status'] !== $status->value && $song['inRepertoireOn'] === null) {
            $changes['inRepertoireOn'] = (new \DateTimeImmutable('now'))->format('Y-m-d');
        }
        $this->database->update('song', $changes, ['id' => $songId]);

        return Json::write($response, $this->songs->one($me, $songId));
    }
}
