<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Positions;
use BrassBand\Access\AccessRules;
use BrassBand\Access\CurrentMember;
use BrassBand\Access\Permission;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;

// What the actions on gigs share: who sees and who edits a gig, what a gig
// looks like in an answer, and whether it is playable. Rules: model/gigs.md.
//
// A gig in DRAFT is seen by those who may edit it only. Its Discord channel
// is seen by every member who sees it (since 0.3.0). A gig is edited by
// whoever manages gigs and by its organisers. Whether a slot is playable is
// computed from the answers each time it is asked, never stored.
final class Gigs
{
    // The columns are listed one by one on purpose: a column added to the
    // table is never sent by accident.
    private const COLUMNS = 'g.id, g.name, g.status, g.startsOn, g.endsOn, g.meetingTime, g.placeName, g.placeUrl,
        g.streetAddress, g.postalCode, g.city, g.latitude, g.longitude, g.notes, g.discordChannelId, g.remindedAt, g.proposedAt';

    private readonly Setlists $setlists;

    // Where the map of the meeting point reads its tiles when the
    // configuration names no other source (docs/scoping.md, "The map").
    public const DEFAULT_MAP_TILES_URL = 'https://vector.openstreetmap.org/shortbread_v1/tilejson.json';

    /**
     * @param string $mapTilesUrl The TileJSON address of vector tiles in the Shortbread schema; empty, gigs show no map
     */
    public function __construct(
        private readonly Connection $database,
        private readonly string $mapTilesUrl = self::DEFAULT_MAP_TILES_URL,
    ) {
        $this->setlists = new Setlists($database);
    }

    // True when the member manages gigs, or organises this one.
    public function mayEdit(CurrentMember $member, int $gigId): bool
    {
        return $member->can(Permission::MANAGE_GIGS) || $this->database->fetchOne(
            'SELECT 1 FROM gigOrganizer WHERE gigId = ? AND memberId = ?',
            [$gigId, $member->id],
        ) !== false;
    }

    // Refuses with 404 a slot that is not one of this gig: an address that
    // pairs a gig with the slot of another leads nowhere.
    public function mustHaveSlot(int $gigId, int $slotId): void
    {
        if ($this->database->fetchOne('SELECT 1 FROM gigSlot WHERE id = ? AND gigId = ?', [$slotId, $gigId]) === false) {
            throw new ApiError(404, 'notFound');
        }
    }

    /**
     * The row of a gig, as the table holds it. 404 when there is none.
     *
     * @param bool $lock Holds the row until the end of the transaction
     * @return array<string, mixed>
     */
    public function row(int $gigId, bool $lock = false): array
    {
        $gig = $this->database->fetchAssociative(
            'SELECT ' . self::COLUMNS . ' FROM gig g WHERE g.id = ?' . ($lock ? ' FOR UPDATE' : ''),
            [$gigId],
        );
        if ($gig === false) {
            throw new ApiError(404, 'notFound');
        }

        return $gig;
    }

    /**
     * The row of a gig the member may see. A draft does not exist for who
     * cannot edit it: 404, as for a gig that is not there.
     *
     * @return array<string, mixed>
     */
    public function rowVisibleTo(CurrentMember $viewer, int $gigId, bool $lock = false): array
    {
        $gig = $this->row($gigId, $lock);
        if ($gig['status'] === GigStatus::DRAFT->value && !$this->mayEdit($viewer, $gigId)) {
            throw new ApiError(404, 'notFound');
        }

        return $gig;
    }

    // The earliest last day of a gig that is not over yet, as 2026-12-04.
    // THE ONLY PLACE THAT SAYS WHEN A GIG IS OVER, for the list, the answers
    // and the organisers of a member who leaves. "Today" is not the same day
    // everywhere at once: a gig stays open the day after its last day by the
    // clock of the server, so that no time zone closes it early.
    public static function firstOpenDay(): string
    {
        return (new \DateTimeImmutable('yesterday', new \DateTimeZone('UTC')))->format('Y-m-d');
    }

