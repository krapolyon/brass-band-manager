<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PATCH /api/band: changes the name of the band. Asks for MANAGE_BAND.
final class UpdateBandAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, UpdateBandInput::class);

        $errors = new FieldErrors();
        $errors->text('name', $input->name, 80);
        $errors->throwIfAny();

        $name = Text::clean($input->name);
        $this->database->update(
            'band',
            ['name' => $name, 'updatedByMemberId' => CurrentMember::of($request)->id],
            ['id' => 1],
        );

        return Json::write($response, ['name' => $name]);
    }
}
