<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\FieldErrors;
use BrassBand\Storage\Files;
use BrassBand\Storage\Images;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;

// The logo of the band and the icons of the installed app: checking what is
// received, keeping the files, finding them again. Rules: model/band.md.
//
// The files are written together in the storage folder (see Files):
//
//   band/3f9c0a1b2c4d5e6f/logo.svg
//   band/3f9c0a1b2c4d5e6f/icon-180.png   (icon-192.png, icon-512.png)
//
// band.logoPath holds the path of the logo.
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
    // 180 is the icon of an iPhone home screen, 192 and 512 those of the manifest.
    public const ICON_SIZES = [180, 192, 512];

    public function __construct(
        private readonly Connection $database,
        private readonly Files $files,
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
        $raster = Images::read($image);
        $extension = $raster['extension'] ?? (Images::isSvg($image) ? 'svg' : null);
        if ($extension === null || ($raster !== null && max($raster['width'], $raster['height']) > self::MAX_SIDE)) {
            $errors->add($field, 'invalid');
            return null;
        }

        $icons = [];
        foreach ([180 => $input->icon180, 192 => $input->icon192, 512 => $input->icon512] as $size => $encoded) {
            $icon = base64_decode($encoded, true);
            if ($icon === false || strlen($icon) > self::ICON_MAX_BYTES || !self::isIcon($icon, $size)) {
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
        $written = ["logo.{$files['extension']}" => $files['image']];
        foreach ($files['icons'] as $size => $icon) {
            $written["icon-{$size}.png"] = $icon;
        }

        return $this->files->write('band', $written) . "/logo.{$files['extension']}";
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

    // Deletes the files of a logo, given the path that was in band.logoPath.
    public function delete(?string $logoPath): void
    {
        $this->files->delete($logoPath);
    }

    // The path of the logo of the band, or null when it has none.
    public function current(): ?string
    {
        try {
            $path = $this->database->fetchOne('SELECT logoPath FROM band WHERE id = 1');
        } catch (TableNotFoundException) {
            // An empty database, before the install: no band, no logo.
            return null;
        }

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
        $version = Files::version($this->current());
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
     * @return array{file: string, version: string}|null
     */
    public function file(?int $iconSize): ?array
    {
        $logoPath = $this->current();
        $version = Files::version($logoPath);
        if ($logoPath === null || $version === null) {
            return null;
        }
        $file = $this->files->find($iconSize === null ? $logoPath : dirname($logoPath) . "/icon-{$iconSize}.png");

        return $file === null ? null : ['file' => $file, 'version' => $version];
    }

    private static function isIcon(string $image, int $side): bool
    {
        $read = Images::read($image);

        return $read !== null && $read['extension'] === 'png' && $read['width'] === $side && $read['height'] === $side;
    }
}
