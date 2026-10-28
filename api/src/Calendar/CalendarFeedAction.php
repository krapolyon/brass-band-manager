<?php

declare(strict_types=1);

namespace BrassBand\Calendar;

use BrassBand\Access\AccessRules;
use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/calendar/{token}.ics: the gigs of a member, as a calendar app reads
// them (model/gigs.md, entry 5, "Calendar feed"). Public: a calendar app has no
// session. The token is the only key, so the answer is the same "not found"
// whatever is wrong with it (unknown, reset, a member who left): nothing
// tells why. With 32 random characters, trying addresses leads nowhere: it
// needs no wait and no count (routes.php).
//
// Nothing about the token or the feed is written to a log.
final class CalendarFeedAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly CalendarFeed $feed,
    ) {
    }

    /**
     * @param array{token: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $token = $arguments['token'];
        $current = AccessRules::SIGN_IN_STATUSES_SQL;
        $member = preg_match('/^[0-9a-f]{32}$/', $token) === 1 ? $this->database->fetchAssociative(
            "SELECT id, language FROM member WHERE calendarToken = ? AND status IN ({$current})",
            [$token],
        ) : false;
        if ($member === false) {
            throw new ApiError(404, 'notFound');
        }

        $response->getBody()->write($this->feed->of((int) $member['id'], (string) $member['language'], $request->getUri()->getHost()));

        return $response
            ->withHeader('Content-Type', 'text/calendar; charset=utf-8')
            // The gigs of one member: no shared cache keeps them, and no
            // search engine indexes the address.
            ->withHeader('Cache-Control', 'private, max-age=0')
            ->withHeader('X-Robots-Tag', 'noindex')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }
}
