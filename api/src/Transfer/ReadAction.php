<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/transfer/read: reads a zip of the folder "import", an export of
// the app or a reprise, and says what it holds and what it would add and
// update, or every problem with its file and its line. Nothing is written.
final class ReadAction
{
    public function __construct(private readonly Transfers $transfers)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ReadInput::class);

        return Json::write($response, $this->transfers->read(CurrentMember::of($request), $input->name, $input->parts));
    }
}
