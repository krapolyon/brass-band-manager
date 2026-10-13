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
final class ChangeGigStatusAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
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

        $this->database->transactional(function () use ($gigId, $next, $me): void {
            $gig = $this->gigs->row($gigId, lock: true);
            if (!in_array($next, GigStatus::from((string) $gig['status'])->next(), true)) {
                throw new ApiError(409, 'invalidTransition');
            }
            $this->database->update('gig', ['status' => $next->value, 'updatedByMemberId' => $me->id], ['id' => $gigId]);
            $this->gigs->confirmIfPlayable($gigId);
        });

        return Json::write($response, $this->gigs->one($me, $gigId));
    }
}
