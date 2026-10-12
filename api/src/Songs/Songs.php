<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\Permission;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;

// What the actions on songs share: what a song looks like in an answer, and
// who sees what of it. Rules: model/songs.md.
//
// Every signed-in member sees every song and every file, whatever the
// status. Two things are not for everyone: the Discord channel, shown to who
// manages songs, and the levels of a member, shown to that member only. The
// others get the average of the band and the number of answers, never the
// level of a named member.
final class Songs
{
    // The columns are listed one by one on purpose: a column added to the
    // table is never sent by accident.
    private const COLUMNS = 's.id, s.name, s.originalTitle, s.originalArtist, s.bpm, s.status, s.versionOn,
        s.versionNote, s.clipUrl, s.clipThumbnailPath, s.discordChannelId,
        s.coverPath, s.museScorePath, s.midiPath, s.audioPath';

    // The levels of the band on each song: the average of the current
    // members who answered, and how many did.
    private const AVERAGES = "SELECT l.songId,
            AVG(l.masteryLevel) AS masteryAverage, COUNT(l.masteryLevel) AS masteryCount,
            AVG(l.enjoymentLevel) AS enjoymentAverage, COUNT(l.enjoymentLevel) AS enjoymentCount
        FROM memberSong l
        JOIN member m ON m.id = l.memberId AND m.status IN ('ACTIVE', 'POWER_MEMBER')
        GROUP BY l.songId";

    public function __construct(
        private readonly Connection $database,
        private readonly SongFiles $files,
    ) {
    }

    /**
     * Every song, by name: what the list and the table of songs show.
     *
     * @return list<array<string, mixed>>
     */
    public function all(CurrentMember $viewer): array
    {
        $songs = $this->database->fetchAllAssociative(
            'SELECT ' . self::COLUMNS . ', a.masteryAverage, a.masteryCount, a.enjoymentAverage, a.enjoymentCount,
                (SELECT COUNT(*) FROM songPart p WHERE p.songId = s.id) AS partCount,
                (SELECT p.pdfPath FROM songPart p WHERE p.songId = s.id AND p.instrumentId = ?) AS ownPartPath
             FROM song s LEFT JOIN (' . self::AVERAGES . ') a ON a.songId = s.id
             ORDER BY s.name',
            [$this->instrumentOf($viewer)],
        );

        return array_map(fn (array $song) => $this->summary($song), $songs);
    }

    /**
     * One song, with everything its screen shows.
     *
     * @return array<string, mixed>
     */
    public function one(CurrentMember $viewer, int $songId): array
    {
        $instrumentId = $this->instrumentOf($viewer);
        $song = $this->database->fetchAssociative(
            'SELECT ' . self::COLUMNS . ', a.masteryAverage, a.masteryCount, a.enjoymentAverage, a.enjoymentCount,
                (SELECT COUNT(*) FROM songPart p WHERE p.songId = s.id) AS partCount,
                (SELECT p.pdfPath FROM songPart p WHERE p.songId = s.id AND p.instrumentId = ?) AS ownPartPath
             FROM song s LEFT JOIN (' . self::AVERAGES . ') a ON a.songId = s.id
             WHERE s.id = ?',
            [$instrumentId, $songId],
        );
        if ($song === false) {
            throw new ApiError(404, 'notFound');
        }

        // In the order of the sections and instruments of the band.
        $parts = $this->database->fetchAllAssociative(
            'SELECT p.instrumentId, p.pdfPath
             FROM songPart p JOIN instrument i ON i.id = p.instrumentId JOIN section c ON c.id = i.sectionId
             WHERE p.songId = ?
             ORDER BY c.position, c.name, i.position, i.name',
            [$songId],
        );
        $levels = $this->database->fetchAssociative(
            'SELECT masteryLevel, enjoymentLevel FROM memberSong WHERE memberId = ? AND songId = ?',
            [$viewer->id, $songId],
        );
        $address = "/api/songs/{$songId}";
        $audio = $this->files->view("{$address}/audio", $song['audioPath']);

        $view = [
            ...$this->summary($song),
            'versionNote' => $song['versionNote'],
            'clipUrl' => $song['clipUrl'],
            // What the player shows: the identifier the server read and checked,
            // so that the screen never reads the address its own way.
            'clipVideoId' => is_string($song['clipUrl']) ? ClipThumbnails::videoId($song['clipUrl']) : null,
            'clipThumbnailUrl' => $this->files->view("{$address}/clipThumbnail", $song['clipThumbnailPath'])['url'] ?? null,
            'audio' => $audio === null ? null : [
                ...$audio,
                // mp3 or m4a.
                'format' => pathinfo((string) $song['audioPath'], PATHINFO_EXTENSION),
                'peaks' => $this->files->peaks(is_string($song['audioPath']) ? $song['audioPath'] : null),
            ],
            'midi' => $this->files->view("{$address}/midi", $song['midiPath']),
            'museScore' => $this->files->view("{$address}/museScore", $song['museScorePath']),
            'parts' => array_values(array_filter(array_map(function (array $part) use ($address): ?array {
                $file = $this->files->view("{$address}/parts/{$part['instrumentId']}", $part['pdfPath']);

                return $file === null ? null : ['instrumentId' => (int) $part['instrumentId'], ...$file];
            }, $parts))),
            // The levels of the member who asks, and of nobody else.
            'ownLevels' => [
                'masteryLevel' => self::level($levels === false ? null : $levels['masteryLevel']),
                'enjoymentLevel' => self::level($levels === false ? null : $levels['enjoymentLevel']),
            ],
        ];
        if ($viewer->can(Permission::MANAGE_SONGS)) {
            $view['discordChannelId'] = $song['discordChannelId'];
        }

        return $view;
    }

