<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT and DELETE /api/members/{id}/photo: gives a member a profile photo,
// replaces it, or removes it. A member does it for themself; who holds
// MANAGE_MEMBERS does it for anyone.
final class UpdatePhotoAction
{
    /**
     * @param bool $removes True for the route that removes the photo
     */
    public function __construct(
        private readonly Members $members,
        private readonly PhotoStore $photos,
        private readonly bool $removes,
    ) {
    }

    /**
     * @param array{id: string} $arguments
     */
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $arguments): ResponseInterface
    {
        $me = CurrentMember::of($request);
        $target = $this->members->target((int) $arguments['id']);

        $photo = null;
        if (!$this->removes) {
            $errors = new FieldErrors();
            $photo = $this->photos->read($errors, 'photo', Input::from($request, PhotoInput::class));
            $errors->throwIfAny();
        }
        $this->photos->replace($target['id'], $photo, $me->id);

        return Json::write($response, $this->members->oneVisibleTo($me, $target['id']));
    }
}
