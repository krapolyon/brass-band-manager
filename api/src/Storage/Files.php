<?php

declare(strict_types=1);

namespace BrassBand\Storage;

// The files members give to the app (the logo of the band, the photos of
// members, the files of songs), in the storage folder: a folder next to api/
// that the web server does not serve. A file leaves it only through an action
// of the API, which decides who may read it.
//
// What is written together (a logo and its icons) gets a folder of its own,
// under a name drawn at random, inside an area:
//
//   <storage>/band/3f9c0a1b2c4d5e6f/logo.svg
//   <storage>/members/9a8b7c6d5e4f3a2b/photo.jpg
//   <storage>/songs/5d4c3b2a1f0e9d8c/audio.mp3
//
// The database holds the path of the file, relative to the storage folder.
// Nothing in a path comes from what was sent: the area and the file names are
// written in the code, the folder is random.
final class Files
{
    private const PATH = '#\A[a-z]+/([0-9a-f]{16})(/[A-Za-z0-9.-]+)?\z#';

    public function __construct(private readonly string $folder)
    {
    }

    /**
     * Writes files together in a new folder of an area, and returns the path
     * of that folder, relative to the storage folder: "band/3f9c0a1b2c4d5e6f".
     *
     * @param array<string, string> $files File name => content
     */
    public function write(string $area, array $files): string
    {
        $path = $area . '/' . bin2hex(random_bytes(8));
        $folder = "{$this->folder}/{$path}";
        $this->forbidDirectAccess();
        if (!mkdir($folder, 0o750, true)) {
            throw new \RuntimeException('The storage folder cannot be written to');
        }

        foreach ($files as $name => $content) {
            if (file_put_contents("{$folder}/{$name}", $content) === false) {
                $this->delete($path);
                throw new \RuntimeException('The storage folder cannot be written to');
            }
        }

        return $path;
    }

    // Writes one more file beside a file already kept, in its folder: what
    // is computed from a file and goes when it goes (the peaks of a
    // recording). Returns false when the first file is no longer there.
    public function add(string $path, string $name, string $content): bool
    {
        $file = $this->find($path);

        return $file !== null && file_put_contents(dirname($file) . "/{$name}", $content) !== false;
    }

    // Deletes the folder a path is in, with everything written with it. The
    // path is the one of the folder or of one of its files; anything that is
    // not a path this class wrote is ignored.
    public function delete(?string $path): void
    {
        if ($path === null || preg_match(self::PATH, $path, $found) !== 1) {
            return;
        }
        $folder = "{$this->folder}/" . strtok($path, '/') . "/{$found[1]}";
        foreach (glob("{$folder}/*") ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($folder);
    }

    // Where a file is on the disk, or null when there is no such file.
    public function find(string $path): ?string
    {
        if (preg_match(self::PATH, $path) !== 1) {
            return null;
        }
        $file = "{$this->folder}/{$path}";

        return is_file($file) ? $file : null;
    }

    // The random name of the folder a path is in. It changes each time the
    // file is replaced: put in an address, it lets a browser keep the file.
    public static function version(?string $path): ?string
    {
        return $path !== null && preg_match(self::PATH, $path, $found) === 1 ? $found[1] : null;
    }

    // The storage folder is meant to sit outside what the web server serves.
    // Should a host be set up otherwise, this file tells Apache to serve
    // nothing from it: a file read straight from the folder would arrive
    // without the checks and the protections of the action that serves it.
    private function forbidDirectAccess(): void
    {
        $rule = "{$this->folder}/.htaccess";
        if (!is_file($rule) && (is_dir($this->folder) || mkdir($this->folder, 0o750, true))) {
            file_put_contents($rule, "Require all denied\n");
        }
    }
}
