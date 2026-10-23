<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// The record of a song, all at once: the form that creates or edits a song
// sends every field, and one left out is erased. The files of a song are not
// part of it: each is sent alone (SongFiles).
final class SongInput
{
    public function __construct(
        public readonly string $name,
        public readonly string $originalTitle,
        public readonly string $originalArtist,
        public readonly SongStatus $status,
        public readonly ?string $copyright = null,
        public readonly ?int $bpm = null,
        public readonly ?string $versionOn = null,
        public readonly ?string $versionNote = null,
        public readonly ?string $clipUrl = null,
        // The link of the channel, or its identifier (DiscordLinks).
        public readonly ?string $discordChannelId = null,
        // m:ss is read by the front: the API receives seconds.
        public readonly ?int $durationSeconds = null,
        public readonly ?string $inRepertoireOn = null,
        public readonly SongMood $mood = SongMood::MEDIUM,
        /** @var list<SetPosition>|null Null: those of a new song */
        public readonly ?array $positions = null,
        /** @var list<int> */
        public readonly array $tiringSectionIds = [],
        /** @var list<int> */
        public readonly array $trickySectionIds = [],
    ) {
    }
}
