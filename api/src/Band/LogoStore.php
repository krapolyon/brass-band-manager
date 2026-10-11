<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\FieldErrors;
use Doctrine\DBAL\Connection;

// The logo of the band and the icons of the installed app: checking what is
// received, keeping the files, finding them again. Rules: model/band.md.
//
// The files live in the storage folder of the app, which is never served by
// the web server: they only leave through ShowLogoAction. Each logo has a
// folder of its own, under a name drawn at random:
//
//   <storage>/band/3f9c0a1b2c4d5e6f/logo.svg
//   <storage>/band/3f9c0a1b2c4d5e6f/icon-180.png   (icon-192.png, icon-512.png)
//
// band.logoPath holds the path of the logo, relative to the storage folder.
// Nothing in a path comes from what was sent: not the name, not the extension.
//
// The icons are drawn by the browser of the admin, which can read the four
// formats, and checked here. The server therefore needs no image library, and
// nothing that a shared host may or may not provide.
final class LogoStore
{
    // 2 MB (model/band.md).
    public const MAX_BYTES = 2_000_000;
    // An icon is a small PNG: far below this.
    private const ICON_MAX_BYTES = 1_000_000;
    // The largest side of a logo, in pixels: beyond it, a file of a few bytes
    // could ask a browser to draw an image of gigabytes.
    private const MAX_SIDE = 4096;
    // The last bytes of every PNG file: its closing chunk.
    private const PNG_END = "IEND\xAE\x42\x60\x82";
    // 180 is the icon of an iPhone home screen, 192 and 512 those of the manifest.
    public const ICON_SIZES = [180, 192, 512];

    private const EXTENSIONS = [
        IMAGETYPE_PNG => 'png',
        IMAGETYPE_JPEG => 'jpg',
        IMAGETYPE_WEBP => 'webp',
    ];

