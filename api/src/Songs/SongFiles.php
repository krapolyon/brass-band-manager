<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use BrassBand\Storage\Files;
use BrassBand\Storage\Images;
use Doctrine\DBAL\Connection;

// The files of songs: checking what is received, keeping each file, finding
// it again. Rules: model/songs.md, "Files".
//
// A song has one file of each kind at most, and one PDF per instrument. Each
// file has a folder of its own in the storage folder; the database holds its
// path:
//
//   song.coverPath          songs/5d4c3b2a1f0e9d8c/cover.jpg
//   song.musicXmlPath       songs/3c2b1a0f9e8d7c6b/score.musicxml
//   song.audioPath          songs/0a1b2c3d4e5f6a7b/audio.mp3   (peaks.json beside it)
//   songPart.pdfPath        songs/9f8e7d6c5b4a3f2e/part.pdf
//
// Nothing in a path comes from what was sent, and a file is never found by
// the name of its song: renaming a song touches no file.
final class SongFiles
{
    // The kinds of file a song holds itself, and the column of each.
    public const COLUMNS = [
        'cover' => 'coverPath',
        'museScore' => 'museScorePath',
        'midi' => 'midiPath',
        'musicXml' => 'musicXmlPath',
        'audio' => 'audioPath',
    ];

    public const MAX_BYTES = [
        'cover' => 2_000_000,
        'museScore' => 10_000_000,
        'midi' => 1_000_000,
        'musicXml' => 10_000_000,
        'audio' => 10_000_000,
        'part' => 5_000_000,
    ];

    // The browser crops the cover art to a square and reduces it to this side
    // before sending it; the server accepts nothing larger.
    public const COVER_SIDE = 1024;
    private const COVER_MIN_SIDE = 16;

    private const AREA = 'songs';
    private const PEAKS = 'peaks.json';
    public const MAX_PEAKS = 400;
    // How the outline was computed (model/songs.md, "The waveform of a
    // recording"). 2: the loudness of each slice, since 0.2.0. A file written
    // before, a bare list of the loudest samples, is flat on every recording
    // (issue #29): it counts as no outline, and is computed again.
    private const PEAKS_KIND = 2;

    public function __construct(
        private readonly Connection $database,
        private readonly Files $files,
    ) {
    }

    /**
     * Decides what a file is from its content, whatever its name said, and
     * returns the name it is kept under. Refuses a file that is not of the
     * kind expected.
     *
     * @param string $kind cover, museScore, midi, musicXml, audio or part
     */
    public static function nameOf(string $kind, string $content): string
    {
        $name = match ($kind) {
            'cover' => self::coverName($content),
            // A MuseScore file is a zip archive that holds the score as a
            // ".mscx" file. The names of what an archive holds are written
            // in it as they are.
            'museScore' => str_starts_with($content, "PK\x03\x04") && str_contains($content, '.mscx') ? 'score.mscz' : null,
            'midi' => str_starts_with($content, "MThd\x00\x00\x00\x06") ? 'song.mid' : null,
            'musicXml' => self::musicXmlName($content),
            'audio' => self::audioName($content),
            'part' => str_starts_with($content, '%PDF-') ? 'part.pdf' : null,
            default => null,
        };
        if ($name === null) {
            throw new ApiError(422, 'invalidFile');
        }

        return $name;
    }

    private static function coverName(string $content): ?string
    {
        $read = Images::read($content);
        $isSquare = $read !== null && $read['width'] === $read['height'];
        if ($read === null || !$isSquare || $read['width'] < self::COVER_MIN_SIDE || $read['width'] > self::COVER_SIDE) {
            return null;
        }

        return "cover.{$read['extension']}";
    }

    // MusicXML comes as it is, or compressed: an archive that lists what it
    // holds in "META-INF/container.xml". A MuseScore file has one too, and
    // is told apart by its ".mscx".
    private static function musicXmlName(string $content): ?string
    {
        if (str_starts_with($content, "PK\x03\x04")) {
            return str_contains($content, 'META-INF/container.xml') && !str_contains($content, '.mscx') ? 'score.mxl' : null;
        }
        $start = substr($content, 0, 4000);

        return str_contains($start, '<score-partwise') || str_contains($start, '<score-timewise') ? 'score.musicxml' : null;
    }

    private static function audioName(string $content): ?string
    {
        // An m4a says what it is from its fifth byte on.
        if (substr($content, 4, 4) === 'ftyp') {
            return 'audio.m4a';
        }
        // An mp3 starts with its tags, or straight with a frame of sound.
        $startsWithFrame = strlen($content) > 2 && $content[0] === "\xFF" && (ord($content[1]) & 0xE0) === 0xE0;

        return str_starts_with($content, 'ID3') || $startsWithFrame ? 'audio.mp3' : null;
    }

    /**
     * Gives a song a file of one kind, replaces it, or removes it, and
     * deletes the file it had. Two requests doing this at the same instant go
     * one after the other, so that no file is left behind.
     *
     * @param string $kind A key of COLUMNS
     * @param string|null $content The file, already checked; null removes it
     */
    public function replace(int $songId, string $kind, ?string $content, int $byMemberId): void
    {
        $column = self::COLUMNS[$kind];
        $file = $content === null ? null : ['name' => self::nameOf($kind, $content), 'content' => $content];

        $this->writing(function (callable $write) use ($songId, $column, $file, $byMemberId): ?string {
            // Holds the row until the end: the next request waits here.
            $previous = $this->database->fetchOne("SELECT {$column} FROM song WHERE id = ? FOR UPDATE", [$songId]);
            if ($previous === false) {
                throw new ApiError(404, 'notFound');
            }
            $this->database->update(
                'song',
                [$column => $file === null ? null : $write($file['name'], $file['content']), 'updatedByMemberId' => $byMemberId],
                ['id' => $songId],
            );

            return is_string($previous) ? $previous : null;
        });
    }

