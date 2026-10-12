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
        $songId = (int) $this->songs->row((int) $arguments['id'])['id'];
        $status = Input::from($request, SongStatusInput::class)->status;

        $this->database->update('song', ['status' => $status->value, 'updatedByMemberId' => $me->id], ['id' => $songId]);

        return Json::write($response, $this->songs->one($me, $songId));
    }
}
