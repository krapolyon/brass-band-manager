<?php

declare(strict_types=1);

namespace BrassBand\Members;

// A profile photo as the front sends it: the content of the file in base64,
// already cropped to a square and made small by the browser.
final class PhotoInput
{
    public function __construct(
        public readonly string $image,
    ) {
    }
}
