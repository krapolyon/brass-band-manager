<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Access\CurrentMember;
use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Routing\RouteContext;

// Lets a request through when the signed-in member may edit the gig the
// address names: they manage gigs, or they organise this one. The one place
// that says so, for every route that changes a gig (model/gigs.md, "Access
// rights").
//
//   $group->put('/api/gigs/{id:[0-9]+}', $save)->add($editGig);
final class RequireGigEditor implements MiddlewareInterface
{
    public function __construct(private readonly Gigs $gigs)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $id = RouteContext::fromRequest($request)->getRoute()?->getArgument('id');

        if (!$this->gigs->mayEdit(CurrentMember::of($request), (int) $id)) {
            throw new ApiError(403, 'forbidden');
        }

        return $handler->handle($request);
    }
}
