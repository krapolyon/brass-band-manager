<?php

declare(strict_types=1);

namespace BrassBand\Access;

// The roles a member can hold. Same values as the "role" enum of the model
// (model/members.dbml) and as the memberRole.role column.
//
// Code never asks whether a member holds a role: it asks for a Permission.
enum Role: string
{
    case ADMIN = 'ADMIN';
    case MEMBER_MANAGER = 'MEMBER_MANAGER';
    case SONG_MANAGER = 'SONG_MANAGER';
    case GIG_MANAGER = 'GIG_MANAGER';
    case SETLIST_MANAGER = 'SETLIST_MANAGER';
    case QUOTE_MANAGER = 'QUOTE_MANAGER';
}
