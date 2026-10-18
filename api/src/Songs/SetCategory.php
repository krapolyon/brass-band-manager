<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// What a song brings to a set, for the setlist generator (model/songs.dbml,
// enum setCategory; model/songs.md, "Setlist attributes"). The generator
// itself runs in the browser (web/src/screens/gigs/generator.ts).
enum SetCategory: string
{
    case OPENER = 'OPENER';
    case PARTY = 'PARTY';
    case KNOWN = 'KNOWN';
    case CHOREOGRAPHY = 'CHOREOGRAPHY';
    case CHILL = 'CHILL';
    case ENCORE = 'ENCORE';
    case STANDARD = 'STANDARD';
}
