<?php

declare(strict_types=1);

namespace BrassBand\Songs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/songs/{id}/audio/peaks: keeps the outline of the recording of a
// song, which the screen draws as bars. Asks for MANAGE_SONGS. The browser
// that sends a recording computes it once and sends it right after: the
// server has nothing to read a recording with.
final class SavePeaksAction
{
    public function __construct(
        private readonly Songs $songs,
        private readonly SongFiles $files,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $input = Input::from($request, PeaksInput::class);
        $peaks = $input->peaks;

        $errors = new FieldErrors();
        $outOfRange = array_filter($peaks, fn (int $peak) => $peak < 0 || $peak > 100);
        if ($peaks === [] || count($peaks) > SongFiles::MAX_PEAKS || $outOfRange !== []) {
            $errors->add('peaks', 'invalid');
        }
        $errors->throwIfAny();

        $this->files->savePeaks((int) $arguments['id'], $peaks, $input->version);

        return Json::write($response, $this->songs->one(CurrentMember::of($request), (int) $arguments['id']));
    }
}
