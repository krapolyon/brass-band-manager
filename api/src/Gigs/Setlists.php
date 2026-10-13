<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\ApiError;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

// What the actions on setlists share: what a setlist looks like in an answer,
// and where its live session is. Rules: model/gigs.md, entry 4.
//
// The setlists of a gig are shown from CONFIRMED on: before, the band does
// not know it plays. One setlist at most is live in the band.
final class Setlists
{
    public const DESCRIPTION_MAX_LENGTH = 60;

    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * The row of a setlist with the status of its gig. 404 when there is none.
     *
     * @return array<string, mixed>
     */
    public function row(int $setlistId, bool $lock = false): array
    {
        $setlist = $this->database->fetchAssociative(
            'SELECT id, gigId, gigSlotId, number, description, liveStartedAt, livePosition
             FROM setlist WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''),
            [$setlistId],
        );
        if ($setlist === false) {
            throw new ApiError(404, 'notFound');
        }

        return $setlist;
    }

    /**
     * The row of a setlist that is shown: its gig is confirmed. A setlist of
     * a gig that is not (cancelled, reopened as a draft) is kept and hidden:
     * 404, as for one that is not there.
     *
     * @return array<string, mixed>
     */
    public function rowShown(int $setlistId, bool $lock = false): array
    {
        $setlist = $this->row($setlistId, $lock);
        $status = $this->database->fetchOne('SELECT status FROM gig WHERE id = ?', [$setlist['gigId']]);
        if ($status !== GigStatus::CONFIRMED->value) {
            throw new ApiError(404, 'notFound');
        }

        return $setlist;
    }

    // Ends the live session of the setlists of a gig that is no longer confirmed.
    public function endLiveOfGig(int $gigId): void
    {
        $this->database->executeStatement(
            'UPDATE setlist SET liveStartedAt = NULL, livePosition = NULL WHERE gigId = ? AND liveStartedAt IS NOT NULL',
            [$gigId],
        );
    }

    /**
     * The setlists of a gig, in the order of their numbers, each with its songs.
     *
     * @return list<array<string, mixed>>
     */
    public function ofGig(int $gigId): array
    {
        return $this->views($this->database->fetchAllAssociative(
            'SELECT id, gigId, gigSlotId, number, description, liveStartedAt, livePosition
             FROM setlist WHERE gigId = ? ORDER BY number',
            [$gigId],
        ));
    }

    /**
     * @return array<string, mixed>
     */
    public function one(int $setlistId): array
    {
        return $this->views([$this->row($setlistId)])[0];
    }

    // How many songs a setlist has.
    public function songCount(int $setlistId): int
    {
        return (int) $this->database->fetchOne('SELECT COUNT(*) FROM setlistSong WHERE setlistId = ?', [$setlistId]);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function views(array $rows): array
    {
        if ($rows === []) {
            return [];
        }
        $songs = [];
        // By name: the name the band gives the song, as in the list of songs.
        foreach ($this->database->fetchAllAssociative(
            'SELECT ss.setlistId, ss.position, ss.songId, s.name
             FROM setlistSong ss JOIN song s ON s.id = ss.songId
             WHERE ss.setlistId IN (?) ORDER BY ss.setlistId, ss.position',
            [array_column($rows, 'id')],
            [ArrayParameterType::INTEGER],
        ) as $song) {
            $songs[(int) $song['setlistId']][] = [
                'position' => (int) $song['position'],
                'songId' => (int) $song['songId'],
                'name' => (string) $song['name'],
            ];
        }

        return array_map(fn (array $row) => [
            'id' => (int) $row['id'],
            'gigId' => (int) $row['gigId'],
            'gigSlotId' => (int) $row['gigSlotId'],
            'number' => (int) $row['number'],
            'description' => $row['description'],
            // Stored in UTC, sent as an instant the browser reads in its own zone. Null: not live.
            'liveStartedAt' => $row['liveStartedAt'] === null ? null : str_replace(' ', 'T', (string) $row['liveStartedAt']) . 'Z',
            'livePosition' => $row['livePosition'] === null ? null : (int) $row['livePosition'],
            'songs' => $songs[(int) $row['id']] ?? [],
        ], $rows);
    }
}
