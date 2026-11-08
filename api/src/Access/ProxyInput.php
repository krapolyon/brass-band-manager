<?php

declare(strict_types=1);

namespace BrassBand\Access;

// "Peut répondre pour moi": the member who may answer gigs for the one who
// sends it. Null: nobody.
final class ProxyInput
{
    public function __construct(
        public readonly ?int $proxyMemberId,
    ) {
    }
}
