<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/songs and PUT /api/songs/{id}: creates a song, or saves its
// whole record. Asks for MANAGE_SONGS. Rules: model/songs.md, entry 1.
//
// The files are not part of the record. The thumbnail of the clip is the
// exception: nobody sends it, the server fetches it when the address of the
// clip changes (ClipThumbnails).
final class SaveSongAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
        private readonly SongFiles $files,
        private readonly ClipThumbnails $thumbnails,
        private readonly SongPush $songPush,
    ) {
    }

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $songId = isset($arguments['id']) ? (int) $arguments['id'] : null;
        $current = $songId === null ? null : $this->songs->row($songId);
        $input = Input::from($request, SongInput::class);
        $record = $this->check($input, $songId, $current);

        // Fetched before anything is saved, and outside the transaction: it
        // asks another server, which can take seconds. Only when the video
        // changes: the thumbnail of the same video is kept.
        $video = $record['clipUrl'] === null ? null : ClipThumbnails::videoId($record['clipUrl']);
        $previousVideo = is_string($current['clipUrl'] ?? null) ? ClipThumbnails::videoId($current['clipUrl']) : null;
        $keepsThumbnail = $video !== null && $video === $previousVideo;
        $thumbnail = $video === null || $keepsThumbnail ? null : $this->thumbnails->fetch($video);

        $written = $thumbnail === null ? null : $this->files->store($thumbnail['name'], $thumbnail['content']);
        try {
            [$songId, $replaced] = $this->database->transactional(function () use ($songId, $record, $keepsThumbnail, $written, $me, $input): array {
                $record['updatedByMemberId'] = $me->id;
                if ($songId === null) {
                    $this->database->insert('song', [...$record, 'clipThumbnailPath' => $written]);
                    $songId = (int) $this->database->lastInsertId();
                    $this->saveAttributes($songId, $input, $me->id);

                    return [$songId, null];
                }
                $this->saveAttributes($songId, $input, $me->id);
                // Read again with the row held: the thumbnail to delete is
                // the one the song has now.
                $previous = $this->songs->row($songId, lock: true)['clipThumbnailPath'];
                if ($keepsThumbnail) {
                    $this->database->update('song', $record, ['id' => $songId]);

                    return [$songId, null];
                }
                $this->database->update('song', [...$record, 'clipThumbnailPath' => $written], ['id' => $songId]);

                return [$songId, is_string($previous) ? $previous : null];
            });
        } catch (\Throwable $failure) {
            $this->files->delete($written);
            // Two songs saved under the same name at the same instant: the
            // database is the judge.
            throw $failure instanceof UniqueConstraintViolationException
                ? new ApiError(422, 'invalidInput', ['name' => 'duplicate'])
                : $failure;
        }
        $this->files->delete($replaced);
        if ($current === null) {
            $this->songPush->created($songId, $me->sessionId);
        }

        return Json::write($response, $this->songs->one($me, $songId), $current === null ? 201 : 200);
    }

    /**
     * Checks the record and returns it as it will be saved.
     *
     * @param array<string, mixed>|null $current
     * @return array<string, mixed>
     */
    private function check(SongInput $input, ?int $songId, ?array $current): array
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

    // The positions and the sections of a song, replaced whole.
    private function saveAttributes(int $songId, SongInput $input, int $memberId): void
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
}
