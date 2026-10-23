<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/songs/{id}/levels: the member who asks says how well they play a
// song and how much they like playing it. Rules: model/songs.md, entry 3.
//
// The address names no member on purpose: each member sets their own levels
// and nobody else does, an admin included.
//
// Setting, changing or confirming the levels ("Toujours d'accord", the same
// levels sent again) sets ratedOn to the day of the band's clock: the sheet
// asks again once it is more than a year old (issue #44).
final class SetLevelsAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Songs $songs,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $songId = (int) $this->songs->row((int) $arguments['id'])['id'];
        $input = Input::from($request, LevelsInput::class);

        $errors = new FieldErrors();
        foreach (['masteryLevel' => $input->masteryLevel, 'enjoymentLevel' => $input->enjoymentLevel] as $field => $level) {
            if ($level !== null && ($level < 1 || $level > 5)) {
                $errors->add($field, 'invalid');
            }
        }
        $errors->throwIfAny();

        $own = ['memberId' => $me->id, 'songId' => $songId];
        if ($input->masteryLevel === null && $input->enjoymentLevel === null) {
            // Nothing said: nothing kept.
            $this->database->delete('memberSong', $own);
        } else {
            $today = (new \DateTimeImmutable('now', new \DateTimeZone(date_default_timezone_get())))->format('Y-m-d');
            $this->database->executeStatement(
                'INSERT INTO memberSong (memberId, songId, masteryLevel, enjoymentLevel, ratedOn, updatedByMemberId) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE masteryLevel = VALUES(masteryLevel), enjoymentLevel = VALUES(enjoymentLevel), ratedOn = VALUES(ratedOn), updatedByMemberId = VALUES(updatedByMemberId)',
                [$me->id, $songId, $input->masteryLevel, $input->enjoymentLevel, $today, $me->id],
            );
        }

        return Json::write($response, $this->songs->one($me, $songId));
    }
}
