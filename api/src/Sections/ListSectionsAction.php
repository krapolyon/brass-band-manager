<?php

declare(strict_types=1);

namespace BrassBand\Sections;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\Permission;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/sections: the sections of the band and their instruments, in the
// order of the band. For every signed-in member. Whoever manages sections is
// also told what keeps an instrument from being deleted.
final class ListSectionsAction
{
    public function __construct(private readonly Sections $sections)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::write($response, $this->sections->all(CurrentMember::of($request)->can(Permission::MANAGE_SECTIONS)));
    }
}
