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

// The live session of a setlist (model/gigs.md, entry 4, "Life cycle"). Asks
// for MANAGE_SETLISTS. Answers the setlist.
//
// POST /api/setlists/{id}/live starts it on its first song, and ends any other
// live setlist of the band. PUT moves it to a song: the next one, or the one
// whoever manages setlists stopped on to correct. DELETE ends it.
final class LiveSetlistAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Setlists $setlists,
        private readonly LivePush $livePush,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $setlistId = (int) $arguments['id'];
        $method = $request->getMethod();
        $position = $method === 'PUT' ? Input::from($request, LiveInput::class)->position : null;

        $changed = $this->database->transactional(function () use ($setlistId, $method, $position, $me): bool {
            // One live setlist at most in the band: two starts wait for each
            // other here, on the row of the band, instead of on each other's setlist.
            if ($method === 'POST') {
                $this->database->fetchOne('SELECT id FROM band WHERE id = 1 FOR UPDATE');
            }
            $setlist = $this->setlists->rowShown($setlistId, lock: true);
            $isLive = $setlist['liveStartedAt'] !== null;
            $count = $this->setlists->songCount($setlistId);

            if ($method === 'DELETE') {
                if (!$isLive) {
                    return false;
                }
                $values = ['liveStartedAt' => null, 'livePosition' => null];
            } elseif ($method === 'POST') {
                if ($count === 0) {
                    throw new ApiError(409, 'emptySetlist');
                }
                if ($isLive) {
                    // Pressed twice, or on two phones: it stays where it is.
                    return false;
                }
                // One setlist at most is live in the band.
                $this->database->executeStatement(
                    'UPDATE setlist SET liveStartedAt = NULL, livePosition = NULL WHERE liveStartedAt IS NOT NULL',
                );
                $values = ['liveStartedAt' => gmdate('Y-m-d H:i:s'), 'livePosition' => 1];
            } else {
                if (!$isLive) {
                    throw new ApiError(409, 'setlistNotLive');
                }
                if ($position < 1 || $position > $count) {
                    throw new ApiError(422, 'invalidInput', ['position' => 'invalid']);
                }
                if ((int) $setlist['livePosition'] === $position) {
                    return false;
                }
                $values = ['livePosition' => $position];
            }
            $this->database->update('setlist', [...$values, 'updatedByMemberId' => $me->id], ['id' => $setlistId]);

            return true;
        });

        $setlist = $this->setlists->one($setlistId);
        // A notification to the followers at each change, none when nothing moved.
        if ($changed) {
            $this->livePush->changed($setlist, $me->sessionId);
        }

        return Json::write($response, $setlist);
    }
}
