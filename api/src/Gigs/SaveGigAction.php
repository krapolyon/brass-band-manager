<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\AccessRules;
use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/gigs and PUT /api/gigs/{id}: creates a gig, or saves its whole
// record with its organisers and its costumes. Creating asks for MANAGE_GIGS;
// saving is for who may edit the gig (RequireGigEditor). Rules:
// model/gigs.md, entry 1.
//
// A gig is created in DRAFT with one slot, without a name. Its status and its
// slots have their own addresses.
final class SaveGigAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
    ) {
    }

    /**
     * @param array{id?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = isset($arguments['id']) ? (int) $arguments['id'] : null;
        $isNew = $gigId === null;
        if ($gigId !== null) {
            $this->gigs->row($gigId);
        }
        $input = Input::from($request, GigInput::class);
        $record = $this->check($input, $gigId);
        $organizerIds = array_values(array_unique($input->organizerIds));
        $costumeIds = array_values(array_unique($input->costumeIds));

        try {
            $gigId = $this->database->transactional(function () use ($gigId, $record, $organizerIds, $costumeIds, $me): int {
                $record['updatedByMemberId'] = $me->id;
                if ($gigId === null) {
                    $this->database->insert('gig', $record);
                    $gigId = (int) $this->database->lastInsertId();
                    $this->database->insert('gigSlot', ['gigId' => $gigId, 'position' => 1, 'updatedByMemberId' => $me->id]);
                } else {
                    $this->gigs->row($gigId, lock: true);
                    $this->database->update('gig', $record, ['id' => $gigId]);
                }
                $this->setOrganizers($gigId, $organizerIds, $me);
                $this->setCostumes($gigId, $costumeIds, $me);

                return $gigId;
            });
        } catch (UniqueConstraintViolationException) {
            // Two gigs saved with the same channel at the same instant: the
            // database is the judge.
            throw new ApiError(422, 'invalidInput', ['discordChannelId' => 'duplicate']);
        }

        // An organiser who took themself off a draft no longer sees it: the
        // save is answered all the same, with what is left for them to know.
        if (!$isNew && !$this->gigs->mayEdit($me, $gigId) && $this->gigs->row($gigId)['status'] === GigStatus::DRAFT->value) {
            return Json::write($response, ['id' => $gigId, 'canEdit' => false]);
        }

        return Json::write($response, $this->gigs->one($me, $gigId), $isNew ? 201 : 200);
    }

    /**
     * Checks the record and returns it as it will be saved.
     *
     * @return array<string, mixed>
     */
    private function check(GigInput $input, ?int $gigId): array
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

        $discordChannelId = $errors->optionalText('discordChannelId', $input->discordChannelId, 20);
        if ($discordChannelId !== null && preg_match('/\A[0-9]{17,20}\z/', $discordChannelId) !== 1) {
            $errors->add('discordChannelId', 'invalid');
        }
        if ($discordChannelId !== null && $this->database->fetchOne('SELECT 1 FROM gig WHERE discordChannelId = ? AND id <> ?', [$discordChannelId, $gigId ?? 0]) !== false) {
            $errors->add('discordChannelId', 'duplicate');
        }

        // An organiser is a current member, or is already on the gig: a
        // member who left stays organiser of the gigs already played. A
        // costume is one of the band.
        $current = "'" . implode("', '", AccessRules::SIGN_IN_STATUSES) . "'";
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

    /**
     * @param list<int> $memberIds
     */
    private function setOrganizers(int $gigId, array $memberIds, CurrentMember $me): void
    {
        $current = array_map(intval(...), $this->database->fetchFirstColumn('SELECT memberId FROM gigOrganizer WHERE gigId = ?', [$gigId]));
        foreach (array_diff($current, $memberIds) as $memberId) {
            $this->database->delete('gigOrganizer', ['gigId' => $gigId, 'memberId' => $memberId]);
        }
        foreach (array_diff($memberIds, $current) as $memberId) {
            $this->database->insert('gigOrganizer', ['gigId' => $gigId, 'memberId' => $memberId, 'updatedByMemberId' => $me->id]);
        }
    }

    /**
     * @param list<int> $costumeIds
     */
    private function setCostumes(int $gigId, array $costumeIds, CurrentMember $me): void
    {
        $current = array_map(intval(...), $this->database->fetchFirstColumn('SELECT costumeId FROM gigCostume WHERE gigId = ?', [$gigId]));
        foreach (array_diff($current, $costumeIds) as $costumeId) {
            // A slot chooses its costume among those of the gig: taking one
            // off the gig empties it on the slots that had it.
            $this->database->update('gigSlot', ['costumeId' => null, 'updatedByMemberId' => $me->id], ['gigId' => $gigId, 'costumeId' => $costumeId]);
            $this->database->delete('gigCostume', ['gigId' => $gigId, 'costumeId' => $costumeId]);
        }
        foreach (array_diff($costumeIds, $current) as $costumeId) {
            $this->database->insert('gigCostume', ['gigId' => $gigId, 'costumeId' => $costumeId, 'updatedByMemberId' => $me->id]);
        }
    }
}
