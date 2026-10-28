<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use BrassBand\Storage\ServeFile;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/songs/{id}/cover, /clipThumbnail, /audio, /midi, /musicXml, /museScore and
// /parts/{instrumentId}: a file of a song. For signed-in members only: no
// file of a song is public (model/songs.md, "Files").
//
// With "?download", the browser saves the file under a readable name instead
// of showing it.
final class ShowSongFileAction
{
    private const COLUMNS = SongFiles::COLUMNS + ['clipThumbnail' => 'clipThumbnailPath'];

    /**
     * @param string $kind cover, clipThumbnail, audio, midi, musicXml, museScore or part
     */
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SongFiles $files,
        private readonly string $kind,
    ) {
    }

    /**
     * @param array{id: string, instrumentId?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $song = $this->songs->row((int) $arguments['id']);

        $instrument = null;
        if ($this->kind === 'part') {
            $part = $this->database->fetchAssociative(
                'SELECT p.pdfPath, i.name FROM songPart p JOIN instrument i ON i.id = p.instrumentId WHERE p.songId = ? AND p.instrumentId = ?',
                [$song['id'], (int) ($arguments['instrumentId'] ?? 0)],
            );
            $path = $part === false ? null : $part['pdfPath'];
            $instrument = $part === false ? null : (string) $part['name'];
        } else {
            $path = $song[self::COLUMNS[$this->kind]];
        }

        $found = $this->files->file(is_string($path) ? $path : null);
        if ($found === null) {
            throw new ApiError(404, 'notFound');
        }
        // MusicXML is a document a browser would open and draw: it is always
        // handed over as a file to save, which the reading mode reads as data.
        $downloads = $this->kind === 'musicXml' || array_key_exists('download', $request->getQueryParams());

        return ServeFile::privately(
            $request,
            $response,
            $found['file'],
            $found['version'],
            $downloads ? Songs::fileName((string) $song['name'], $instrument, $found['file']) : null,
        );
    }
}
