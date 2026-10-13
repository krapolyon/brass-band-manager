<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/gigs/{id}/reminder: "Relancer". Sends a notification at once to
// the members who have not answered for the gig, and writes when
// (model/gigs.md, rule "Reminder"). For who may edit the gig
// (RequireGigEditor). Offered on a gig in PROPOSED, ACCEPTED or CONFIRMED that
// is not past: 409 "gigNotReminded" otherwise. Answers the gig.
final class RemindGigAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly Reminders $reminders,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = (int) $arguments['id'];

        $this->database->transactional(function () use ($gigId, $me): void {
            $gig = $this->gigs->row($gigId, lock: true);
            $isOpen = in_array($gig['status'], [GigStatus::PROPOSED->value, GigStatus::ACCEPTED->value, GigStatus::CONFIRMED->value], true);
            if (!$isOpen || Gigs::isOver($gig)) {
                throw new ApiError(409, 'gigNotReminded');
            }
            $this->reminders->send([$gigId], $me->id);
        });

        return Json::write($response, $this->gigs->one($me, $gigId));
    }
}
