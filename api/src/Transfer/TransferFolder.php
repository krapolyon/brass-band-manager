<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Http\ApiError;
use Psr\Http\Message\StreamInterface;

// The folder "import" at the root of the data folder (bootstrap.php,
// importFolder): where an admin drops a zip by FTP when it is too large for
// the browser, and where a zip sent from the browser is kept between the
// moment it is read and the moment it is imported (model/export-import.md,
// "Who, and how"). A zip is deleted from it once it is imported or refused
// at import. The folder is outside what the web server serves.
//
// A zip is named by its file name alone, never by a path: a name that is not
// a plain file name ending in .zip opens nothing.
final class TransferFolder
{
    // The largest zip the browser may send; a larger one goes by FTP. The
    // host cuts a request after 165 s: on a slow line, 250 MB is about that.
    public const MAX_UPLOAD_BYTES = 250_000_000;
    private const NAME = '/\A[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}\.zip\z/';

    public function __construct(private readonly string $folder)
    {
    }

    /**
     * The zips waiting in the folder, the latest first.
     *
     * @return list<array{name: string, bytes: int, at: string}>
     */
    public function zips(): array
    {
        $zips = [];
        foreach (glob("{$this->folder}/*.zip") ?: [] as $file) {
            $name = basename($file);
            if (preg_match(self::NAME, $name) !== 1 || !is_file($file)) {
                continue;
            }
            $zips[] = ['name' => $name, 'bytes' => (int) filesize($file), 'at' => gmdate('Y-m-d\TH:i:s\Z', (int) filemtime($file))];
        }
        usort($zips, fn (array $a, array $b) => strcmp($b['at'], $a['at']));

        return $zips;
    }

    /** Where a zip of the folder is on the disk; 404 when there is none of that name. */
    public function path(string $name): string
    {
        $file = "{$this->folder}/{$name}";
        if (preg_match(self::NAME, $name) !== 1 || !is_file($file)) {
            throw new ApiError(404, 'notFound');
        }

        return $file;
    }

    /**
     * Keeps a zip sent from the browser, copied piece by piece: it may weigh
     * hundreds of megabytes and is never held whole in memory. Returns its
     * name in the folder.
     */
    public function receive(StreamInterface $body, string $originalName): string
    {
        $this->ensure();
        $base = preg_replace('/[^A-Za-z0-9._()-]+/', '-', pathinfo($originalName, PATHINFO_FILENAME)) ?: 'import';
        $name = substr(trim($base, '.-'), 0, 80) . '-' . bin2hex(random_bytes(3)) . '.zip';
        if (preg_match(self::NAME, $name) !== 1) {
            $name = 'import-' . bin2hex(random_bytes(3)) . '.zip';
        }
        $file = "{$this->folder}/{$name}";
        $out = fopen($file, 'xb');
        if ($out === false) {
            throw new \RuntimeException('The import folder cannot be written to');
        }
        $written = 0;
        try {
            if ($body->isSeekable()) {
                $body->rewind();
            }
            while (!$body->eof()) {
                $piece = $body->read(1 << 20);
                $written += strlen($piece);
                if ($written > self::MAX_UPLOAD_BYTES) {
                    throw new ApiError(413, 'fileTooBig');
                }
                fwrite($out, $piece);
            }
        } catch (\Throwable $failure) {
            fclose($out);
            @unlink($file);
            throw $failure;
        }
        fclose($out);
        if ($written === 0) {
            @unlink($file);
            throw new ApiError(422, 'invalidFile');
        }

        return $name;
    }

    public function delete(string $name): void
    {
        if (preg_match(self::NAME, $name) === 1) {
            @unlink("{$this->folder}/{$name}");
        }
    }

    // A file of its own in the temporary folder of the server, for an
    // export being written. Deleted by whoever asked for it.
    public static function temporary(): string
    {
        $file = tempnam(sys_get_temp_dir(), 'bbm-export-');
        if ($file === false) {
            throw new \RuntimeException('No temporary file');
        }

        return $file;
    }

    private function ensure(): void
    {
        if (!is_dir($this->folder) && !mkdir($this->folder, 0o750, true) && !is_dir($this->folder)) {
            throw new \RuntimeException('The import folder cannot be created');
        }
        // Should a host put it where the web server reaches it: nothing is served.
        $rule = "{$this->folder}/.htaccess";
        if (!is_file($rule)) {
            file_put_contents($rule, "Require all denied\n");
        }
    }
}
