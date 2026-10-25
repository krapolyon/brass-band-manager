<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Members\PersonalData;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/me/password: the signed-in member changes their password. Asks for
// the current one: a device left signed in is not enough to take the account.
// Every other device of the member is signed out (model/members.md).
//
// A wrong current password counts like a wrong password at sign-in
// (CurrentPassword).
final class ChangePasswordAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly PasswordLinks $links,
        private readonly CurrentPassword $currentPassword,
        private readonly PersonalData $personal,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ChangePasswordInput::class);
        $me = CurrentMember::of($request);

        $errors = $this->database->transactional(function () use ($input, $me): FieldErrors {
            $errors = new FieldErrors();
            if (!$this->currentPassword->isRight($me, $input->currentPassword)) {
                $errors->add('currentPassword', 'invalid');

                return $errors;
            }

            Passwords::check($errors, 'newPassword', $input->newPassword, PasswordContext::ofMember($this->database, $this->personal, $me->id));
            if ($errors->isEmpty()) {
                $this->database->update(
                    'member',
                    [
                        'passwordHash' => Passwords::hash($input->newPassword),
                        'failedSignInCount' => 0,
                        'updatedByMemberId' => $me->id,
                    ],
                    ['id' => $me->id],
                );
                $this->database->executeStatement(
                    'DELETE FROM memberSession WHERE memberId = ? AND id <> ?',
                    [$me->id, $me->sessionId],
                );
                // A link asked for a forgotten password has no use left.
                $this->links->cancel($me->id);
            }

            return $errors;
        });
        // Refused once the count of wrong passwords is saved, not before.
        $errors->throwIfAny();

        return Json::write($response, ['changed' => true]);
    }
}
