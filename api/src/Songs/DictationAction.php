<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// What the dictation of a setlist reads and learns (model/songs.md, entry 4).
// Asks for MANAGE_SETLISTS. Both answer the phrases of the songs a setlist
// can hold.
//
// GET /api/spokenNames reads them. POST /api/songs/{id}/spokenNames/learned
// saves the phrase heard for the song the member chose or corrected: held by
// another song, it moves, the last choice wins.
final class DictationAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SpokenNames $spokenNames,
    ) {
    }

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        if ($request->getMethod() === 'POST') {
            $songId = (int) ($arguments['id'] ?? 0);
            $this->songs->row($songId);
            $input = Input::from($request, SpokenNameInput::class);
            $me = CurrentMember::of($request);
            $this->database->transactional(function () use ($songId, $input, $me): void {
                $song = $this->songs->row($songId, lock: true);
                // Only a song a setlist can hold is dictated.
                if (!in_array($song['status'], [SongStatus::IN_REPERTOIRE->value, SongStatus::TEMPORARY->value], true)) {
                    throw new ApiError(409, 'songNotPlayed');
                }
                $this->spokenNames->give($song, $input->phrase, moves: true, byMemberId: $me->id);
            });
        }

        return Json::write($response, $this->spokenNames->forDictation());
    }
}
