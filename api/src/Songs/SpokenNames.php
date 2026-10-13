<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;

// What the dictation of a setlist learned (songSpokenName): the phrases it
// heard for a song, besides its name. Rules: model/songs.md, entry 4.
final class SpokenNames
{
    // model/songs.md, field `songSpokenName.phrase`.
    private const MIN_LENGTH = 2;
    private const MAX_LENGTH = 60;
    public const MAX_PER_SONG = 20;

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * A phrase as it is saved and compared: lowercase, accents removed, its
     * words separated by one space, and the letters said one by one joined
     * into a word ("d a n c e" becomes "dance").
     */
    public static function clean(string $phrase): string
    {
        $words = [];
        $letters = '';
        foreach ([...FileNames::words($phrase), ''] as $word) {
            if (preg_match('/^[a-z]$/', $word) === 1) {
                $letters .= $word;
                continue;
            }
            if ($letters !== '') {
                $words[] = $letters;
                $letters = '';
            }
            if ($word !== '') {
                $words[] = $word;
            }
        }

        return implode(' ', $words);
    }

    /**
     * The phrases of the songs a setlist can hold, for the dictation.
     *
     * @return list<array{songId: int, phrases: list<string>}>
     */
    public function forDictation(): array
    {
        $bySong = [];
        $rows = $this->database->fetchAllAssociative(
            "SELECT n.songId, n.phrase FROM songSpokenName n JOIN song s ON s.id = n.songId
             WHERE s.status IN ('IN_REPERTOIRE', 'TEMPORARY') ORDER BY n.songId, n.createdAt, n.id",
        );
        foreach ($rows as $row) {
            $bySong[(int) $row['songId']][] = (string) $row['phrase'];
        }

        return array_map(
            fn (int $songId) => ['songId' => $songId, 'phrases' => $bySong[$songId]],
            array_keys($bySong),
        );
    }

    /**
     * The phrases of a song, the oldest first.
     *
     * @return list<array{id: int, phrase: string}>
     */
    public function ofSong(int $songId): array
    {
        return array_map(
            fn (array $row) => ['id' => (int) $row['id'], 'phrase' => (string) $row['phrase']],
            $this->database->fetchAllAssociative(
                'SELECT id, phrase FROM songSpokenName WHERE songId = ? ORDER BY createdAt, id',
                [$songId],
            ),
        );
    }

    /**
     * Gives a phrase to a song. A phrase names one song: held by another one,
     * it moves when $moves, and is refused otherwise with the song that has
     * it. The name of the song is never saved: it already counts. Beyond 20,
     * the oldest phrase of the song leaves.
     *
     * @param array<string, mixed> $song The row of the song, held by the caller's transaction
     */
    public function give(array $song, string $phrase, bool $moves, int $byMemberId): void
    {
        $songId = (int) $song['id'];
        $phrase = self::clean($phrase);
        if ($phrase === '') {
            throw self::refusal('required');
        }
        if (strlen($phrase) < self::MIN_LENGTH) {
            throw self::refusal('tooShort');
        }
        if (strlen($phrase) > self::MAX_LENGTH) {
            throw self::refusal('tooLong');
        }
        if ($phrase === self::clean((string) $song['name'])) {
            return;
        }

        $held = $this->database->fetchAssociative('SELECT id, songId FROM songSpokenName WHERE phrase = ? FOR UPDATE', [$phrase]);
        if ($held !== false) {
            if ((int) $held['songId'] === $songId) {
                return;
            }
            if (!$moves) {
                throw self::refusal('phraseTaken', (int) $held['songId']);
            }
            // Deleted and added again, so that it is the newest of its new song.
            $this->database->delete('songSpokenName', ['id' => (int) $held['id']]);
        }
        $this->database->insert('songSpokenName', [
            'songId' => $songId,
            'phrase' => $phrase,
            'updatedByMemberId' => $byMemberId,
        ]);

        $ids = $this->database->fetchFirstColumn(
            'SELECT id FROM songSpokenName WHERE songId = ? ORDER BY createdAt DESC, id DESC',
            [$songId],
        );
        foreach (array_slice($ids, self::MAX_PER_SONG) as $oldest) {
            $this->database->delete('songSpokenName', ['id' => (int) $oldest]);
        }
    }

    private static function refusal(string $problem, ?int $takenBySongId = null): ApiError
    {
        // The fields of a refusal are texts: the song is told as one.
        return new ApiError(422, 'invalidInput', [
            'phrase' => $problem,
            ...($takenBySongId === null ? [] : ['takenBySongId' => (string) $takenBySongId]),
        ]);
    }
}
