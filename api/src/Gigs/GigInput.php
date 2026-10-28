<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

// The record of a gig, all at once: the form sends every field, and one left
// out is erased. The status and the slots are not part of it: each has its
// own address.
final class GigInput
{
    /**
     * @param string $startsOn A day, as 2026-12-04
     * @param string|null $meetingTime A time of the day, as 18:30
     * @param list<int> $organizerIds The members who organise the gig
     * @param list<int> $costumeIds The costumes to bring
     */
    public function __construct(
        public readonly string $name,
        public readonly string $startsOn,
        public readonly ?string $endsOn = null,
        public readonly ?string $meetingTime = null,
        public readonly ?string $placeName = null,
        public readonly ?string $placeUrl = null,
        public readonly ?string $streetAddress = null,
        public readonly ?string $postalCode = null,
        public readonly ?string $city = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?string $notes = null,
        public readonly ?string $discordChannelId = null,
        public readonly array $organizerIds = [],
        public readonly array $costumeIds = [],
    ) {
    }
}
