<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Push\NotificationSetting;
use BrassBand\Push\Push;
use BrassBand\Push\PushTexts;
use Doctrine\DBAL\Connection;

// The notifications of a gig (model/gigs.md, rule "Notifications of a gig"):
// it became playable, or confirmed. Sent at each such change, to the members
// who organise the gig or answered yes, maybe or if needed on one of its
// slots, and who want it. A notification names the gig and its date, never a
// member. The device that made the change is spared.
final class GigPush
{
    public function __construct(
        private readonly Connection $database,
        private readonly Push $push,
    ) {
    }

    public function playable(int $gigId, int $bySessionId): void
    {
        $this->send($gigId, $bySessionId, NotificationSetting::GIG_PLAYABLE);
    }

    public function confirmed(int $gigId, int $bySessionId): void
    {
        $this->send($gigId, $bySessionId, NotificationSetting::GIG_CONFIRMED);
    }

    private function send(int $gigId, int $bySessionId, NotificationSetting $setting): void
    {
        $gig = $this->database->fetchAssociative('SELECT id, name, status, startsOn, endsOn, meetingTime FROM gig WHERE id = ?', [$gigId]);
        if ($gig === false || !in_array($gig['status'], GigStatus::OPEN, true) || Gigs::isOver($gig)) {
            return;
        }
        $memberIds = array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            "SELECT memberId FROM gigOrganizer WHERE gigId = ?
             UNION
             SELECT a.memberId FROM gigSlotAttendance a JOIN gigSlot s ON s.id = a.gigSlotId
             WHERE s.gigId = ? AND a.answer IN ('YES', 'MAYBE', 'IF_NEEDED')",
            [$gigId, $gigId],
        ));
        $band = (string) $this->database->fetchOne('SELECT name FROM band WHERE id = 1');

        $this->push->toMembers($memberIds, function (int $memberId, string $language) use ($gig, $band, $setting): array {
            $values = ['band' => $band, 'name' => (string) $gig['name'], 'date' => PushTexts::date((string) $gig['startsOn'], $language)];
            if ($setting === NotificationSetting::GIG_PLAYABLE) {
                [$title, $body] = ['gigs.push.playable.title', 'gigs.push.playable.body'];
            } elseif ($gig['meetingTime'] === null) {
                [$title, $body] = ['gigs.push.confirmed.title', 'gigs.push.confirmed.bodyNoTime'];
            } else {
                [$title, $body] = ['gigs.push.confirmed.title', 'gigs.push.confirmed.body'];
                $values['time'] = PushTexts::time((string) $gig['meetingTime'], $language);
            }

            return [
                'title' => PushTexts::text($title, $language, $values),
                'body' => PushTexts::text($body, $language, $values),
                // One per gig: a newer one replaces the older on Android.
                'tag' => "gig{$gig['id']}",
                'renotify' => true,
                'url' => "/gigs/{$gig['id']}",
            ];
        }, Push::TTL_NEWS, setting: $setting, exceptSessionId: $bySessionId);
    }
}
