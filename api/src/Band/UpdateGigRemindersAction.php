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
// are sent, and from which hour. Asks for MANAGE_BAND. Rules: model/band.md,
// "Reminders of a gig". The reminders themselves are not sent yet: these are
// the settings they will read.
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
        // The second reminder comes after the first: fewer days before the gig.
        if ($first !== null && $second !== null && $second >= $first) {
            $errors->add('gigSecondReminderDays', 'invalid');
        }
        if ($input->gigReminderHour < 0 || $input->gigReminderHour > 23) {
            $errors->add('gigReminderHour', 'invalid');
        }
        $errors->throwIfAny();

        $this->database->update(
            'band',
            [
                'gigFirstReminderDays' => $first,
                'gigSecondReminderDays' => $second,
                'gigReminderHour' => $input->gigReminderHour,
                'updatedByMemberId' => CurrentMember::of($request)->id,
            ],
            ['id' => 1],
        );

        return Json::write($response, $this->bands->gigReminders());
    }
}
