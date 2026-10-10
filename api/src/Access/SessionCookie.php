<?php

declare(strict_types=1);

namespace BrassBand\Access;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// The cookie that carries the session token. The only place that knows its
// name and its protections:
//
//   HttpOnly         the code of the page cannot read it, so a script injected
//                    into the page cannot steal the session
//   SameSite=Strict  the browser does not send it with a request that comes
//                    from another site, which is what stops forged requests
//   Secure           it only travels over HTTPS (always on the host)
final class SessionCookie
{
    public function __construct(private readonly bool $secure)
    {
    }

    public function read(ServerRequestInterface $request): ?string
    {
        $value = $request->getCookieParams()[$this->name()] ?? null;

        return is_string($value) ? $value : null;
    }

    public function write(ResponseInterface $response, string $token): ResponseInterface
    {
        return $response->withAddedHeader(
            'Set-Cookie',
            $this->attributes($token, AccessRules::SESSION_MAX_DAYS * 86400),
        );
    }

    public function clear(ResponseInterface $response): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', $this->attributes('', 0));
    }

    // With the __Host- prefix, a browser refuses the cookie unless it is Secure
    // and bound to this exact site: one more barrier, available over HTTPS only.
    private function name(): string
    {
        return $this->secure ? '__Host-session' : 'session';
    }

    private function attributes(string $value, int $maxAge): string
    {
        return sprintf(
            '%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Strict%s',
            $this->name(),
            $value,
            $maxAge,
            $this->secure ? '; Secure' : '',
        );
    }
}
