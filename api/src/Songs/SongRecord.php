<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;

// The record of a song as it is checked and saved: by the form of a song
// (SaveSongAction), and by a reprise of spreadsheets (0.4.0, issue #43), so
// that a song loaded from a file follows the same rules as one typed. Rules:
// model/songs.md, entry 1 and "Setlist attributes".
final class SongRecord
{
    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * Checks the record and returns it as it will be saved.
     *
     * @param array<string, mixed>|null $current
     * @return array<string, mixed>
     */
    public function check(SongInput $input, ?int $songId, ?array $current): array
    {
        $errors = new FieldErrors();
        $errors->text('name', $input->name, 80);
        $errors->text('originalTitle', $input->originalTitle, 150);
        $errors->text('originalArtist', $input->originalArtist, 150);
        $copyright = $errors->optionalText('copyright', $input->copyright, 200);
        if ($input->bpm !== null && ($input->bpm < 20 || $input->bpm > 400)) {
            $errors->add('bpm', 'invalid');
        }

        // A real day, and not in the future. "Today" is not the same day
        // everywhere at once: tomorrow by the clock of the server is accepted.
        $versionOn = self::day($errors, 'versionOn', $input->versionOn);
        $versionNote = $errors->optionalText('versionNote', $input->versionNote, 1000, lines: true);

        $clipUrl = $errors->optionalText('clipUrl', $input->clipUrl, 255);
        if ($clipUrl !== null && ClipThumbnails::videoId($clipUrl) === null) {
            $errors->add('clipUrl', 'invalid');
        }
        $discordChannelId = DiscordLinks::channelField(
            $errors,
            'discordChannelId',
            $input->discordChannelId,
            DiscordLinks::bandServer($this->database),
            is_string($current['discordChannelId'] ?? null) ? $current['discordChannelId'] : null,
        );

        // What the setlist generator reads (model/songs.md, "Setlist attributes").
        if ($input->durationSeconds !== null && ($input->durationSeconds < 10 || $input->durationSeconds > 1200)) {
            $errors->add('durationSeconds', 'invalid');
        }
        $inRepertoireOn = self::day($errors, 'inRepertoireOn', $input->inRepertoireOn);
        // At least one place of a set (model/songs.md, "At least one position").
        if (self::positionsOf($input) === []) {
            $errors->add('positions', 'required');
        }
        $sectionIds = array_map('intval', $this->database->fetchFirstColumn('SELECT id FROM section'));
        foreach (['tiringSectionIds' => $input->tiringSectionIds, 'trickySectionIds' => $input->trickySectionIds] as $field => $ids) {
            if (array_diff($ids, $sectionIds) !== []) {
                $errors->add($field, 'invalid');
            }
        }
        // Set by the app the first time the song enters the repertoire, then
        // corrected by hand (model/songs.md, "Setlist attributes").
        $isEntering = $input->status === SongStatus::IN_REPERTOIRE && ($current['status'] ?? null) !== SongStatus::IN_REPERTOIRE->value;
        if ($inRepertoireOn === null && $isEntering) {
            $inRepertoireOn = (new \DateTimeImmutable('now', new \DateTimeZone(date_default_timezone_get())))->format('Y-m-d');
        }

        // Two songs cannot have the same name, nor the same Discord channel.
        // The database compares without regard to case or accents.
        $name = Text::clean($input->name);
        if ($this->database->fetchOne('SELECT 1 FROM song WHERE name = ? AND id <> ?', [$name, $songId ?? 0]) !== false) {
            $errors->add('name', 'duplicate');
        }
        if ($discordChannelId !== null && $this->database->fetchOne('SELECT 1 FROM song WHERE discordChannelId = ? AND id <> ?', [$discordChannelId, $songId ?? 0]) !== false) {
            $errors->add('discordChannelId', 'duplicate');
        }
        $errors->throwIfAny();

        return [
            'name' => $name,
            'originalTitle' => Text::clean($input->originalTitle),
            'originalArtist' => Text::clean($input->originalArtist),
            'copyright' => $copyright,
            'bpm' => $input->bpm,
            'status' => $input->status->value,
            'versionOn' => $versionOn,
            'versionNote' => $versionNote,
            'clipUrl' => $clipUrl,
            'discordChannelId' => $discordChannelId,
            'durationSeconds' => $input->durationSeconds,
            'inRepertoireOn' => $inRepertoireOn,
            'mood' => $input->mood->value,
        ];
    }

    // The positions and the sections of a song, replaced whole.
    public function saveAttributes(int $songId, SongInput $input, int $memberId): void
    {
        $lists = [
            'songPosition' => ['position', self::positionsOf($input)],
            'songTiringSection' => ['sectionId', array_unique($input->tiringSectionIds)],
            'songTrickySection' => ['sectionId', array_unique($input->trickySectionIds)],
        ];
        foreach ($lists as $table => [$column, $values]) {
            $this->database->delete($table, ['songId' => $songId]);
            foreach ($values as $value) {
                $this->database->insert($table, ['songId' => $songId, $column => $value, 'updatedByMemberId' => $memberId]);
            }
        }
    }

    // A real day, and not in the future. "Today" is not the same day
    // everywhere at once: tomorrow by the clock of the server is accepted.
    private static function day(FieldErrors $errors, string $field, ?string $typed): ?string
    {
        $value = $typed === null || trim($typed) === '' ? null : trim($typed);
        if ($value !== null) {
            $day = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, new \DateTimeZone('UTC'));
            if ($day === false || $day->format('Y-m-d') !== $value || $day > new \DateTimeImmutable('tomorrow', new \DateTimeZone('UTC'))) {
                $errors->add($field, 'invalid');
            }
        }

        return $value;
    }

    /**
     * The positions sent, each once; those of a new song when none were sent.
     *
     * @return list<string>
     */
    private static function positionsOf(SongInput $input): array
    {
        return array_values(array_unique(array_map(
            fn (SetPosition $position) => $position->value,
            $input->positions ?? SetPosition::ofNewSong(),
        )));
    }
}
