<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\AccessRules;
use BrassBand\Access\CurrentMember;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

// What the actions on songs share: what a song looks like in an answer, and
// who sees what of it. Rules: model/songs.md.
//
// Every signed-in member sees every song and every file, whatever the
// status, and its Discord channel as a link (since 0.3.0). One thing is not
// for everyone: the levels of a member, shown to that member only. The
// others get the average of the band and the number of answers, never the
// level of a named member.
final class Songs
{
    // The columns are listed one by one on purpose: a column added to the
    // table is never sent by accident.
    private const COLUMNS = 's.id, s.name, s.originalTitle, s.originalArtist, s.bpm, s.status, s.versionOn,
        s.versionNote, s.clipUrl, s.clipThumbnailPath, s.discordChannelId,
        s.durationSeconds, s.inRepertoireOn, s.mood, s.copyright,
        s.coverPath, s.museScorePath, s.midiPath, s.musicXmlPath, s.audioPath, s.createdAt';

    // The levels of the band on each song: the average of the current
    // members who answered, and how many did.
    private const AVERAGES = "SELECT l.songId,
            AVG(l.masteryLevel) AS masteryAverage, COUNT(l.masteryLevel) AS masteryCount,
            AVG(l.enjoymentLevel) AS enjoymentAverage, COUNT(l.enjoymentLevel) AS enjoymentCount
        FROM memberSong l
        JOIN member m ON m.id = l.memberId AND m.status IN (" . AccessRules::SIGN_IN_STATUSES_SQL . ')
        GROUP BY l.songId';

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

        $attributes = $this->attributes(array_map(fn (array $song) => (int) $song['id'], $songs));

        return array_map(fn (array $song) => $this->summary($song, $attributes[(int) $song['id']] ?? null), $songs);
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
            'SELECT masteryLevel, enjoymentLevel, ratedOn FROM memberSong WHERE memberId = ? AND songId = ?',
            [$viewer->id, $songId],
        );
        $address = "/api/songs/{$songId}";
        $audio = $this->files->view("{$address}/audio", $song['audioPath']);

        $serverId = DiscordLinks::bandServer($this->database);
        $channelId = is_string($song['discordChannelId']) ? $song['discordChannelId'] : null;
        $view = [
            ...$this->summary($song, $this->attributes([$songId])[$songId] ?? null),
            // The channel of the song, for every member: the link opens it in
            // Discord. No link while the band has no server.
            'discordChannelId' => $channelId,
            'discordUrl' => $serverId === null || $channelId === null ? null : DiscordLinks::channelUrl($serverId, $channelId),
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
            'musicXml' => $this->files->view("{$address}/musicXml", $song['musicXmlPath']),
            'museScore' => $this->files->view("{$address}/museScore", $song['museScorePath']),
            'parts' => array_values(array_filter(array_map(function (array $part) use ($address): ?array {
                $file = $this->files->view("{$address}/parts/{$part['instrumentId']}", $part['pdfPath']);

                return $file === null ? null : ['instrumentId' => (int) $part['instrumentId'], ...$file];
            }, $parts))),
            // The levels of the member who asks, and of nobody else.
            'ownLevels' => [
                'masteryLevel' => self::level($levels === false ? null : $levels['masteryLevel']),
                'enjoymentLevel' => self::level($levels === false ? null : $levels['enjoymentLevel']),
                // The day they were last set or confirmed (Y-m-d), null when
                // never: the sheet asks again after a year.
                'ratedOn' => $levels === false || !is_string($levels['ratedOn']) ? null : $levels['ratedOn'],
            ],
        ];
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
     * The positions and the sections of songs, by song: what the setlist
     * generator reads, with the mood (model/songs.md, "Setlist attributes").
     *
     * @param list<int> $songIds
     * @return array<int, array{positions: list<string>, tiringSectionIds: list<int>, trickySectionIds: list<int>}>
     */
    private function attributes(array $songIds): array
    {
        if ($songIds === []) {
            return [];
        }
        // In the order of a set for the positions, of the band for the sections.
        $lists = [
            'positions' => 'SELECT songId, position AS value FROM songPosition WHERE songId IN (?) ORDER BY songId, position',
            'tiringSectionIds' => 'SELECT t.songId, t.sectionId AS value FROM songTiringSection t JOIN section c ON c.id = t.sectionId WHERE t.songId IN (?) ORDER BY t.songId, c.position, c.name',
            'trickySectionIds' => 'SELECT t.songId, t.sectionId AS value FROM songTrickySection t JOIN section c ON c.id = t.sectionId WHERE t.songId IN (?) ORDER BY t.songId, c.position, c.name',
        ];
        $found = [];
        foreach ($lists as $key => $sql) {
            foreach ($this->database->fetchAllAssociative($sql, [$songIds], [ArrayParameterType::INTEGER]) as $row) {
                $found[$key][(int) $row['songId']][] = $row['value'];
            }
        }
        $attributes = [];
        foreach ($songIds as $songId) {
            $attributes[$songId] = [
                'positions' => array_map('strval', $found['positions'][$songId] ?? []),
                'tiringSectionIds' => array_map('intval', $found['tiringSectionIds'][$songId] ?? []),
                'trickySectionIds' => array_map('intval', $found['trickySectionIds'][$songId] ?? []),
            ];
        }

        return $attributes;
    }

    /**
     * @param array<string, mixed> $song
     * @param array{positions: list<string>, tiringSectionIds: list<int>, trickySectionIds: list<int>}|null $attributes
     * @return array<string, mixed>
     */
    private function summary(array $song, ?array $attributes): array
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
            // What the setlist editor and its generator read.
            'durationSeconds' => $song['durationSeconds'] === null ? null : (int) $song['durationSeconds'],
            'inRepertoireOn' => $song['inRepertoireOn'],
            'mood' => $song['mood'],
            ...($attributes ?? ['positions' => [], 'tiringSectionIds' => [], 'trickySectionIds' => []]),
            // The authors and composers, for whoever declares the songs played.
            'copyright' => $song['copyright'],
            // The home screen shows the songs of the repertoire created last.
            'createdAt' => str_replace(' ', 'T', (string) $song['createdAt']) . 'Z',
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
