<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FileBody;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT and DELETE /api/songs/{id}/cover, /museScore, /midi, /audio and
// /parts/{instrumentId}: gives a song a file, replaces it, or removes it.
// Asks for MANAGE_SONGS.
//
// The file is the body of the request, as it is (FileBody). What it is is
// decided from its content: a file that is not of the kind its address says
// is refused.
final class UpdateSongFileAction
{
    /**
     * @param string $kind cover, museScore, midi, audio or part
     * @param bool $removes True for the route that removes the file
     */
    public function __construct(
        private readonly Songs $songs,
        private readonly SongFiles $files,
        private readonly string $kind,
        private readonly bool $removes,
    ) {
    }

    /**
     * @param array{id: string, instrumentId?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $songId = (int) $arguments['id'];
        $content = $this->removes ? null : FileBody::from($request, SongFiles::MAX_BYTES[$this->kind]);

        if ($this->kind === 'part') {
            $this->files->replacePart($songId, (int) ($arguments['instrumentId'] ?? 0), $content, $me->id);
        } else {
            // 404 before the file is looked at.
            $this->songs->row($songId);
            $this->files->replace($songId, $this->kind, $content, $me->id);
        }

        return Json::write($response, $this->songs->one($me, $songId));
    }
}
