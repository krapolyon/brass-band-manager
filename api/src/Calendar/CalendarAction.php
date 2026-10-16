<?php

declare(strict_types=1);

namespace BrassBand\Calendar;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// The personal calendar address of the signed-in member (model/members.md,
// "Calendar address"). The address names nobody: a member reaches their own
// only, and nobody else ever sees it, an admin included.
//
// GET /api/me/calendar answers the token, or null when the member never asked.
// POST creates it when there is none, and answers the one there is otherwise:
// the screen asks it when the member copies the address or adds it.
// PUT replaces it ("Réinitialiser la synchro"): the old address answers
// nothing from this instant.
//
// Not in GET /api/me: what sign-in answers must not read a column a database
// not yet migrated lacks (docs/architecture.md, "Not locking oneself out").
final class CalendarAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $method = $request->getMethod();

        if ($method === 'POST') {
            $this->database->executeStatement(
                'UPDATE member SET calendarToken = ?, updatedByMemberId = ? WHERE id = ? AND calendarToken IS NULL',
                [CalendarFeed::newToken(), $me->id, $me->id],
            );
        } elseif ($method === 'PUT') {
            $this->database->update('member', ['calendarToken' => CalendarFeed::newToken(), 'updatedByMemberId' => $me->id], ['id' => $me->id]);
        }

        $token = $this->database->fetchOne('SELECT calendarToken FROM member WHERE id = ?', [$me->id]);

        return Json::write($response, ['token' => is_string($token) ? $token : null]);
    }
}
