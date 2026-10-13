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
        public readonly ?int $bpm = null,
        public readonly ?string $versionOn = null,
        public readonly ?string $versionNote = null,
        public readonly ?string $clipUrl = null,
        public readonly ?string $discordChannelId = null,
    ) {
    }
}