    /**
     * The row of a song, as the table holds it. 404 when there is none.
     *
     * @param bool $lock Holds the row until the end of the transaction
     * @return array<string, mixed>
     */
    public function row(int $songId, bool $lock = false): array
    {
        $song = $this->database->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM song s WHERE s.id = ?' . ($lock ? ' FOR UPDATE' : ''),
            [$songId],
        );
        if ($song === false) {
            throw new ApiError(404, 'notFound');
        }

        return $song;
    }

    public function instrumentOf(CurrentMember $member): int
    {
        return (int) $this->database->fetchOne('SELECT instrumentId FROM member WHERE id = ?', [$member->id]);
    }

    // The name a file of a song is offered under when it is downloaded:
    // "Seven Nation - Sax Alto.pdf". Built from the names of the song and of
    // the instrument, which are content: nothing here is a sentence.
    public static function fileName(string $songName, ?string $instrumentName, string $file): string
    {
        $name = $instrumentName === null ? $songName : "{$songName} - {$instrumentName}";
        // What a file name cannot hold on one system or another.
        $name = trim((string) preg_replace('#[\\\\/:*?"<>|\p{C}]+#u', ' ', $name));
        $name = (string) preg_replace('/\s+/u', ' ', $name);

        return ($name === '' ? 'song' : $name) . '.' . pathinfo($file, PATHINFO_EXTENSION);
    }

    /**
     * @param array<string, mixed> $song
     * @return array<string, mixed>
     */
    private function summary(array $song): array
    {
        $address = "/api/songs/{$song['id']}";
        $size = fn (mixed $path): ?int => $this->files->view($address, $path)['size'] ?? null;

        return [
            'id' => (int) $song['id'],
            'name' => $song['name'],
            'originalTitle' => $song['originalTitle'],
            'originalArtist' => $song['originalArtist'],
            'bpm' => $song['bpm'] === null ? null : (int) $song['bpm'],
            'status' => $song['status'],
            'versionOn' => $song['versionOn'],
            'coverUrl' => $this->files->view("{$address}/cover", $song['coverPath'])['url'] ?? null,
            'partCount' => (int) $song['partCount'],
            // The weight of each file, null when the song has none: what
            // "download everything" adds up. ownPart is the part of the
            // instrument of the member who asks.
            'fileSizes' => [
                'ownPart' => $size($song['ownPartPath']),
                'audio' => $size($song['audioPath']),
                'midi' => $size($song['midiPath']),
                'museScore' => $size($song['museScorePath']),
            ],
            'mastery' => self::average($song['masteryAverage'], $song['masteryCount']),
            'enjoyment' => self::average($song['enjoymentAverage'], $song['enjoymentCount']),
        ];
    }

    /**
     * @return array{average: float|null, count: int}
     */
    private static function average(mixed $average, mixed $count): array
    {
        return [
            'average' => $average === null ? null : round((float) $average, 1),
            'count' => (int) $count,
        ];
    }

    private static function level(mixed $level): ?int
    {
        return $level === null ? null : (int) $level;
    }
}
