<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Push\NotificationSetting;
use BrassBand\Push\Push;
use BrassBand\Push\PushTexts;
use Doctrine\DBAL\Connection;

// The notifications of songs (model/songs.md, "Notifications"): a song is
// created, its MuseScore file is replaced, a part is added or replaced. Each
// goes to the members who want it; a part only to those who play its
// instrument. A notification names the song, never a member. The device that
// sent the song or the file is spared.
//
// A song is news once: the files sent in the first hour after it was created
// (an import sends them one by one) notify nothing, "Nouveau morceau" said it.
final class SongPush
{
    private const FIRST_HOUR = 3600;

    public function __construct(
        private readonly Connection $database,
        private readonly Push $push,
    ) {
    }

    public function created(int $songId, int $bySessionId): void
    {
        $song = $this->song($songId);
        if ($song === null) {
            return;
        }
        $this->send($this->currentMembers(), $song, NotificationSetting::SONG_NEW, 'songs.push.new', ['artist' => (string) $song['originalArtist']], $bySessionId);
    }

    /** The MuseScore file of the song replaced another one. */
    public function scoreReplaced(int $songId, int $bySessionId): void
    {
        $song = $this->song($songId);
        if ($song === null || self::isNew($song)) {
            return;
        }
        $this->send($this->currentMembers(), $song, NotificationSetting::SONG_SCORE, 'songs.push.score', [], $bySessionId);
    }

    /** A part was added to the song, or replaced. */
    public function partChanged(int $songId, int $instrumentId, int $bySessionId): void
    {
        $song = $this->song($songId);
        $instrument = $this->database->fetchOne('SELECT name FROM instrument WHERE id = ?', [$instrumentId]);
        if ($song === null || self::isNew($song) || $instrument === false) {
            return;
        }
        $players = array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            "SELECT id FROM member WHERE instrumentId = ? AND status IN ('ACTIVE', 'POWER_MEMBER')",
            [$instrumentId],
        ));
        $this->send($players, $song, NotificationSetting::SONG_PART, 'songs.push.part', ['instrument' => (string) $instrument], $bySessionId);
    }

    /**
     * @param list<int> $memberIds
     * @param array<string, mixed> $song
     * @param array<string, string> $values
     */
    private function send(array $memberIds, array $song, NotificationSetting $setting, string $key, array $values, int $bySessionId): void
    {
        $band = (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1');
        $values = ['band' => $band, 'name' => (string) $song['name'], ...$values];

        $this->push->toMembers($memberIds, fn (int $memberId, string $language) => [
            'title' => PushTexts::text("{$key}.title", $language, $values),
            'body' => PushTexts::text("{$key}.body", $language, $values),
            'tag' => "song{$song['id']}",
            'renotify' => true,
            'url' => "/songs/{$song['id']}",
        ], Push::TTL_NEWS, setting: $setting, exceptSessionId: $bySessionId);
    }

    /** @return list<int> */
    private function currentMembers(): array
    {
        return array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            "SELECT id FROM member WHERE status IN ('ACTIVE', 'POWER_MEMBER')",
        ));
    }

    /** @return array<string, mixed>|null */
    private function song(int $songId): ?array
    {
        $song = $this->database->fetchAssociative(
            'SELECT id, name, originalArtist, TIMESTAMPDIFF(SECOND, createdAt, UTC_TIMESTAMP()) AS age FROM song WHERE id = ?',
            [$songId],
        );

        return $song === false ? null : $song;
    }

    /** @param array<string, mixed> $song */
    private static function isNew(array $song): bool
    {
        return (int) $song['age'] < self::FIRST_HOUR;
    }
}
