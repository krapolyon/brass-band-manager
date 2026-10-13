<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// DELETE /api/songs/{id}: deletes a song created by mistake, with its files,
// its parts and the levels members gave it. Asks for MANAGE_SONGS. It cannot
// be undone: the screen asks first, and offers the ABANDONED status instead
// (model/songs.md, "Rules").
final class DeleteSongAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SongFiles $files,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $paths = $this->database->transactional(function () use ($arguments): array {
            $song = $this->songs->row((int) $arguments['id'], lock: true);
            // A song used by a setlist is not deleted (model/gigs.md, entry 4).
            if ($this->database->fetchOne('SELECT 1 FROM setlistSong WHERE songId = ? LIMIT 1', [$song['id']]) !== false) {
                throw new ApiError(409, 'songInSetlist');
            }
            $parts = $this->database->fetchFirstColumn('SELECT pdfPath FROM songPart WHERE songId = ?', [$song['id']]);
            // The parts and the levels go with the row: the database deletes them.
            $this->database->delete('song', ['id' => $song['id']]);

            return [$song['coverPath'], $song['museScorePath'], $song['midiPath'], $song['musicXmlPath'], $song['audioPath'], $song['clipThumbnailPath'], ...$parts];
        });
        // Once the song is gone for good: a file is never deleted for a song that stays.
        foreach ($paths as $path) {
            $this->files->delete(is_string($path) ? $path : null);
        }

        return Json::write($response, ['deleted' => true]);
    }
}