    /**
     * Gives a song the part of an instrument, replaces it, or removes it.
     *
     * @param string|null $content The PDF; null removes the part
     */
    public function replacePart(int $songId, int $instrumentId, ?string $content, int $byMemberId): void
    {
        $file = $content === null ? null : ['name' => self::nameOf('part', $content), 'content' => $content];

        $this->writing(function (callable $write) use ($songId, $instrumentId, $file, $byMemberId): ?string {
            $song = $this->database->fetchOne('SELECT id FROM song WHERE id = ? FOR UPDATE', [$songId]);
            $instrument = $this->database->fetchOne('SELECT id FROM instrument WHERE id = ?', [$instrumentId]);
            if ($song === false || $instrument === false) {
                throw new ApiError(404, 'notFound');
            }
            $part = ['songId' => $songId, 'instrumentId' => $instrumentId];
            $previous = $this->database->fetchOne('SELECT pdfPath FROM songPart WHERE songId = ? AND instrumentId = ?', [$songId, $instrumentId]);

            if ($file === null) {
                $this->database->delete('songPart', $part);
            } elseif ($previous === false) {
                $this->database->insert('songPart', [...$part, 'pdfPath' => $write($file['name'], $file['content']), 'updatedByMemberId' => $byMemberId]);
            } else {
                $this->database->update('songPart', ['pdfPath' => $write($file['name'], $file['content']), 'updatedByMemberId' => $byMemberId], $part);
            }

            return is_string($previous) ? $previous : null;
        });
    }

    /**
     * Runs a change that may write a file and that returns the path of the
     * file it replaces: saved together, or not at all.
     *
     * @param callable(callable(string, string): string): ?string $change
     */
    private function writing(callable $change): void
    {
        $written = null;
        $write = function (string $name, string $content) use (&$written): string {
            return $written = $this->store($name, $content);
        };
        try {
            $previous = $this->database->transactional(fn () => $change($write));
        } catch (\Throwable $failure) {
            // Nothing was saved: the file just written belongs to nobody.
            $this->files->delete($written);
            throw $failure;
        }
        $this->files->delete($previous);
    }

    // Keeps a file, and returns its path in the storage folder.
    public function store(string $name, string $content): string
    {
        return $this->files->write(self::AREA, [$name => $content]) . "/{$name}";
    }

    public function delete(?string $path): void
    {
        $this->files->delete($path);
    }

    /**
     * Keeps the outline of the recording of a song beside it. It goes when
     * the recording goes.
     *
     * The outline is the one of a given recording: when another recording
     * took its place while the browser was computing, it is refused.
     *
     * @param list<int> $peaks
     * @param string $version The version of the recording the outline was computed from
     */
    public function savePeaks(int $songId, array $peaks, string $version): void
    {
        $audioPath = $this->database->fetchOne('SELECT audioPath FROM song WHERE id = ?', [$songId]);
        if ($audioPath === false) {
            throw new ApiError(404, 'notFound');
        }
        if (!is_string($audioPath)) {
            throw new ApiError(409, 'noRecording');
        }
        if (!hash_equals((string) Files::version($audioPath), $version)) {
            throw new ApiError(409, 'recordingReplaced');
        }
        $content = json_encode(['kind' => self::PEAKS_KIND, 'peaks' => $peaks], JSON_THROW_ON_ERROR);
        if (!$this->files->add($audioPath, self::PEAKS, $content)) {
            throw new ApiError(409, 'noRecording');
        }
    }

    /**
     * @return list<int>|null Null when there is none, or one of an older kind
     */
    public function peaks(?string $audioPath): ?array
    {
        $file = $audioPath === null ? null : $this->files->find(dirname($audioPath) . '/' . self::PEAKS);
        $outline = $file === null ? null : json_decode((string) @file_get_contents($file), true);
        if (!is_array($outline) || ($outline['kind'] ?? null) !== self::PEAKS_KIND || !is_array($outline['peaks'] ?? null)) {
            return null;
        }

        return array_values(array_map(intval(...), $outline['peaks']));
    }

    /**
     * The file to serve for a path.
     *
     * @return array{file: string, version: string}|null
     */
    public function file(?string $path): ?array
    {
        $version = Files::version($path);
        $file = $path === null ? null : $this->files->find($path);

        return $file === null || $version === null ? null : ['file' => $file, 'version' => $version];
    }

    /**
     * What an answer says of a file: its address, whose version changes with
     * the file, and its size in bytes. Null when the song has no such file.
     *
     * @return array{url: string, size: int}|null
     */
    public function view(string $address, mixed $path): ?array
    {
        $found = $this->file(is_string($path) ? $path : null);
        $size = $found === null ? false : @filesize($found['file']);

        return $found === null || $size === false ? null : ['url' => "{$address}?v={$found['version']}", 'size' => $size];
    }
}
