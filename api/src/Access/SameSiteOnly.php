<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

// Refuses a request that changes something when a browser says it was sent by
// another site. This is a second barrier against forged requests, behind the
// SameSite=Strict of the session cookie. Applied to the whole API.
//
// Browsers announce where a request comes from with the Sec-Fetch-Site header,
// and older ones with Origin. A client that sends neither is not a browser
// acting for a member behind their back, and is let through: it still needs a
// session to do anything.
final class SameSiteOnly implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!in_array($request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true) && !$this->isFromThisSite($request)) {
            throw new ApiError(403, 'crossSiteRequest');
        }

        return $handler->handle($request);
    }

    private function isFromThisSite(ServerRequestInterface $request): bool
    {
        $site = $request->getHeaderLine('Sec-Fetch-Site');
        if ($site !== '') {
            return $site === 'same-origin';
        }

        $origin = $request->getHeaderLine('Origin');
        if ($origin !== '') {
            // Compared on the host name only. The port and the scheme the
            // server believes it is reached on are not reliable behind the
            // HTTPS front of a shared host, and a wrong guess would refuse
            // every member using an older browser.
            return parse_url($origin, PHP_URL_HOST) === $request->getUri()->getHost();
        }

        return true;
    }
}
