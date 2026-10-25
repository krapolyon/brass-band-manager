<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\FieldErrors;
use BrassBand\Storage\Files;
use BrassBand\Storage\Images;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;

// The logo of the band, its own icon, and the icons of the installed app:
// checking what is received, keeping the files, finding them again. Rules:
// model/band.md ("Icon of the installed app").
//
// Each image is written with its three icons, in a folder of its own in the
// storage folder (see Files):
//
//   band/3f9c0a1b2c4d5e6f/logo.svg
//   band/3f9c0a1b2c4d5e6f/icon-180.png   (icon-192.png, icon-512.png)
//   band/7a6b5c4d3e2f1a0b/appIcon.png
//   band/7a6b5c4d3e2f1a0b/icon-180.png   (icon-192.png, icon-512.png)
//
// band.logoPath and band.iconPath hold the path of each image. The icons the
// app serves are those of iconPath when the band gave one, else those of the
// logo: removing the icon goes back to the icons of the logo.
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
    // The smallest side of the icon of the app: the largest icon is drawn from it.
    public const APP_ICON_MIN_SIDE = 512;

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

        $icons = $this->readIcons($errors, $field, $input);

        return $icons === null ? null : ['extension' => $extension, 'image' => $image, 'icons' => $icons];
    }

    /**
     * @return array<int, string>|null
     */
    private function readIcons(FieldErrors $errors, string $field, LogoInput $input): ?array
    {
        $icons = [];
        foreach ([180 => $input->icon180, 192 => $input->icon192, 512 => $input->icon512] as $size => $encoded) {
            $icon = base64_decode($encoded, true);
            if ($icon === false || strlen($icon) > self::ICON_MAX_BYTES || !self::isIcon($icon, $size)) {
                $errors->add($field, 'invalid');
                return null;
            }
            $icons[$size] = $icon;
        }

        return $icons;
    }

    /**
     * Checks the icon of the app and the three icons drawn from it: a square
     * PNG, JPEG or WebP, 512 pixels a side at least. Reports a problem on
     * $field (invalid, tooBig, notSquare, tooSmall), or returns the files.
     *
     * @return array{extension: string, image: string, icons: array<int, string>}|null
     */
    public function readAppIcon(FieldErrors $errors, string $field, LogoInput $input): ?array
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
        // Never an SVG: a phone wants pixels, and the image is used as it is.
        $raster = Images::read($image);
        if ($raster === null || max($raster['width'], $raster['height']) > self::MAX_SIDE) {
            $errors->add($field, 'invalid');
            return null;
        }
        if ($raster['width'] !== $raster['height']) {
            $errors->add($field, 'notSquare');
            return null;
        }
        if ($raster['width'] < self::APP_ICON_MIN_SIDE) {
            $errors->add($field, 'tooSmall');
            return null;
        }
        $icons = $this->readIcons($errors, $field, $input);

        return $icons === null ? null : ['extension' => $raster['extension'], 'image' => $image, 'icons' => $icons];
    }

    /**
     * Writes the files of a logo in a new folder and returns the path to save
     * in band.logoPath.
     *
     * @param array{extension: string, image: string, icons: array<int, string>} $files
     */
    public function write(array $files, string $name = 'logo'): string
    {
        $written = ["{$name}.{$files['extension']}" => $files['image']];
        foreach ($files['icons'] as $size => $icon) {
            $written["icon-{$size}.png"] = $icon;
        }

        return $this->files->write('band', $written) . "/{$name}.{$files['extension']}";
    }

    /**
     * Gives the band a new logo, or none, and deletes the files of the one it
     * had. Two requests doing this at the same instant go one after the
     * other: without that, each would delete the logo it saw on arriving and
     * the files of all but one would stay for ever.
     *
     * @param array{extension: string, image: string, icons: array<int, string>}|null $files
     */
    public function replace(?array $files, int $memberId, bool $appIcon = false): void
    {
        // Written in the code, never taken from the request.
        [$column, $name] = $appIcon ? ['iconPath', 'appIcon'] : ['logoPath', 'logo'];
        $written = null;
        try {
            $previous = $this->database->transactional(function () use ($files, $memberId, $column, $name, &$written): ?string {
                // Holds the row until the end: the next request waits here.
                $previous = $this->database->fetchOne("SELECT {$column} FROM band WHERE id = 1 FOR UPDATE");
                $written = $files === null ? null : $this->write($files, $name);
                $this->database->update(
                    'band',
                    [$column => $written, 'updatedByMemberId' => $memberId],
                    ['id' => 1],
                );

                return is_string($previous) ? $previous : null;
            });
        } catch (\Throwable $failure) {
            // Nothing was saved: the files just written belong to no logo.
            $this->delete($written);
            throw $failure;
        }
        // Once saved, never before: a change that fails keeps its files.
        $this->delete($previous);
    }

    // Deletes the files of a logo, given the path that was in band.logoPath.
    public function delete(?string $logoPath): void
    {
        $this->files->delete($logoPath);
    }

    /**
     * The addresses of the logo, of the icons of the installed app, and of
     * the icon the band gave (appIconUrl, its largest icon), each null when
     * there is none. The version in each address changes with the file: a
     * browser can keep it for good, a new file has a new address.
     *
     * @return array{logoUrl: string|null, icons: array<int, string>|null, appIconUrl: string|null}
     */
    public function urls(): array
    {
        $paths = $this->paths();
        $logo = Files::version($paths['logoPath']);
        $own = Files::version($paths['iconPath']);
        $version = $own ?? $logo;
        $icons = null;
        if ($version !== null) {
            $icons = [];
            foreach (self::ICON_SIZES as $size) {
                $icons[$size] = "/api/band/icon/{$size}?v={$version}";
            }
        }

        return [
            'logoUrl' => $logo === null ? null : "/api/band/logo?v={$logo}",
            'icons' => $icons,
            'appIconUrl' => $own === null ? null : "/api/band/icon/512?v={$own}",
        ];
    }

    /**
     * The file to serve: the logo, or an icon of the installed app of a given
     * size, from the icon of the band when it gave one.
     *
     * @return array{file: string, version: string}|null
     */
    public function file(?int $iconSize): ?array
    {
        $paths = $this->paths();
        $path = $iconSize === null ? $paths['logoPath'] : ($paths['iconPath'] ?? $paths['logoPath']);
        $version = Files::version($path);
        if ($path === null || $version === null) {
            return null;
        }
        $file = $this->files->find($iconSize === null ? $path : dirname($path) . "/icon-{$iconSize}.png");

        return $file === null ? null : ['file' => $file, 'version' => $version];
    }

    /**
     * @return array{logoPath: string|null, iconPath: string|null}
     */
    private function paths(): array
    {
        try {
            $band = $this->database->fetchAssociative('SELECT * FROM band WHERE id = 1');
        } catch (TableNotFoundException) {
            // An empty database, before the install: no band, no logo.
            $band = false;
        }
        $path = static fn (mixed $value): ?string => is_string($value) && $value !== '' ? $value : null;

        // SELECT *: before migration 014 the column iconPath does not exist,
        // and the sign-in screen still shows the logo.
        return [
            'logoPath' => $band === false ? null : $path($band['logoPath'] ?? null),
            'iconPath' => $band === false ? null : $path($band['iconPath'] ?? null),
        ];
    }

    private static function isIcon(string $image, int $side): bool
    {
        $read = Images::read($image);

        return $read !== null && $read['extension'] === 'png' && $read['width'] === $side && $read['height'] === $side;
    }
}
