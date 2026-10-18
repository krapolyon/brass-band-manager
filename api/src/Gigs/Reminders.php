<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Push\NotificationSetting;
use BrassBand\Push\Push;
use BrassBand\Push\PushTexts;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;

// The reminders of gigs (model/gigs.md, rules "Reminder" and "Automatic
// reminders"): a notification to the ACTIVE members who have not answered
// for one slot at least of a gig, by push, email or both as each one chose
// (notifyGigReminder, never off; by email when no device receives). Never to a power member. One
// notification per member, whatever the number of gigs: its text has one line
// per gig. A reminder does not say who sent it.
final class Reminders
{
    public function __construct(
        private readonly Connection $database,
        private readonly Push $push,
    ) {
    }

    /**
     * Reminds for some gigs, at once, and writes when on each of them.
     *
     * @param list<int> $gigIds
     */
    public function send(array $gigIds, ?int $byMemberId): void
    {
        if ($gigIds === []) {
            return;
        }
        $gigs = [];
        foreach ($this->database->fetchAllAssociative(
            'SELECT id, name, startsOn, meetingTime FROM gig WHERE id IN (?) ORDER BY startsOn, id',
            [$gigIds],
            [ArrayParameterType::INTEGER],
        ) as $gig) {
            $gigs[(int) $gig['id']] = $gig;
        }

        // Who has not answered for which gig: no row is no answer.
        $waiting = [];
        foreach ($this->database->fetchAllAssociative(
            "SELECT DISTINCT m.id AS memberId, s.gigId
             FROM gigSlot s
             JOIN member m ON m.status = 'ACTIVE'
             LEFT JOIN gigSlotAttendance a ON a.gigSlotId = s.id AND a.memberId = m.id
             WHERE s.gigId IN (?) AND a.memberId IS NULL",
            [$gigIds],
            [ArrayParameterType::INTEGER],
        ) as $row) {
            $waiting[(int) $row['memberId']][] = (int) $row['gigId'];
        }

        $band = (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1');
        $this->push->toMembers(array_keys($waiting), function (int $memberId, string $language) use ($waiting, $gigs, $band): array {
            // In the order of the gigs: the nearest first.
            $mine = array_values(array_filter(array_keys($gigs), fn (int $gigId) => in_array($gigId, $waiting[$memberId], true)));

            return [
                'title' => PushTexts::text('reminder.title', $language, ['band' => $band]),
                'body' => implode("\n", array_map(fn (int $gigId) => self::line($gigs[$gigId], $language), $mine)),
                'tag' => 'gigReminder',
                'renotify' => true,
                'url' => count($mine) === 1 ? "/gigs/{$mine[0]}" : '/gigs',
            ];
        }, Push::TTL_REMINDER, setting: NotificationSetting::GIG_REMINDER);

        $this->database->executeStatement(
            'UPDATE gig SET remindedAt = ?, updatedByMemberId = ? WHERE id IN (?)',
            [gmdate('Y-m-d H:i:s'), $byMemberId, $gigIds],
            [ParameterType::STRING, $byMemberId === null ? ParameterType::NULL : ParameterType::INTEGER, ArrayParameterType::INTEGER],
        );
    }

    /**
     * The automatic reminders due now: the gigs in PROPOSED and ACCEPTED that
     * start in exactly the first or the second number of days of the band,
     * from the hour of the band on, and that were not reminded today.
     *
     * @return int How many gigs were reminded for
     */
    public function sendDue(\DateTimeImmutable $now): int
    {
        $band = $this->database->fetchAssociative(
            'SELECT gigFirstReminderDays, gigSecondReminderDays, gigReminderHour FROM band WHERE id = 1',
        );
        if ($band === false || (int) $now->format('G') < (int) $band['gigReminderHour']) {
            return 0;
        }
        $days = array_values(array_filter(
            [$band['gigFirstReminderDays'], $band['gigSecondReminderDays']],
            fn (mixed $number) => $number !== null,
        ));
        if ($days === []) {
            return 0;
        }

        // remindedAt is in UTC: the day starts at the midnight of the server's clock.
        $midnight = $now->setTime(0, 0)->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $gigIds = array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            "SELECT id FROM gig
             WHERE status IN ('PROPOSED', 'ACCEPTED') AND startsOn IN (?)
               AND (remindedAt IS NULL OR remindedAt < ?)",
            [array_map(fn (mixed $number) => $now->modify('+' . (int) $number . ' days')->format('Y-m-d'), $days), $midnight],
            [ArrayParameterType::STRING, ParameterType::STRING],
        ));
        $this->send($gigIds, null);

        return count($gigIds);
    }

    /**
     * "Anniversaire de Margaux – sam. 24 oct. – 17 h 30", without the time when it is not known yet.
     *
     * @param array<string, mixed> $gig
     */
    private static function line(array $gig, string $language): string
    {
        $date = PushTexts::date((string) $gig['startsOn'], $language);
        if ($gig['meetingTime'] === null) {
            return PushTexts::text('reminder.lineNoTime', $language, ['name' => (string) $gig['name'], 'date' => $date]);
        }
        $time = PushTexts::time((string) $gig['meetingTime'], $language);

        return PushTexts::text('reminder.line', $language, ['name' => (string) $gig['name'], 'date' => $date, 'time' => $time]);
    }
}
