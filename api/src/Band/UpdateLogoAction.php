<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/band/logo: gives the band a logo, or replaces the one it has, with
// its icons. PUT /api/band/appIcon: the same for the icon of the installed app
// (issue #34). Both ask for MANAGE_BAND.
final class UpdateLogoAction
{
    public function __construct(
        private readonly LogoStore $logos,
        private readonly bool $appIcon = false,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, LogoInput::class);

        $errors = new FieldErrors();
        $files = $this->appIcon
            ? $this->logos->readAppIcon($errors, 'appIcon', $input)
            : $this->logos->read($errors, 'logo', $input);
        $errors->throwIfAny();
        if ($files === null) {
            throw new \LogicException('A logo without error must have been read');
        }

        $this->logos->replace($files, CurrentMember::of($request)->id, $this->appIcon);

        return Json::write($response, $this->logos->urls());
    }
}
