<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Gigs\Gigs;
use BrassBand\Mail\EmailBand;
use BrassBand\Mail\EmailLayout;
use BrassBand\Mail\Emails;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;

// The email of a notification (Figma, page Emails, issue #65): the reminder
// to answer, a gig playable or confirmed, a new song, a new MuseScore, a new
// part. A sender describes it in the "email" part of its notification
// (kind, the gigs or the song); this class draws it for one member, in their
// language: a gig as its card shows it in the app, with the answer of that
// member; a song with its name and its artist. The subject is the title of
// the push. A notification without that part gets its push in a sheet.
final class NotificationEmails
{
    private readonly Gigs $gigs;

    // What every email of one notification shares, read for the first
    // recipient and kept for the others: the rows of gigs and songs, and the
    // sections missing for a gig. The answers are the member's own.
    /** @var array<string, mixed> */
    private array $read = [];

    public function __construct(
        private readonly Connection $database,
        private readonly Mailer $mailer,
    ) {
        $this->gigs = new Gigs($database);
    }

    /**
     * @param array<string, mixed> $payload What the push says, with its "email" part
     * @param bool $isChosen The member chose the email; false: a reminder sent for want of a device
     * @return array{subject: string, html: string, text: string}
     */
    public function render(EmailBand $band, int $memberId, string $language, array $payload, bool $isChosen): array
    {
        $title = is_string($payload['title'] ?? null) ? $payload['title'] : '';
        $path = is_string($payload['url'] ?? null) && str_starts_with($payload['url'], '/') ? $payload['url'] : '/';
        $email = is_array($payload['email'] ?? null) ? $payload['email'] : [];
        $kind = is_string($email['kind'] ?? null) ? $email['kind'] : '';
        $gigIds = array_map(intval(...), is_array($email['gigIds'] ?? null) ? $email['gigIds'] : []);
        $values = array_map(strval(...), is_array($email['values'] ?? null) ? $email['values'] : []);

        $paragraphs = [];
        $cards = [];
        switch ($kind) {
            case 'gigReminder':
                $heading = Emails::text('gigReminder.title', $language, count: count($gigIds));
                foreach ($gigIds as $gigId) {
                    $cards[] = $this->gigCard($gigId, $memberId, $language, withPlayability: true);
                }
                break;
            case 'gigPlayable':
            case 'gigConfirmed':
                $heading = Emails::text("{$kind}.title", $language);
                $card = $this->gigCard($gigIds[0] ?? 0, $memberId, $language, withPlayability: $kind === 'gigPlayable');
                if ($kind === 'gigPlayable' || ($card['time'] ?? '') !== '') {
                    $paragraphs[] = Emails::text("{$kind}.lead", $language, ['time' => (string) ($card['time'] ?? '')]);
                }
                $cards[] = $card;
                break;
            case 'songNew':
            case 'songScore':
            case 'songPart':
                $heading = Emails::text("{$kind}.title", $language);
                $songId = (int) ($email['songId'] ?? 0);
                $song = $this->once("song {$songId}", fn () => $this->database->fetchAssociative(
                    'SELECT name, originalArtist FROM song WHERE id = ?',
                    [$songId],
                ));
                if ($song !== false && Emails::has("{$kind}.lead", $language)) {
                    $paragraphs[] = Emails::text("{$kind}.lead", $language, ['name' => (string) $song['name']]);
                }
                if ($song !== false) {
                    $cards[] = [
                        'kind' => 'song',
                        'name' => (string) $song['name'],
                        'artist' => (string) $song['originalArtist'],
                        'chips' => isset($values['instrument']) ? [['tone' => 'neutral', 'text' => $values['instrument']]] : [],
                    ];
                }
                break;
            default:
                $heading = $title;
                $body = is_string($payload['body'] ?? null) ? $payload['body'] : '';
                $paragraphs = $body === '' ? [] : [$body];
        }
        $cards = array_values(array_filter($cards, fn (array $card) => $card !== []));

        return EmailLayout::render($band, $language, [
            'subject' => $title,
            'title' => $heading,
            'paragraphs' => $paragraphs,
            'cards' => $cards,
            'button' => [
                'label' => Emails::has("{$kind}.button", $language) ? Emails::text("{$kind}.button", $language) : Emails::text('common.open', $language),
                'url' => $this->mailer->url($path),
            ],
            'reason' => Emails::text($isChosen ? 'common.reasonChosen' : 'common.reasonWithoutDevice', $language),
            'settingsUrl' => $this->mailer->url('/settings/notifications'),
        ]);
    }

