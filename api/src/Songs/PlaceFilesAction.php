<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/songs/fileNames: says where each file dropped on a song would
// go, from its name. Asks for MANAGE_SONGS. It changes nothing: the screen
// shows the answer, the member corrects it, and only then are the files sent.
final class PlaceFilesAction
{
    private const MAX_FILES = 100;

    public function __construct(private readonly FileNames $fileNames)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $names = Input::from($request, FileNamesInput::class)->names;

        $errors = new FieldErrors();
        $tooLong = array_filter($names, fn (string $name) => mb_strlen($name) > 255);
        if (count($names) > self::MAX_FILES || $tooLong !== []) {
            $errors->add('names', 'invalid');
        }
        $errors->throwIfAny();

        return Json::write($response, $this->fileNames->place($names));
    }
}
