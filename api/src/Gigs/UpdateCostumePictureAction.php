<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Members\PhotoInput;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT and DELETE /api/costumes/{id}/picture: gives a costume its picture,
// replaces it, or removes it. Asks for MANAGE_COSTUMES. Answers with every
// costume, as the other actions on costumes do.
final class UpdateCostumePictureAction
{
    /**
     * @param bool $removes True for the route that removes the picture
     */
    public function __construct(
        private readonly Costumes $costumes,
        private readonly CostumePictures $pictures,
        private readonly bool $removes,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $picture = null;
        if (!$this->removes) {
            $errors = new FieldErrors();
            $picture = $this->pictures->read($errors, 'picture', Input::from($request, PhotoInput::class));
            $errors->throwIfAny();
        }
        $this->pictures->replace((int) $arguments['id'], $picture, CurrentMember::of($request)->id);

        return Json::write($response, $this->costumes->all());
    }
}
