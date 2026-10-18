<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/band/gigReminders: how many days before a gig its two reminders
// are sent, from which hour, and the time counted between two songs of a
// setlist (the screen "Plans et setlists"). Asks for MANAGE_BAND. Rules:
// model/band.md, "Reminders of a gig" and "Length of a setlist".
final class UpdateGigRemindersAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Bands $bands,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, GigRemindersInput::class);
        $first = $input->gigFirstReminderDays;
        $second = $input->gigSecondReminderDays;

        $errors = new FieldErrors();
        if ($first !== null && ($first < 1 || $first > 90)) {
            $errors->add('gigFirstReminderDays', 'invalid');
        }
        if ($second !== null && ($second < 1 || $second > 90)) {
            $errors->add('gigSecondReminderDays', 'invalid');
        }
        // The second reminder may fall before, after or on the day of the
        // first (Band v1.9): the same day, it is sent once.
        if ($input->gigReminderHour < 0 || $input->gigReminderHour > 23) {
            $errors->add('gigReminderHour', 'invalid');
        }
        if ($input->setlistGapSeconds < 0 || $input->setlistGapSeconds > 300) {
            $errors->add('setlistGapSeconds', 'invalid');
        }
        $errors->throwIfAny();

        $this->database->update(
            'band',
            [
                'gigFirstReminderDays' => $first,
                'gigSecondReminderDays' => $second,
                'gigReminderHour' => $input->gigReminderHour,
                'setlistGapSeconds' => $input->setlistGapSeconds,
                'updatedByMemberId' => CurrentMember::of($request)->id,
            ],
            ['id' => 1],
        );

        return Json::write($response, $this->bands->gigReminders());
    }
}