    /**
     * @param array<string, mixed> $gig
     */
    public static function isOver(array $gig): bool
    {
        return (string) ($gig['endsOn'] ?? $gig['startsOn']) < self::firstOpenDay();
    }

    /**
     * The gigs the member sees, the nearest first: what the list shows.
     *
     * Who may edit a gig also gets it once its date has passed while it is
     * still a draft, proposed or accepted: it was not played, and waits to be
     * deleted or cancelled ("to close").
     *
     * @param bool $everything Also the cancelled gigs and those whose last day is behind us
     * @return list<array<string, mixed>>
     */
    public function all(CurrentMember $viewer, bool $everything): array
    {
        $gigs = $this->database->fetchAllAssociative(
            'SELECT g.* FROM (
                SELECT ' . self::COLUMNS . ",
                    (? = 1 OR EXISTS (SELECT 1 FROM gigOrganizer o WHERE o.gigId = g.id AND o.memberId = ?)) AS canEdit
                FROM gig g
             ) g
             WHERE (g.status <> 'DRAFT' OR g.canEdit = 1)
               AND (? = 1 OR (g.status <> 'CANCELLED' AND (
                    COALESCE(g.endsOn, g.startsOn) >= ?
                    OR (g.canEdit = 1 AND g.status IN ('DRAFT', 'PROPOSED', 'ACCEPTED'))
               )))
             ORDER BY g.startsOn, g.id",
            [
                (int) $viewer->can(Permission::MANAGE_GIGS),
                $viewer->id,
                (int) $everything,
                self::firstOpenDay(),
            ],
        );
        $slots = $this->slots($viewer, array_map(fn (array $gig) => (int) $gig['id'], $gigs));

