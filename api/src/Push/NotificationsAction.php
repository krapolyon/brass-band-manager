<?php

declare(strict_types=1);

namespace BrassBand\Push;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/me/notifications: the notification settings of the signed-in
// member. PUT sets the seven at once; a channel a setting does not allow
// (the reminders off, the live setlist by email) is refused. Seen and changed by the member only, like
// the other preferences (model/members.md, "Notification settings"): the
// address names nobody.
//
// They are not in GET /api/me on purpose: what sign-in answers must not read
// a column a database not yet migrated lacks (docs/architecture.md, "Not
// locking oneself out").
final class NotificationsAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $me = CurrentMember::of($request);

        if ($request->getMethod() === 'PUT') {
            $input = Input::from($request, NotificationsInput::class);
            $errors = new FieldErrors();
            foreach (NotificationSetting::cases() as $setting) {
                if (!$setting->allows($input->{$setting->column()})) {
                    $errors->add($setting->column(), 'invalid');
                }
            }
            $errors->throwIfAny();
            $this->database->update('member', [...$input->columns(), 'updatedByMemberId' => $me->id], ['id' => $me->id]);
        }

        $columns = implode(', ', array_map(fn (NotificationSetting $setting) => $setting->column(), NotificationSetting::cases()));
        $settings = $this->database->fetchAssociative("SELECT {$columns} FROM member WHERE id = ?", [$me->id]);

        return Json::write($response, $settings === false ? [] : $settings);
    }
}
