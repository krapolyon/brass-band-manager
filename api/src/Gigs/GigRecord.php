<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\AccessRules;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Text;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

// The record of a gig as it is checked: by the form of a gig (SaveGigAction),
// and by a reprise of spreadsheets (0.4.0, issue #43), so that a gig loaded
// from a file follows the same rules as one typed. Rules: model/gigs.md,
// entry 1.
final class GigRecord
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
    }

    /**
     * Checks the record and returns it as it will be saved.
     *
     * @return array<string, mixed>
     */
    public function check(GigInput $input, ?int $gigId): array
    {
        $errors = new FieldErrors();
        $errors->text('name', $input->name, 80);

        $startsOn = self::day($input->startsOn);
        if ($startsOn === null) {
            $errors->add('startsOn', 'invalid');
        }
        $endsOn = null;
        if ($input->endsOn !== null && trim($input->endsOn) !== '') {
            $endsOn = self::day($input->endsOn);
            if ($endsOn === null || ($startsOn !== null && $endsOn < $startsOn)) {
                $errors->add('endsOn', 'invalid');
            }
            // A gig of one day has no end date.
            $endsOn = $endsOn === $startsOn ? null : $endsOn;
        }
        $meetingTime = $input->meetingTime === null || trim($input->meetingTime) === '' ? null : trim($input->meetingTime);
        if ($meetingTime !== null && preg_match('/\A([01][0-9]|2[0-3]):[0-5][0-9]\z/', $meetingTime) !== 1) {
            $errors->add('meetingTime', 'invalid');
        }

        $placeUrl = $errors->optionalText('placeUrl', $input->placeUrl, 500);
        // A link the screen will open: an https address, nothing else.
        if ($placeUrl !== null && (filter_var($placeUrl, FILTER_VALIDATE_URL) === false || strtolower((string) parse_url($placeUrl, PHP_URL_SCHEME)) !== 'https')) {
            $errors->add('placeUrl', 'invalid');
        }

        // The two coordinates together, or neither.
        if (($input->latitude === null) !== ($input->longitude === null)) {
            $errors->add($input->latitude === null ? 'latitude' : 'longitude', 'required');
        }
        if ($input->latitude !== null && abs($input->latitude) > 90) {
            $errors->add('latitude', 'invalid');
        }
        if ($input->longitude !== null && abs($input->longitude) > 180) {
            $errors->add('longitude', 'invalid');
        }

        // The link of the channel or its identifier, of the server of the band.
        $current = $gigId === null ? null : $this->gigs->row($gigId)['discordChannelId'];
        $discordChannelId = DiscordLinks::channelField(
            $errors,
            'discordChannelId',
            $input->discordChannelId,
            DiscordLinks::bandServer($this->database),
            is_string($current) ? $current : null,
        );
        if ($discordChannelId !== null && $this->database->fetchOne('SELECT 1 FROM gig WHERE discordChannelId = ? AND id <> ?', [$discordChannelId, $gigId ?? 0]) !== false) {
            $errors->add('discordChannelId', 'duplicate');
        }

        // An organiser is a current member, or is already on the gig: a
        // member who left stays organiser of the gigs already played. A
        // costume is one of the band.
        $current = AccessRules::SIGN_IN_STATUSES_SQL;
        $already = array_map(intval(...), $this->database->fetchFirstColumn('SELECT memberId FROM gigOrganizer WHERE gigId = ?', [$gigId ?? 0]));
        $added = array_values(array_diff($input->organizerIds, $already));
        if (!$this->allExist("SELECT COUNT(*) FROM member WHERE status IN ({$current}) AND id IN (?)", $added)) {
            $errors->add('organizerIds', 'invalid');
        }
        if (!$this->allExist('SELECT COUNT(*) FROM costume WHERE id IN (?)', $input->costumeIds)) {
            $errors->add('costumeIds', 'invalid');
        }

        $record = [
            'name' => Text::clean($input->name),
            'startsOn' => $startsOn,
            'endsOn' => $endsOn,
            'meetingTime' => $meetingTime,
            'placeName' => $errors->optionalText('placeName', $input->placeName, 80),
            'placeUrl' => $placeUrl,
            'streetAddress' => $errors->optionalText('streetAddress', $input->streetAddress, 200, lines: true),
            'postalCode' => $errors->optionalText('postalCode', $input->postalCode, 12),
            'city' => $errors->optionalText('city', $input->city, 80),
            'latitude' => $input->latitude === null ? null : round($input->latitude, 6),
            'longitude' => $input->longitude === null ? null : round($input->longitude, 6),
            'notes' => $errors->optionalText('notes', $input->notes, 4000, lines: true),
            'discordChannelId' => $discordChannelId,
        ];
        $errors->throwIfAny();

        return $record;
    }

    // A real day written as 2026-12-04, or null.
    private static function day(string $text): ?string
    {
        $text = trim($text);
        $day = \DateTimeImmutable::createFromFormat('!Y-m-d', $text, new \DateTimeZone('UTC'));

        return $day !== false && $day->format('Y-m-d') === $text ? $text : null;
    }

    /**
     * @param list<int> $ids
     */
    private function allExist(string $countQuery, array $ids): bool
    {
        $ids = array_values(array_unique($ids));

        return $ids === [] || (int) $this->database->fetchOne($countQuery, [$ids], [ArrayParameterType::INTEGER]) === count($ids);
    }
}
