<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Access\Sessions;
use BrassBand\Gigs\Gigs;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/members/{id}/status: moves a member along their life cycle. Asks
// for MANAGE_MEMBERS. The table below is the one of model/members.md, "Life
// cycle"; INVITED becomes ACTIVE only by the member using their password
// link, never from here.
final class ChangeStatusAction
{
    // Status => the statuses it can be changed to by hand.
    private const TRANSITIONS = [
        'INVITED' => [],
        'ACTIVE' => ['POWER_MEMBER', 'LEFT'],
        'POWER_MEMBER' => ['ACTIVE', 'LEFT'],
        'LEFT' => ['INVITED'],
    ];

    public function __construct(
        private readonly Connection $database,
        private readonly Members $members,
        private readonly Sessions $sessions,
        private readonly PasswordLinks $links,
        private readonly PhotoStore $photos,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $next = Input::from($request, StatusInput::class)->status;

        [$erasedPhoto, $token] = $this->database->transactional(function () use ($me, $next, $arguments): array {
            // Taken first, always in the same order, so that two changes sent
            // at the same instant wait for each other instead of blocking.
            $admins = $this->members->lockCurrentAdmins();
            $target = $this->members->target((int) $arguments['id'], lock: true);

            if (!in_array($next, self::TRANSITIONS[$target['status']] ?? [], true)) {
                throw new ApiError(409, 'invalidTransition');
            }
            Members::mustCover($me, $target);

            return match ($next) {
                'LEFT' => [$this->leave($target['id'], $target['photoPath'], $admins, $me), null],
                'INVITED' => [null, $this->comeBack($target['id'], $me)],
                default => [null, $this->set($target['id'], ['status' => $next], $me)],
            };
        });
        $this->photos->delete($erasedPhoto);

        $member = $this->members->oneVisibleTo($me, (int) $arguments['id']);

        return Json::write($response, $token === null ? $member : [...$member, 'passwordLinkToken' => $token]);
    }

    /**
     * The member leaves: they can no longer sign in, and what served only
     * while they were in the band is erased. Returns the path of the photo
     * to delete once this is saved.
     *
     * @param list<int> $admins The current members who are admin
     */
    private function leave(int $memberId, ?string $photoPath, array $admins, CurrentMember $me): ?string
    {
        // Always one admin: the last one cannot leave.
        if ($admins === [$memberId]) {
            throw new ApiError(409, 'lastAdmin');
        }

        $this->set($memberId, [
            'status' => 'LEFT',
            'mobilePhone' => null,
            'streetAddress' => null,
            'postalCode' => null,
            'city' => null,
            'countryCode' => null,
            'addressInstructions' => null,
            'photoPath' => null,
            // The old password is not reused if they come back.
            'passwordHash' => null,
            'failedSignInCount' => 0,
            'signInLockedUntil' => null,
        ], $me);
        $this->database->delete('memberRole', ['memberId' => $memberId]);
        // What they said of each song served while they played: it goes too
        // (model/songs.md, entry 3).
        $this->database->delete('memberSong', ['memberId' => $memberId]);
        // They no longer organise the gigs that are not over; they stay on
        // those already played (model/gigs.md, entry 1).
        $this->database->executeStatement(
            'DELETE o FROM gigOrganizer o JOIN gig g ON g.id = o.gigId WHERE o.memberId = ? AND COALESCE(g.endsOn, g.startsOn) >= ?',
            [$memberId, Gigs::firstOpenDay()],
        );
        $this->sessions->closeAll($memberId);
        $this->links->cancel($memberId);

        return $photoPath;
    }

    // The member comes back: invited again, with a new password link whose
    // token is returned.
    private function comeBack(int $memberId, CurrentMember $me): string
    {
        $this->set($memberId, ['status' => 'INVITED'], $me);

        return $this->links->create($memberId, $me->id);
    }

    /**
     * @param array<string, int|string|null> $changes
     */
    private function set(int $memberId, array $changes, CurrentMember $me): null
    {
        $this->database->update('member', [...$changes, 'updatedByMemberId' => $me->id], ['id' => $memberId]);

        return null;
    }
}
