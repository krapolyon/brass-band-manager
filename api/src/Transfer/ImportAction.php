<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\CurrentPassword;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/transfer/import: loads a zip of the folder "import", all or
// nothing, once the admin confirms with their password. Answers whether the
// sessions ended (an export that holds members): the screen then goes to
// the sign-in. Refused with "importRefused" when a problem is found; the
// screen reads the file again to show them.
final class ImportAction
{
    public function __construct(
        private readonly Transfers $transfers,
        private readonly CurrentPassword $currentPassword,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ImportInput::class);
        $me = CurrentMember::of($request);
        $errors = new FieldErrors();
        if ($input->parts === []) {
            $errors->add('parts', 'required');
        }
        if (!$this->currentPassword->isRight($me, $input->password)) {
            $errors->add('password', 'invalid');
        }
        $errors->throwIfAny();

        $signedOut = $this->transfers->load($me, $input->name, $input->parts, $input->sendInvitations);

        return Json::write($response, ['loaded' => true, 'signedOut' => $signedOut]);
    }
}
