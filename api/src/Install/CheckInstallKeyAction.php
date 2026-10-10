<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/install/key: tells whether a text is the install key.
//
// The welcome screen of the install asks this before the first step, so that
// a wrong key is found at once and not after three steps of typing. It changes
// nothing: the key is checked again when the install is confirmed.
final class CheckInstallKeyAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly InstallKey $installKey,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (InstallStatusAction::isInstalled($this->database)) {
            throw new ApiError(409, 'alreadyInstalled');
        }

        $this->installKey->check(Input::from($request, InstallKeyInput::class)->installKey);

        return Json::write($response, ['valid' => true]);
    }
}