    /**
     * A gig as Gig/Card shows it, for one member: its date, its name, its
     * place, its meeting time, its status and the answer of the member, and
     * whether it is playable when the email is about that.
     *
     * @return array<string, mixed> Empty when the gig is not there
     */
    private function gigCard(int $gigId, int $memberId, string $language, bool $withPlayability): array
    {
        $gig = $this->once("gig {$gigId}", fn () => $this->database->fetchAssociative(
            'SELECT id, name, status, startsOn, meetingTime, placeName, postalCode, city FROM gig WHERE id = ?',
            [$gigId],
        ));
        if ($gig === false) {
            return [];
        }
        $answers = $this->database->fetchFirstColumn(
            'SELECT a.answer FROM gigSlot s
             LEFT JOIN gigSlotAttendance a ON a.gigSlotId = s.id AND a.memberId = ?
             WHERE s.gigId = ? ORDER BY s.position, s.id',
            [$memberId, $gigId],
        );
        $date = new \DateTimeImmutable((string) $gig['startsOn']);
        $time = $gig['meetingTime'] === null ? '' : PushTexts::time((string) $gig['meetingTime'], $language);
        $place = is_string($gig['placeName']) && $gig['placeName'] !== ''
            ? $gig['placeName']
            : trim(($gig['postalCode'] ?? '') . ' ' . ($gig['city'] ?? ''));

        $chips = [];
        $status = (string) $gig['status'];
        if (Emails::has("gig.status.{$status}", $language)) {
            $chips[] = [
                'tone' => match ($status) {
                    'ACCEPTED' => 'info',
                    'CONFIRMED' => 'success',
                    default => 'neutral',
                },
                'text' => Emails::text("gig.status.{$status}", $language),
            ];
        }
        // The answer of the member: "À répondre" while one slot waits for it.
        $chips[] = in_array(null, $answers, true) || $answers === []
            ? ['tone' => 'accent', 'text' => Emails::text('gig.toAnswer', $language)]
            : ['tone' => 'neutral', 'text' => Emails::text('gig.answer.' . $answers[0], $language)];

        $banner = null;
        if ($withPlayability) {
            $missing = $this->once("missing {$gigId}", fn () => $this->gigs->missingSectionNames($gigId));
            $banner = $missing === []
                ? ['tone' => 'success', 'text' => Emails::text('gig.playable', $language)]
                : ['tone' => 'warning', 'text' => Emails::text('gig.missing', $language, ['sections' => implode(', ', $missing)])];
        }

        return [
            'kind' => 'gig',
            'weekday' => explode(',', PushTexts::text('days', $language))[(int) $date->format('w')] ?? '',
            'day' => $date->format('j'),
            'month' => explode(',', PushTexts::text('months', $language))[(int) $date->format('n') - 1] ?? '',
            'name' => (string) $gig['name'],
            'place' => $place,
            'meeting' => $time === '' ? '' : Emails::text('gig.meeting', $language, ['time' => $time]),
            'time' => $time,
            'chips' => $chips,
            'banner' => $banner,
        ];
    }

    /**
     * @template T
     * @param callable(): T $read
     * @return T
     */
    private function once(string $key, callable $read): mixed
    {
        if (!array_key_exists($key, $this->read)) {
            $this->read[$key] = $read();
        }

        return $this->read[$key];
    }
}
