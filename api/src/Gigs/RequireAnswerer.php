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

// Lets a request through when the signed-in member may note the answer of the
// member the address names, on the gig it names: who may edit the gig, or the
// member designated by that member (Gigs::mayAnswerFor, 1.1.0).
//
//   $group->put('/api/gigs/{id}/slots/{slotId}/answers/{memberId}', $answer)->add($answerFor);
final class RequireAnswerer implements MiddlewareInterface
{
    public function __construct(private readonly Gigs $gigs)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $route = RouteContext::fromRequest($request)->getRoute();
        $gigId = (int) $route?->getArgument('id');
        $memberId = (int) $route?->getArgument('memberId');

        if (!$this->gigs->mayAnswerFor(CurrentMember::of($request), $gigId, $memberId)) {
            throw new ApiError(403, 'forbidden');
        }

        return $handler->handle($request);
    }
}
