<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/instruments/{id}/aliases: gives a known spelling to an
// instrument. Asks for MANAGE_SONGS. With "songName", the spelling is what
// is left of the name of a file once the words of the song are taken out:
// the box "Remember this name for next time" of the import. Answers with the
// instrument and its spellings, as in the list.
final class AddAliasAction
{
    public function __construct(private readonly InstrumentAliases $aliases)
    {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $instrumentId = (int) $arguments['id'];
        // 404 before anything is read from the body.
        $this->aliases->of($instrumentId);
        $input = Input::from($request, AliasInput::class);

        $this->aliases->add(
            $instrumentId,
            InstrumentAliases::clean($input->alias, $input->songName),
            CurrentMember::of($request)->id,
        );

        return Json::write($response, $this->aliases->of($instrumentId));
    }
}
