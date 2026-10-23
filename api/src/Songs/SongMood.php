<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// The mood of a song (model/songs.dbml, enum songMood; model/songs.md,
// "Setlist attributes"): a preference of the setlist generator, never a rule.
// The generator itself runs in the browser (web/src/screens/gigs/generator.ts).
enum SongMood: string
{
    case CHILL = 'CHILL';
    case MEDIUM = 'MEDIUM';
    case PARTY = 'PARTY';
}
