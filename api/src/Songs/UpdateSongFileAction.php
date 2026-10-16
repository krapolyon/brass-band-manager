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
// is refused. A MuseScore file that replaces another one, and a part given or
// replaced, are notified (SongPush).
final class UpdateSongFileAction
{
    /**
     * @param string $kind cover, museScore, midi, audio or part
     * @param bool $removes True for the route that removes the file
     */
    public function __construct(
        private readonly Songs $songs,
        private readonly SongFiles $files,
        private readonly SongPush $songPush,
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
            $instrumentId = (int) ($arguments['instrumentId'] ?? 0);
            $this->files->replacePart($songId, $instrumentId, $content, $me->id);
            if ($content !== null) {
                $this->songPush->partChanged($songId, $instrumentId, $me->sessionId);
            }
        } else {
            // 404 before the file is looked at.
            $hadScore = $this->songs->row($songId)['museScorePath'] !== null;
            $this->files->replace($songId, $this->kind, $content, $me->id);
            if ($this->kind === 'museScore' && $content !== null && $hadScore) {
                $this->songPush->scoreReplaced($songId, $me->sessionId);
            }
        }

        return Json::write($response, $this->songs->one($me, $songId));
    }
}
