<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\Permission;
use BrassBand\Access\Role;
use BrassBand\Push\Push;
use BrassBand\Push\PushTexts;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

// The notification of the live setlist (model/gigs.md, entry 4, "Life
// cycle"): at each change, the members who said yes to the slot of the
// setlist are told the song being played and the two after it. On an iPhone
// notifications pile up, so each one reads on its own: its title starts with
// the position. On Android it replaces the one before (same tag), and shows
// "Suivant" to who manages setlists.
final class LivePush
{
    public function __construct(
        private readonly Connection $database,
        private readonly Push $push,
    ) {
    }

    /**
     * @param array<string, mixed> $setlist The setlist as it is now, as Setlists::one() gives it
     */
    public function changed(array $setlist): void
    {
        $followers = array_map(fn (mixed $id) => (int) $id, $this->database->fetchFirstColumn(
            "SELECT memberId FROM gigSlotAttendance WHERE gigSlotId = ? AND answer = 'YES'",
            [$setlist['gigSlotId']],
        ));
        if ($followers === []) {
            return;
        }

        // Who may move the setlist on from the notification.
        $roles = [];
        foreach ($this->database->fetchAllAssociative(
            'SELECT memberId, role FROM memberRole WHERE memberId IN (?)',
            [$followers],
            [ArrayParameterType::INTEGER],
        ) as $row) {
            $role = Role::tryFrom((string) $row['role']);
            if ($role !== null) {
                $roles[(int) $row['memberId']][] = $role;
            }
        }

        $position = $setlist['livePosition'] === null ? null : (int) $setlist['livePosition'];
        /** @var list<array{position: int, songId: int, name: string}> $songs */
        $songs = $setlist['songs'];
        $count = count($songs);
        $setlistId = (int) $setlist['id'];
        $gigId = (int) $setlist['gigId'];

        $this->push->toMembers($followers, function (int $memberId, string $language) use ($setlistId, $gigId, $position, $songs, $count, $roles): array {
            $base = ['tag' => 'liveSetlist', 'renotify' => false];
            if ($position === null) {
                return [...$base, 'title' => PushTexts::text('live.ended', $language), 'body' => '', 'url' => "/gigs/{$gigId}"];
            }

            $name = $songs[$position - 1]['name'] ?? '';
            $then = array_map(fn (array $song) => $song['name'], array_slice($songs, $position, 2));
            $isLast = $position >= $count;
            $mayMove = Permission::MANAGE_SETLISTS->isGrantedTo($roles[$memberId] ?? []);

            return [
                ...$base,
                'title' => PushTexts::text($isLast ? 'live.titleLast' : 'live.title', $language, ['position' => $position, 'count' => $count, 'name' => $name]),
                'body' => $then === [] ? '' : PushTexts::text('live.then', $language, ['names' => implode(' · ', $then)]),
                'url' => "/setlists/{$setlistId}/live",
                // Stays on the screen until the next one replaces it.
                'requireInteraction' => true,
                ...($mayMove && !$isLast ? [
                    'actions' => [['action' => 'next', 'title' => PushTexts::text('live.next', $language)]],
                    'data' => ['setlistId' => $setlistId, 'position' => $position],
                ] : []),
            ];
        }, Push::TTL_LIVE, topic: 'liveSetlist');
    }
}