    private const CONTENT_TYPES = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
    ];

    public function __construct(
        private readonly Connection $database,
        private readonly string $folder,
    ) {
    }

    /**
     * Checks a logo and its icons. Reports a problem on $field, or returns
     * the files, ready to be written.
     *
     * @return array{extension: string, image: string, icons: array<int, string>}|null
     */
    public function read(FieldErrors $errors, string $field, LogoInput $input): ?array
    {
        $image = base64_decode($input->image, true);
        if ($image === false || $image === '') {
            $errors->add($field, 'invalid');
            return null;
        }
        if (strlen($image) > self::MAX_BYTES) {
            $errors->add($field, 'tooBig');
            return null;
        }

        // What the file is comes from its content, whatever its name said.
        $extension = self::rasterExtension($image) ?? (self::isSvg($image) ? 'svg' : null);
        if ($extension === null) {
            $errors->add($field, 'invalid');
            return null;
        }

        $icons = [];
        foreach ([180 => $input->icon180, 192 => $input->icon192, 512 => $input->icon512] as $size => $encoded) {
            $icon = base64_decode($encoded, true);
            if ($icon === false || strlen($icon) > self::ICON_MAX_BYTES || !self::isSquarePng($icon, $size)) {
                $errors->add($field, 'invalid');
                return null;
            }
            $icons[$size] = $icon;
        }

        return ['extension' => $extension, 'image' => $image, 'icons' => $icons];
    }

    /**
     * Writes the files of a logo in a new folder and returns the path to save
     * in band.logoPath.
     *
     * @param array{extension: string, image: string, icons: array<int, string>} $files
     */
    public function write(array $files): string
    {
        $version = bin2hex(random_bytes(8));
        $folder = "{$this->folder}/band/{$version}";
        $this->forbidDirectAccess();
        if (!mkdir($folder, 0o750, true)) {
            throw new \RuntimeException('The storage folder cannot be written to');
        }

        $written = [];
        $written[] = file_put_contents("{$folder}/logo.{$files['extension']}", $files['image']);
        foreach ($files['icons'] as $size => $icon) {
            $written[] = file_put_contents("{$folder}/icon-{$size}.png", $icon);
        }
        if (in_array(false, $written, true)) {
            $this->delete("band/{$version}/logo.{$files['extension']}");
            throw new \RuntimeException('The storage folder cannot be written to');
        }

        return "band/{$version}/logo.{$files['extension']}";
    }

    /**
     * Gives the band a new logo, or none, and deletes the files of the one it
     * had. Two requests doing this at the same instant go one after the
     * other: without that, each would delete the logo it saw on arriving and
     * the files of all but one would stay for ever.
     *
     * @param array{extension: string, image: string, icons: array<int, string>}|null $files
     */
    public function replace(?array $files, int $memberId): void
    {
        $written = null;
        try {
            $this->database->transactional(function () use ($files, $memberId, &$written): void {
                // Holds the row until the end: the next request waits here.
                $previous = $this->database->fetchOne('SELECT logoPath FROM band WHERE id = 1 FOR UPDATE');
                $written = $files === null ? null : $this->write($files);
                $this->database->update(
                    'band',
                    ['logoPath' => $written, 'updatedByMemberId' => $memberId],
                    ['id' => 1],
                );
                $this->delete(is_string($previous) ? $previous : null);
            });
        } catch (\Throwable $failure) {
            // Nothing was saved: the files just written belong to no logo.
            $this->delete($written);
            throw $failure;
        }
    }

    // The storage folder is meant to sit outside what the web server serves.
    // Should a host be set up otherwise, this file tells Apache to serve
    // nothing from it: an SVG read straight from the folder would arrive
    // without the protections ShowLogoAction gives it.
    private function forbidDirectAccess(): void
    {
        $rule = "{$this->folder}/.htaccess";
        if (!is_file($rule) && (is_dir($this->folder) || mkdir($this->folder, 0o750, true))) {
            file_put_contents($rule, "Require all denied\n");
        }
    }

    // Deletes the files of a logo, given the path that was in band.logoPath.
    public function delete(?string $logoPath): void
    {
        $version = self::version($logoPath);
        if ($version === null) {
            return;
        }
        $folder = "{$this->folder}/band/{$version}";
        foreach (glob("{$folder}/*") ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($folder);
    }

    // The path of the logo of the band, or null when it has none.
    public function current(): ?string
    {
        $path = $this->database->fetchOne('SELECT logoPath FROM band WHERE id = 1');

        return is_string($path) && $path !== '' ? $path : null;
    }

    /**
     * The addresses of the logo and of the icons, or null when the band has
     * no logo. The version in each address changes with the logo: a browser
     * can keep the file for good, a new logo has a new address.
     *
     * @return array{logoUrl: string, icons: array<int, string>}|null
     */
    public function urls(): ?array
    {
        $version = self::version($this->current());
        if ($version === null) {
            return null;
        }
        $icons = [];
        foreach (self::ICON_SIZES as $size) {
            $icons[$size] = "/api/band/icon/{$size}?v={$version}";
        }

        return ['logoUrl' => "/api/band/logo?v={$version}", 'icons' => $icons];
    }

    /**
     * The file to serve: the logo, or its icon of a given size.
     *
     * @return array{file: string, contentType: string, version: string}|null
     */
    public function file(?int $iconSize): ?array
    {
        $logoPath = $this->current();
        $version = self::version($logoPath);
        if ($logoPath === null || $version === null) {
            return null;
        }

        $path = $iconSize === null ? $logoPath : "band/{$version}/icon-{$iconSize}.png";
        $file = "{$this->folder}/{$path}";
        $contentType = self::CONTENT_TYPES[pathinfo($path, PATHINFO_EXTENSION)] ?? null;
        if ($contentType === null || !is_file($file)) {
            return null;
        }

        return ['file' => $file, 'contentType' => $contentType, 'version' => $version];
    }

    // The folder of a logo, read from its path. Null for anything that is not
    // a path this class wrote.
    private static function version(?string $logoPath): ?string
    {
        if ($logoPath === null || preg_match('#^band/([0-9a-f]{16})/logo\.(png|jpg|webp|svg)\z#', $logoPath, $found) !== 1) {
            return null;
        }

        return $found[1];
    }

    private static function rasterExtension(string $image): ?string
    {
        $size = @getimagesizefromstring($image);
        if ($size === false || max($size[0], $size[1]) > self::MAX_SIDE) {
            return null;
        }
        $extension = self::EXTENSIONS[$size[2]] ?? null;

        // Only the first bytes say what a file is. A PNG must also end as one.
        return $extension === 'png' && !str_ends_with($image, self::PNG_END) ? null : $extension;
    }

    private static function isSquarePng(string $image, int $side): bool
    {
        $size = @getimagesizefromstring($image);

        return $size !== false
            && $size[2] === IMAGETYPE_PNG
            && $size[0] === $side
            && $size[1] === $side
            && str_ends_with($image, self::PNG_END);
    }

    // An SVG is an XML document whose root is <svg>. One that declares a
    // document type is refused: that is where the known attacks on XML
    // readers are written, and a drawing has no use for it. So is one that is
    // not written in UTF-8: another encoding hides such a declaration from
    // the first test below, and the second one is then the only guard.
    private static function isSvg(string $image): bool
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
