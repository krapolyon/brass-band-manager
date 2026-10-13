<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/band/gigReminders: how many days before a gig its two reminders
// are sent, and from which hour. Asks for MANAGE_BAND: only the screen that
// sets them reads them, so they are not part of the public answer of the band.
final class ShowGigRemindersAction
{
    public function __construct(private readonly Bands $bands)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->bands->gigReminders());
    }
}
