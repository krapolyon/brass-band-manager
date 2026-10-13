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

// The phrases of one song, in its form: "Façons de le dire" (model/songs.md,
// entry 4). Asks for MANAGE_SONGS. Each change is saved at once and answers
// the phrases the song has.
//
// GET /api/songs/{id}/spokenNames lists them. POST adds one by hand: when
// another song has it, it is refused with that song ("takenBySongId") unless
// "moves" is true. DELETE /api/songSpokenNames/{id} takes one away.
final class SpokenNamesAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SpokenNames $spokenNames,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $id = (int) $arguments['id'];

        if ($request->getMethod() === 'DELETE') {
            $songId = $this->database->fetchOne('SELECT songId FROM songSpokenName WHERE id = ?', [$id]);
            if ($songId === false) {
                throw new ApiError(404, 'notFound');
            }
            $this->database->delete('songSpokenName', ['id' => $id]);

            return Json::write($response, $this->spokenNames->ofSong((int) $songId));
        }

        // 404 before anything is read from the body.
        $this->songs->row($id);
        if ($request->getMethod() === 'POST') {
            $input = Input::from($request, SpokenNameInput::class);
            $me = CurrentMember::of($request);
            $this->database->transactional(function () use ($id, $input, $me): void {
                $this->spokenNames->give($this->songs->row($id, lock: true), $input->phrase, $input->moves, $me->id);
            });
        }

        return Json::write($response, $this->spokenNames->ofSong($id));
    }
}
