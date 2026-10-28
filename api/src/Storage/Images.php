<?php

declare(strict_types=1);

namespace BrassBand\Storage;

use BrassBand\Http\FieldErrors;

// What an image file really is, read from its content: never from the name
// or the type that came with it. Uses only what every PHP has: no image
// library, which a shared host may not provide.
final class Images
{
    private const EXTENSIONS = [
        IMAGETYPE_PNG => 'png',
        IMAGETYPE_JPEG => 'jpg',
        IMAGETYPE_WEBP => 'webp',
    ];

    public const CONTENT_TYPES = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
    ];

    // The last bytes of every PNG file: its closing chunk.
    private const PNG_END = "IEND\xAE\x42\x60\x82";

    // The file an image field sends, written in base64. Reports on $field an
    // image that is not base64 or is empty (invalid), or larger than
    // $maxBytes (tooBig), and returns null; otherwise the bytes of the file.
    public static function decoded(FieldErrors $errors, string $field, string $base64, int $maxBytes): ?string
    {
        $image = base64_decode($base64, true);
        if ($image === false || $image === '') {
            $errors->add($field, 'invalid');

            return null;
        }
        if (strlen($image) > $maxBytes) {
            $errors->add($field, 'tooBig');

            return null;
        }

        return $image;
    }

    /**
     * The format and the size of a PNG, a JPEG or a WebP; null for anything
     * else.
     *
     * @return array{extension: string, width: int, height: int}|null
     */
    public static function read(string $image): ?array
    {
        $size = @getimagesizefromstring($image);
        $extension = $size === false ? null : (self::EXTENSIONS[$size[2]] ?? null);
        if ($size === false || $extension === null) {
            return null;
        }
        // Only the first bytes say what a file is. It must also end as one:
        // a PNG by its closing chunk, a JPEG by its end marker, and a WebP
        // must be as long as its first bytes announce.
        $isWhole = match ($extension) {
            'png' => str_ends_with($image, self::PNG_END),
            'jpg' => str_ends_with($image, "\xFF\xD9"),
            default => strlen($image) >= 12 && (unpack('V', $image, 4) ?: [1 => -1])[1] + 8 === strlen($image),
        };
        if (!$isWhole || $size[0] < 1 || $size[1] < 1) {
            return null;
        }

        return ['extension' => $extension, 'width' => $size[0], 'height' => $size[1]];
    }

    // An SVG is an XML document whose root is <svg>. One that declares a
    // document type is refused: that is where the known attacks on XML
    // readers are written, and a drawing has no use for it. So is one that is
    // not written in UTF-8: another encoding hides such a declaration from
    // the first test below, and the second one is then the only guard.
    public static function isSvg(string $image): bool
    {
        if (stripos($image, '<!DOCTYPE') !== false || stripos($image, '<!ENTITY') !== false) {
            return false;
        }

        $previous = libxml_use_internal_errors(true);
        $document = new \DOMDocument();
        $isXml = $document->loadXML($image, LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $document->documentElement;

        return $isXml
            && $document->doctype === null
            && in_array(strtoupper($document->encoding ?? 'UTF-8'), ['UTF-8', 'US-ASCII'], true)
            && $root !== null
            && $root->localName === 'svg'
            && $root->namespaceURI === 'http://www.w3.org/2000/svg';
    }
}
