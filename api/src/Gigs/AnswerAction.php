<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\AccessRules;
use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/gigs/{id}/slots/{slotId}/answer: the member who asks says whether
// they come. The address names no member.
// PUT /api/gigs/{id}/slots/{slotId}/answers/{memberId}: who may edit the gig
// answers for a member who told them, and so does the member that one
// designated (RequireAnswerer on the route, 1.1.0).
//
// With the answer, the instrument the member comes with (1.1.0): their own or
// their secondary one, one choice for the gig, written on each of their
// answers to it (model/gigs.md, "Coming with the other instrument").
// Rules: model/gigs.md, entry 2.
//
// Members answer while the gig is proposed, accepted or confirmed, until it
// is over. An answer can be changed, not taken back. An answer that makes an
// accepted gig playable confirms it. A gig that becomes playable, or
// confirmed, is notified (GigPush): only the confirmation when it is both.
final class AnswerAction
{
    /**
     * @param bool $forAnother The address names the member the answer is for
     */
    public function __construct(
        private readonly Connection $database,
        private readonly Gigs $gigs,
        private readonly GigPush $gigPush,
        private readonly bool $forAnother,
    ) {
    }

    /**
     * @param array{id: string, slotId: string, memberId?: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $gigId = (int) $arguments['id'];
        $slotId = (int) $arguments['slotId'];
        $memberId = $this->forAnother ? (int) ($arguments['memberId'] ?? 0) : $me->id;
        $input = Input::from($request, AnswerInput::class);
        $answer = $input->answer;

        $news = $this->database->transactional(function () use ($me, $gigId, $slotId, $memberId, $answer, $input): ?string {
            $gig = $this->gigs->rowVisibleTo($me, $gigId, lock: true);
            $this->gigs->mustHaveSlot($gigId, $slotId);
            // Only a current member comes to a gig.
            $current = AccessRules::SIGN_IN_STATUSES_SQL;
            $member = $this->database->fetchAssociative(
                "SELECT instrumentId, secondaryInstrumentId FROM member WHERE id = ? AND status IN ({$current})",
                [$memberId],
            );
            if ($member === false) {
                throw new ApiError(404, 'notFound');
            }
            // Their own instrument is written as none: the answer follows it.
            $instrumentId = $input->instrumentId === (int) $member['instrumentId'] ? null : $input->instrumentId;
            if ($instrumentId !== null && $instrumentId !== ($member['secondaryInstrumentId'] === null ? null : (int) $member['secondaryInstrumentId'])) {
                throw new ApiError(400, 'invalidInput');
            }
            if (!in_array($gig['status'], GigStatus::OPEN, true) || Gigs::isOver($gig)) {
                throw new ApiError(409, 'gigNotOpen');
            }

            $wasPlayable = $this->gigs->isPlayable($gigId);
            $this->database->executeStatement(
                'INSERT INTO gigSlotAttendance (gigSlotId, memberId, answer, instrumentId, updatedByMemberId) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE answer = VALUES(answer), instrumentId = VALUES(instrumentId), updatedByMemberId = VALUES(updatedByMemberId)',
                [$slotId, $memberId, $answer->value, $instrumentId, $me->id],
            );
            // One instrument for the whole gig: the other answers follow.
            $this->database->executeStatement(
                'UPDATE gigSlotAttendance a JOIN gigSlot s ON s.id = a.gigSlotId
                 SET a.instrumentId = ?, a.updatedByMemberId = ?
                 WHERE s.gigId = ? AND a.memberId = ? AND a.gigSlotId <> ? AND NOT (a.instrumentId <=> ?)',
                [$instrumentId, $me->id, $gigId, $memberId, $slotId, $instrumentId],
            );
            if ($this->gigs->confirmIfPlayable($gigId)) {
                return 'confirmed';
            }

            return !$wasPlayable && $this->gigs->isPlayable($gigId) ? 'playable' : null;
        });
        if ($news === 'confirmed') {
            $this->gigPush->confirmed($gigId, $me->sessionId);
        } elseif ($news === 'playable') {
            $this->gigPush->playable($gigId, $me->sessionId);
        }

        return Json::write($response, $this->gigs->one($me, $gigId));
    }
}
