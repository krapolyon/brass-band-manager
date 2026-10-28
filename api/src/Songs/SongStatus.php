<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// The statuses of a song, as in model/songs.dbml. Every status can follow
// every other, and none changes by itself (model/songs.md, "Life cycle").
enum SongStatus: string
{
    case PROPOSED = 'PROPOSED';
    case IN_PROGRESS = 'IN_PROGRESS';
    case IN_REPERTOIRE = 'IN_REPERTOIRE';
    case TEMPORARY = 'TEMPORARY';
    case ABANDONED = 'ABANDONED';
}
