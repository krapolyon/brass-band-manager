<?php

declare(strict_types=1);

namespace BrassBand\Calendar;

use BrassBand\Push\PushTexts;
use Doctrine\DBAL\Connection;

// The calendar of a member, as iCalendar (RFC 5545): one event per gig they
// come to (model/gigs.md, entry 5, "Calendar feed").
//
// - Gigs in PROPOSED, ACCEPTED or CONFIRMED where the member answered yes,
//   maybe or if needed on one slot at least, whose last day is less than
//   12 months ago. The rest is absent, which removes it from a calendar.
// - Firm when the member said yes on a slot, tentative otherwise.
// - From the meeting time of the first day to midnight at the end of the last
//   day; whole days when there is no meeting time. The meeting time is on the
//   clock of the band (timeZone of config.php): it is written in UTC.
// - SEQUENCE grows with the last change of the gig or of the member's answers,
//   so that a calendar app takes the change.
final class CalendarFeed
{
    private const MONTHS_KEPT = 12;
    // SEQUENCE counts minutes from this day: a small, growing number.
    private const EPOCH = '2026-01-01 00:00:00';

    public function __construct(
        private readonly Connection $database,
        private readonly string $appUrl,
    ) {
    }

    /** A new random token: 32 hexadecimal characters, 128 bits. */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    /**
     * @param string $requestHost The host the calendar app asked, when the configuration gives no address of the app
     */
    public function of(int $memberId, string $language, string $requestHost): string
    {
        $band = (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1');
        $since = (new \DateTimeImmutable('today'))->modify('-' . self::MONTHS_KEPT . ' months')->format('Y-m-d');
        $gigs = $this->database->fetchAllAssociative(
            "SELECT g.id, g.name, g.status, g.startsOn, g.endsOn, g.meetingTime,
                    g.placeName, g.streetAddress, g.postalCode, g.city,
                    MAX(a.answer = 'YES') AS saidYes,
                    GREATEST(g.updatedAt, MAX(a.updatedAt)) AS changedAt
             FROM gig g
             JOIN gigSlot s ON s.gigId = g.id
             JOIN gigSlotAttendance a ON a.gigSlotId = s.id AND a.memberId = ?
             WHERE g.status IN ('PROPOSED', 'ACCEPTED', 'CONFIRMED')
               AND a.answer IN ('YES', 'MAYBE', 'IF_NEEDED')
               AND COALESCE(g.endsOn, g.startsOn) >= ?
             GROUP BY g.id
             ORDER BY g.startsOn, g.id",
            [$memberId, $since],
        );

        $host = (string) (parse_url($this->appUrl, PHP_URL_HOST) ?: $requestHost);
        $now = gmdate('Ymd\THis\Z');
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Brass band manager//Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:' . self::escape($band),
            // How often a calendar app should look again, for those that read it.
            'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
            'X-PUBLISHED-TTL:PT1H',
        ];
        foreach ($gigs as $gig) {
            $lines = [...$lines, ...$this->event($gig, $band, $language, $host, $now)];
        }
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", array_map(self::fold(...), $lines)) . "\r\n";
    }

    /**
     * @param array<string, mixed> $gig
     * @return list<string>
     */
    private function event(array $gig, string $band, string $language, string $host, string $now): array
    {
        $id = (int) $gig['id'];
        $status = (string) $gig['status'];
        $title = $status === 'CONFIRMED'
            ? PushTexts::text('calendar.title', $language, ['band' => $band, 'name' => (string) $gig['name']])
            : PushTexts::text('calendar.titleWithStatus', $language, [
                'band' => $band,
                'status' => PushTexts::text("calendar.status.{$status}", $language),
                'name' => (string) $gig['name'],
            ]);
        $place = implode(', ', array_filter([
            $gig['placeName'],
            is_string($gig['streetAddress']) ? str_replace(["\r\n", "\n"], ', ', $gig['streetAddress']) : null,
            trim(($gig['postalCode'] ?? '') . ' ' . ($gig['city'] ?? '')),
        ], fn (mixed $part) => is_string($part) && trim($part) !== ''));

        $zone = new \DateTimeZone(date_default_timezone_get());
        $utc = new \DateTimeZone('UTC');
        $lastDay = (string) ($gig['endsOn'] ?? $gig['startsOn']);
        $dayAfter = (new \DateTimeImmutable($lastDay))->modify('+1 day');
        if ($gig['meetingTime'] === null) {
            $start = 'DTSTART;VALUE=DATE:' . str_replace('-', '', (string) $gig['startsOn']);
            $end = 'DTEND;VALUE=DATE:' . $dayAfter->format('Ymd');
        } else {
            $meeting = new \DateTimeImmutable($gig['startsOn'] . ' ' . $gig['meetingTime'], $zone);
            $midnight = new \DateTimeImmutable($dayAfter->format('Y-m-d') . ' 00:00:00', $zone);
            $start = 'DTSTART:' . $meeting->setTimezone($utc)->format('Ymd\THis\Z');
            $end = 'DTEND:' . $midnight->setTimezone($utc)->format('Ymd\THis\Z');
        }
        $changed = new \DateTimeImmutable((string) $gig['changedAt'], $utc);
        $sequence = max(0, intdiv($changed->getTimestamp() - (new \DateTimeImmutable(self::EPOCH, $utc))->getTimestamp(), 60));

        return [
            'BEGIN:VEVENT',
            "UID:gig-{$id}@{$host}",
            "DTSTAMP:{$now}",
            "SEQUENCE:{$sequence}",
            $start,
            $end,
            'SUMMARY:' . self::escape($title),
            'STATUS:' . ((int) $gig['saidYes'] === 1 ? 'CONFIRMED' : 'TENTATIVE'),
            ...($place === '' ? [] : ['LOCATION:' . self::escape($place)]),
            ...($this->appUrl === '' ? [] : ['URL:' . rtrim($this->appUrl, '/') . "/gigs/{$id}"]),
            'TRANSP:OPAQUE',
            'END:VEVENT',
        ];
    }

    // A text value: backslashes, commas, semicolons and line breaks escaped.
    private static function escape(string $text): string
    {
        return str_replace(['\\', ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\\,', '\\n', '\\n'], $text);
    }

    // A line longer than 75 bytes continues on the next one, which starts with
    // a space. A character of several bytes is never cut.
    private static function fold(string $line): string
    {
        $out = '';
        $length = 0;
        foreach (mb_str_split($line) as $character) {
            $bytes = strlen($character);
            if ($length + $bytes > 75) {
                $out .= "\r\n ";
                $length = 1;
            }
            $out .= $character;
            $length += $bytes;
        }

        return $out;
    }
}
