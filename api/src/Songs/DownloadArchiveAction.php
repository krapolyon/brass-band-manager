<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Stream;

// GET /api/songs/archive?kind=...&songs=1,2,3: every file of one kind, for
// the songs given, in one .zip archive. Rules: model/songs.md, "Downloading
// everything".
//
//   kind=parts       the parts of the instrument of the member who asks
//   kind=audio       the recordings
//   kind=midi        the MIDI files
//   kind=museScore   the MuseScore files
//
// The archive is built on demand in the temporary folder of the server and
// kept nowhere. The files are stored in it as they are: a PDF, an mp3 or a
// MuseScore file is already compressed.
final class DownloadArchiveAction
{
    private const KINDS = ['parts', 'audio', 'midi', 'museScore'];
    private const MAX_SONGS = 500;
    // More than a repertoire of fifty songs with a recording each: above it,
    // the request is not one the screen makes.
    private const MAX_BYTES = 600_000_000;

    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SongFiles $files,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $kind = $query['kind'] ?? null;
        $list = $query['songs'] ?? '';
        if (!in_array($kind, self::KINDS, true) || !is_string($list) || preg_match('/\A[0-9]+(,[0-9]+)*\z/', $list) !== 1) {
            throw new ApiError(422, 'invalidInput');
        }
        $songIds = array_slice(array_map(intval(...), explode(',', $list)), 0, self::MAX_SONGS);

        $found = $this->found($kind, $songIds, $this->songs->instrumentOf(CurrentMember::of($request)));
        if ($found === [] || !class_exists(\ZipArchive::class)) {
            throw new ApiError(404, 'notFound');
        }

        if (array_sum(array_map(fn (string $file) => (int) @filesize($file), $found)) > self::MAX_BYTES) {
            throw new ApiError(413, 'archiveTooBig');
        }

        $archive = tempnam(sys_get_temp_dir(), 'songs');
        if ($archive === false) {
            throw new \RuntimeException('The archive cannot be written');
        }
        // Whatever stops the request, a time limit included, the temporary
        // file does not stay behind.
        register_shutdown_function(static function () use ($archive): void {
            if (is_file($archive)) {
                @unlink($archive);
            }
        });
        $zip = new \ZipArchive();
        if ($zip->open($archive, \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('The archive cannot be written');
        }
        foreach ($found as $name => $file) {
            $zip->addFile($file, $name);
            $zip->setCompressionName($name, \ZipArchive::CM_STORE);
        }
        $zip->close();

        // Opened, then removed from the folder: the file lives until it has
        // been sent, and nothing is left behind whatever happens next.
        $handle = fopen($archive, 'rb');
        $size = filesize($archive);
        unlink($archive);
        if ($handle === false || $size === false) {
            throw new \RuntimeException('The archive cannot be read');
        }

        return $response
            ->withBody(new Stream($handle))
            ->withHeader('Content-Type', 'application/zip')
            ->withHeader('Content-Length', (string) $size)
            // The name of the archive is a sentence: the screen gives it.
            ->withHeader('Content-Disposition', 'attachment')
            ->withHeader('Cache-Control', 'no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    /**
     * The files to put in the archive: name in the archive => place on the disk.
     *
     * @param list<int> $songIds
     * @return array<string, string>
     */
    private function found(string $kind, array $songIds, int $instrumentId): array
    {
        if ($kind === 'parts') {
            $rows = $this->database->fetchAllAssociative(
                'SELECT s.name, i.name AS instrument, p.pdfPath AS path
                 FROM songPart p JOIN song s ON s.id = p.songId JOIN instrument i ON i.id = p.instrumentId
                 WHERE p.instrumentId = ? AND p.songId IN (?) ORDER BY s.name',
                [$instrumentId, $songIds],
                [1 => ArrayParameterType::INTEGER],
            );
        } else {
            $column = SongFiles::COLUMNS[$kind];
            $rows = $this->database->fetchAllAssociative(
                "SELECT name, NULL AS instrument, {$column} AS path FROM song WHERE {$column} IS NOT NULL AND id IN (?) ORDER BY name",
                [$songIds],
                [ArrayParameterType::INTEGER],
            );
        }

        $found = [];
        foreach ($rows as $row) {
            $file = $this->files->file((string) $row['path'])['file'] ?? null;
            if ($file !== null) {
                $instrument = $row['instrument'] === null ? null : (string) $row['instrument'];
                // Two songs whose names differ only by what a file name cannot
                // hold ("AC/DC" and "AC DC") must not take the same place.
                $name = Songs::fileName((string) $row['name'], $instrument, $file);
                for ($copy = 2; isset($found[$name]); $copy++) {
                    $name = Songs::fileName("{$row['name']} ({$copy})", $instrument, $file);
                }
                $found[$name] = $file;
            }
        }

        return $found;
    }
}
