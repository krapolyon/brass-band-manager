<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/gigs/{id}/status: moves a gig along its life cycle. For who may
// edit the gig (RequireGigEditor). The statuses that can follow each other
// are in GigStatus::next(), from model/gigs.md, "Life cycle".
//
// A gig set to ACCEPTED while it is already playable is confirmed at once.
// Setting CONFIRMED by hand forces it, playable or not: the screen asks first.
// A confirmed gig put back to ACCEPTED is not confirmed again on the spot,
// which would undo what was just asked: the next answer saved does it, if the
// gig is still playable then (model/gigs.md, "Put back by hand").
// A gig that becomes confirmed, by hand or by the app, is notified (GigPush).
final class ChangeGigStatusAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly Setlists $setlists,
        private readonly GigPush $gigPush,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = (int) $arguments['id'];
        $next = Input::from($request, GigStatusInput::class)->status;

        $confirmed = $this->database->transactional(function () use ($gigId, $next, $me): bool {
            $gig = $this->gigs->row($gigId, lock: true);
            $current = GigStatus::from((string) $gig['status']);
            if (!in_array($next, $current->next(), true)) {
                throw new ApiError(409, 'invalidTransition');
            }
            $this->database->update('gig', ['status' => $next->value, 'updatedByMemberId' => $me->id], ['id' => $gigId]);
            // The first time members see the gig, and never again: a gig that
            // is cancelled then reopened does not become new (model/gigs.md, "New").
            if ($next !== GigStatus::DRAFT && $next !== GigStatus::CANCELLED) {
                $this->database->executeStatement('UPDATE gig SET proposedAt = UTC_TIMESTAMP() WHERE id = ? AND proposedAt IS NULL', [$gigId]);
            }
            // A gig that is no longer confirmed hides its setlists: none stays live.
            if ($next !== GigStatus::CONFIRMED) {
                $this->setlists->endLiveOfGig($gigId);
            }
            if ($current !== GigStatus::CONFIRMED && $this->gigs->confirmIfPlayable($gigId)) {
                return true;
            }

            return $next === GigStatus::CONFIRMED;
        });
        if ($confirmed) {
            $this->gigPush->confirmed($gigId, $me->sessionId);
        }

        return Json::write($response, $this->gigs->one($me, $gigId));
    }
}
