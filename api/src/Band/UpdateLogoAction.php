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
// its icons. Asks for MANAGE_BAND.
final class UpdateLogoAction
{
    public function __construct(private readonly LogoStore $logos)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, LogoInput::class);

        $errors = new FieldErrors();
        $files = $this->logos->read($errors, 'logo', $input);
        $errors->throwIfAny();
        if ($files === null) {
            throw new \LogicException('A logo without error must have been read');
        }

        $this->logos->replace($files, CurrentMember::of($request)->id);

        return Json::write($response, $this->logos->urls());
    }
}
