<?php

declare(strict_types=1);

namespace BrassBand\Band;

// A logo as the front sends it: the image file, and the three square icons the
// front has drawn from it. Each one is the content of a file, in base64: the
// API receives JSON and nothing else (see Input).
final class LogoInput
{
    public function __construct(
        public readonly string $image,
        public readonly string $icon180,
        public readonly string $icon192,
        public readonly string $icon512,
    ) {
    }
}