        return array_map(fn (array $gig) => [
            ...self::summary($gig, $slots[(int) $gig['id']] ?? []),
            'canEdit' => (bool) $gig['canEdit'],
        ], $gigs);
    }

    /**
     * One gig, with everything its screen shows.
     *
     * @return array<string, mixed>
     */
    public function one(CurrentMember $viewer, int $gigId): array
    {
        $gig = $this->rowVisibleTo($viewer, $gigId);
        $canEdit = $this->mayEdit($viewer, $gigId);
        $slots = $this->slots($viewer, [$gigId], withAnswers: true)[$gigId] ?? [];

        $serverId = DiscordLinks::bandServer($this->database);
        $channelId = is_string($gig['discordChannelId']) ? $gig['discordChannelId'] : null;
        $view = [
            ...self::summary($gig, $slots),
            'canEdit' => $canEdit,
            'placeUrl' => $gig['placeUrl'],
            'streetAddress' => $gig['streetAddress'],
            'latitude' => $gig['latitude'] === null ? null : (float) $gig['latitude'],
            'longitude' => $gig['longitude'] === null ? null : (float) $gig['longitude'],
            // The map of the meeting point: only a gig that has coordinates has one.
            'mapTilesUrl' => $gig['latitude'] === null || $gig['longitude'] === null || $this->mapTilesUrl === '' ? null : $this->mapTilesUrl,
            'notes' => $gig['notes'],
            // Stored in UTC, sent as an instant the browser reads in its own zone.
            'remindedAt' => $gig['remindedAt'] === null ? null : str_replace(' ', 'T', (string) $gig['remindedAt']) . 'Z',
            // By nickname: an organiser who left the band stays on the gigs already played.
            'organizers' => array_map(
                fn (array $organizer) => ['id' => (int) $organizer['id'], 'nickname' => (string) $organizer['nickname']],
                $this->database->fetchAllAssociative(
                    'SELECT m.id, m.nickname FROM gigOrganizer o JOIN member m ON m.id = o.memberId WHERE o.gigId = ? ORDER BY m.nickname',
                    [$gigId],
                ),
            ),
            'costumes' => array_map(
                fn (array $costume) => [
                    'id' => (int) $costume['id'],
                    'name' => (string) $costume['name'],
                    'pictureUrl' => CostumePictures::url((int) $costume['id'], $costume['imagePath']),
                ],
                $this->database->fetchAllAssociative(
                    'SELECT c.id, c.name, c.imagePath FROM gigCostume gc JOIN costume c ON c.id = gc.costumeId WHERE gc.gigId = ? ORDER BY c.position, c.name',
                    [$gigId],
                ),
            ),
            // Shown from CONFIRMED on: before, the band does not know it plays.
            'setlists' => $gig['status'] === GigStatus::CONFIRMED->value ? $this->setlists->ofGig($gigId) : [],
            // The channel of the gig, for every member who sees it, as a link
            // (since 0.3.0). No link while the band has no server.
            'discordChannelId' => $channelId,
            'discordUrl' => $serverId === null || $channelId === null ? null : DiscordLinks::channelUrl($serverId, $channelId),
            // What the setlist editor counts between two songs
            // (band.setlistGapSeconds), and the length its generator proposes
            // first (band.setlistTargetMinutes, 0.4.0, issue #60).
            ...$this->setlistSettings(),
        ];

        return $view;
    }

    /**
     * @return array{setlistGapSeconds: int, setlistTargetMinutes: int}
     */
    private function setlistSettings(): array
    {
        $band = $this->database->fetchAssociative('SELECT setlistGapSeconds, setlistTargetMinutes FROM band WHERE id = 1');

        return [
            'setlistGapSeconds' => (int) ($band['setlistGapSeconds'] ?? 30),
            'setlistTargetMinutes' => (int) ($band['setlistTargetMinutes'] ?? 45),
        ];
    }

    // True when one slot of the gig has a yes or an "if needed" in every
    // section (model/gigs.md, "Playable", issue #37).
    public function isPlayable(int $gigId): bool
    {
        foreach ($this->missingSections([$gigId]) as $slot) {
            if ($slot['gigId'] === $gigId && $slot['missing'] === []) {
                return true;
            }
        }

        return false;
    }

    /**
     * The names of the sections a gig still lacks, as the card of a gig says
     * it ("Manque : Souba"): those of its first slot, in the order of the
     * band. Empty when it is playable. For the email of a reminder (#65).
     *
     * @return list<string>
     */
    public function missingSectionNames(int $gigId): array
    {
        $first = null;
        foreach ($this->missingSections([$gigId]) as $slot) {
            if ($slot['missing'] === []) {
                return [];
            }
            $first ??= $slot['missing'];
        }
        if ($first === null) {
            return [];
        }

        return array_map(strval(...), $this->database->fetchFirstColumn(
            'SELECT name FROM section WHERE id IN (?) ORDER BY position, name',
            [$first],
            [ArrayParameterType::INTEGER],
        ));
    }

    // The app confirms a gig by itself in one case: it is accepted, and
    // playable. Looked at, inside the transaction that changed something,
    // each time an answer is saved and when a gig becomes accepted. Nothing else changes a
    // status without a member asking, and a confirmed gig never goes back.
    // True when it did confirm the gig.
    public function confirmIfPlayable(int $gigId): bool
    {
        $gig = $this->row($gigId, lock: true);
        if ($gig['status'] === GigStatus::ACCEPTED->value && $this->isPlayable($gigId)) {
            // No author: the app did it.
            $this->database->update('gig', ['status' => GigStatus::CONFIRMED->value, 'updatedByMemberId' => null], ['id' => $gigId]);

            return true;
        }

        return false;
    }

    /**
     * Puts a slot at a place among those of its gig (1 is the first) and
     * numbers them again from 1. Without a slot, only numbers them again.
     */
    public function placeSlot(int $gigId, ?int $slotId, int $position, int $byMemberId): void
    {
        Positions::place($this->database, 'gigSlot', 'gigId = ?', [$gigId], 'id', $slotId, $position, $byMemberId);
    }

    /**
     * For each slot of these gigs: the sections of the band that have
     * nobody, neither a yes nor an "if needed" (model/gigs.md, "Playable",
     * issue #37), and the members thanks to whom the slot is covered: those
     * who answered "if needed" in a section that has no yes.
     *
     * Only the sections that have a current member count, and only the
     * answers of current members: an empty section blocks nothing.
     *
     * @param list<int> $gigIds
     * @return array<int, array{gigId: int, missing: list<int>, thanksTo: list<array{memberId: int, nickname: string, sectionId: int}>}> By slot id
     */
    private function missingSections(array $gigIds): array
    {
        $current = AccessRules::SIGN_IN_STATUSES_SQL;
        $sections = array_map(intval(...), $this->database->fetchFirstColumn(
            "SELECT DISTINCT i.sectionId FROM member m JOIN instrument i ON i.id = m.instrumentId
             WHERE m.status IN ({$current}) ORDER BY i.sectionId",
        ));
        $rows = $this->database->fetchAllAssociative(
            "SELECT s.id AS slotId, s.gigId, a.answer, i.sectionId, m.id AS memberId, m.nickname
             FROM gigSlot s
             LEFT JOIN (gigSlotAttendance a
                 JOIN member m ON m.id = a.memberId AND m.status IN ({$current})
                 JOIN instrument i ON i.id = m.instrumentId
             ) ON a.gigSlotId = s.id AND a.answer IN ('YES', 'IF_NEEDED')
             WHERE s.gigId IN (?)
             ORDER BY m.nickname",
            [$gigIds],
            [ArrayParameterType::INTEGER],
        );

        $yes = [];
        $answered = [];
        $ifNeeded = [];
        $gigOf = [];
        foreach ($rows as $row) {
            $slotId = (int) $row['slotId'];
            $gigOf[$slotId] = (int) $row['gigId'];
            if ($row['answer'] === null) {
                continue;
            }
            $sectionId = (int) $row['sectionId'];
            $answered[$slotId][] = $sectionId;
            if ($row['answer'] === AttendanceAnswer::YES->value) {
                $yes[$slotId][] = $sectionId;
            } else {
                $ifNeeded[$slotId][] = ['memberId' => (int) $row['memberId'], 'nickname' => (string) $row['nickname'], 'sectionId' => $sectionId];
            }
        }

        $slots = [];
        foreach ($gigOf as $slotId => $gigId) {
            $withYes = $yes[$slotId] ?? [];
            $slots[$slotId] = [
                'gigId' => $gigId,
                'missing' => array_values(array_diff($sections, $answered[$slotId] ?? [])),
                // Only the sections that count, and that have no yes.
                'thanksTo' => array_values(array_filter(
                    $ifNeeded[$slotId] ?? [],
                    fn (array $member) => in_array($member['sectionId'], $sections, true) && !in_array($member['sectionId'], $withYes, true),
                )),
            ];
        }

        return $slots;
    }

    /**
     * The slots of these gigs as an answer shows them, by gig, in their order.
     *
     * @param list<int> $gigIds
     * @param bool $withAnswers Also the note of each slot and the answer of every member
     * @return array<int, list<array<string, mixed>>>
     */
    private function slots(CurrentMember $viewer, array $gigIds, bool $withAnswers = false): array
    {
        if ($gigIds === []) {
            return [];
        }
        $missing = $this->missingSections($gigIds);
        $ownSection = (int) $this->database->fetchOne(
            'SELECT i.sectionId FROM member m JOIN instrument i ON i.id = m.instrumentId WHERE m.id = ?',
            [$viewer->id],
        );
        $rows = $this->database->fetchAllAssociative(
            'SELECT s.id, s.gigId, s.name, s.position, s.note, s.costumeId, own.answer AS ownAnswer
             FROM gigSlot s LEFT JOIN gigSlotAttendance own ON own.gigSlotId = s.id AND own.memberId = ?
             WHERE s.gigId IN (?) ORDER BY s.gigId, s.position, s.id',
            [$viewer->id, $gigIds],
            [ParameterType::INTEGER, ArrayParameterType::INTEGER],
        );

        $answers = [];
        if ($withAnswers) {
            $current = AccessRules::SIGN_IN_STATUSES_SQL;
            $given = $this->database->fetchAllAssociative(
                "SELECT a.gigSlotId, a.memberId, a.answer, m.nickname, i.sectionId, m.status IN ({$current}) AS isCurrentMember
                 FROM gigSlotAttendance a
                 JOIN gigSlot s ON s.id = a.gigSlotId
                 JOIN member m ON m.id = a.memberId
                 JOIN instrument i ON i.id = m.instrumentId
                 WHERE s.gigId IN (?) ORDER BY m.nickname",
                [$gigIds],
                [ArrayParameterType::INTEGER],
            );
            foreach ($given as $answer) {
                $answers[(int) $answer['gigSlotId']][] = [
                    'memberId' => (int) $answer['memberId'],
                    // By nickname, so that a member who left still reads on a gig already played.
                    'nickname' => (string) $answer['nickname'],
                    'sectionId' => (int) $answer['sectionId'],
                    'answer' => (string) $answer['answer'],
                    // The answers of a member who left do not count for playability.
                    'isCurrentMember' => (bool) $answer['isCurrentMember'],
                ];
            }
        }

        $slots = [];
        foreach ($rows as $row) {
            $slotId = (int) $row['id'];
            $without = $missing[$slotId]['missing'] ?? [];
            $slot = [
                'id' => $slotId,
                'name' => $row['name'],
                'position' => (int) $row['position'],
                'costumeId' => $row['costumeId'] === null ? null : (int) $row['costumeId'],
                'ownAnswer' => $row['ownAnswer'],
                'isPlayable' => $without === [],
                // The sections with nobody who answered yes or if needed.
                'missingSectionIds' => $without,
                // Who the slot counts on without a yes in their section: the
                // screen names them, so that they can be told they are needed.
                'playableThanksTo' => $missing[$slotId]['thanksTo'] ?? [],
                // The section of the member is the last one without anyone.
                'ownYesMakesPlayable' => !in_array($row['ownAnswer'], [AttendanceAnswer::YES->value, AttendanceAnswer::IF_NEEDED->value], true) && $without === [$ownSection],
            ];
            if ($withAnswers) {
                $slot['note'] = $row['note'];
                $slot['answers'] = $answers[$slotId] ?? [];
            }
            $slots[(int) $row['gigId']][] = $slot;
        }

        return $slots;
    }

    /**
     * @param array<string, mixed> $gig
     * @param list<array<string, mixed>> $slots
     * @return array<string, mixed>
     */
    private static function summary(array $gig, array $slots): array
    {
        return [
            'id' => (int) $gig['id'],
            'name' => $gig['name'],
            'status' => $gig['status'],
            'startsOn' => $gig['startsOn'],
            'endsOn' => $gig['endsOn'],
            // As 18:30: the seconds the database adds mean nothing.
            'meetingTime' => $gig['meetingTime'] === null ? null : substr((string) $gig['meetingTime'], 0, 5),
            'placeName' => $gig['placeName'],
            'postalCode' => $gig['postalCode'],
            'city' => $gig['city'],
            // Playable as soon as one slot is.
            'isPlayable' => array_filter($slots, fn (array $slot) => $slot['isPlayable']) !== [],
            // When members first saw the gig: the home screen marks it as new
            // for 15 days. Null for a gig that has only been a draft.
            'proposedAt' => $gig['proposedAt'] === null ? null : str_replace(' ', 'T', (string) $gig['proposedAt']) . 'Z',
            'slots' => $slots,
        ];
    }
}
