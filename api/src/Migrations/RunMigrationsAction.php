<?php

declare(strict_types=1);

namespace BrassBand\Migrations;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\CurrentPassword;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/migrations: applies the migrations that wait, for the admin, on a
// host without a command line (model/band.md, "Updating the database").
//
// It changes the tables of the app and cannot be undone: the password is
// asked again, so that a device left signed in is not enough. A wrong one
// counts like a wrong password at sign-in.
//
// The answer says what was applied and, when a script failed, which one and
// what MySQL said: the admin needs it to repair the database. That message is
// answered to the admin only, and is never written to the log.
final class RunMigrationsAction
{
    public function __construct(
        private readonly Migrations $migrations,
        private readonly CurrentPassword $currentPassword,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, RunMigrationsInput::class);

        if (!$this->currentPassword->isRight(CurrentMember::of($request), $input->password)) {
            $errors = new FieldErrors();
            $errors->add('password', 'invalid');
            $errors->throwIfAny();
        }

        $result = $this->migrations->run();
        if ($result['busy']) {
            throw new ApiError(409, 'migrationsRunning');
        }

        return Json::write($response, [
            'applied' => $result['applied'],
            'failed' => $result['failed'],
            'pending' => $this->migrations->pending(),
        ]);
    }
}
