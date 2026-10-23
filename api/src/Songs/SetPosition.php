<?php

declare(strict_types=1);

namespace BrassBand\Songs;

// A place of a set where a song can be played (model/songs.dbml, enum
// setPosition; model/songs.md, "Setlist attributes"), in the order of a set.
enum SetPosition: string
{
    case START = 'START';
    case FIRST_HALF = 'FIRST_HALF';
    case MIDDLE = 'MIDDLE';
    case SECOND_HALF = 'SECOND_HALF';
    case END = 'END';

    /**
     * What a new song gets when nothing else is said.
     *
     * @return list<self>
     */
    public static function ofNewSong(): array
    {
        return [self::FIRST_HALF, self::MIDDLE, self::SECOND_HALF];
    }
}
