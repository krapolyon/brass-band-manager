<?php

declare(strict_types=1);

namespace BrassBand\Gigs;

use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Members\PhotoInput;
use BrassBand\Storage\Files;
use BrassBand\Storage\Images;
use Doctrine\DBAL\Connection;

// The pictures of costumes: checking what is received, keeping the file,
// finding it again. Rules: model/gigs.md, entry 3.
//
// costume.imagePath holds the path of the file in the storage folder:
//
//   costumes/9a8b7c6d5e4f3a2b/picture.jpg
//
// The largest place a picture is shown is the top of a gig on a phone, 390
// wide on a screen three times as dense: the browser makes it 1200 wide at
// most before sending it, as it does for the photo of a member, and the
// server accepts nothing larger. Nothing on the host has to resize an image.
final class CostumePictures
{
    private const MAX_BYTES = 800_000;
    public const MAX_WIDTH = 1200;
    private const MAX_HEIGHT = 2400;
    private const MIN_SIDE = 16;

    public function __construct(
        private readonly Connection $database,
        private readonly Files $files,
    ) {
    }

    /**
     * Checks a picture. Reports a problem on $field, or returns the file,
     * ready to be written.
     *
     * @return array{extension: string, image: string}|null
     */
    public function read(FieldErrors $errors, string $field, PhotoInput $input): ?array
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
        // A PNG, a JPEG or a WebP, whatever its name said, and no larger than
        // what the browser is asked to send.
        $read = Images::read($image);
        if (
            $read === null
            || min($read['width'], $read['height']) < self::MIN_SIDE
            || $read['width'] > self::MAX_WIDTH
            || $read['height'] > self::MAX_HEIGHT
        ) {
            $errors->add($field, 'invalid');

            return null;
        }

        return ['extension' => $read['extension'], 'image' => $image];
    }

    /**
     * Gives a costume a new picture, or none, and deletes the file of the one
     * it had. Two requests doing this at the same instant go one after the
     * other, so that no file is left behind.
     *
     * @param array{extension: string, image: string}|null $picture
     */
    public function replace(int $costumeId, ?array $picture, int $byMemberId): void
    {
        $written = null;
        try {
            $previous = $this->database->transactional(function () use ($costumeId, $picture, $byMemberId, &$written): ?string {
                // Holds the row until the end: the next request waits here.
                $previous = $this->database->fetchOne('SELECT imagePath FROM costume WHERE id = ? FOR UPDATE', [$costumeId]);
                if ($previous === false) {
                    throw new ApiError(404, 'notFound');
                }
                if ($picture !== null) {
                    $name = "picture.{$picture['extension']}";
                    $written = $this->files->write('costumes', [$name => $picture['image']]) . "/{$name}";
                }
                $this->database->update('costume', ['imagePath' => $written, 'updatedByMemberId' => $byMemberId], ['id' => $costumeId]);

                return is_string($previous) ? $previous : null;
            });
        } catch (\Throwable $failure) {
            // Nothing was saved: the file just written belongs to nobody.
            $this->files->delete($written);

            throw $failure;
        }
        // Once saved, never before: a change that fails keeps its file.
        $this->files->delete($previous);
    }

    public function delete(?string $imagePath): void
    {
        $this->files->delete($imagePath);
    }

    // The address of the picture of a costume, or null when it has none. The
    // version in it changes with the picture: a browser can keep the file.
    public static function url(int $costumeId, mixed $imagePath): ?string
    {
        $version = Files::version(is_string($imagePath) ? $imagePath : null);

        return $version === null ? null : "/api/costumes/{$costumeId}/picture?v={$version}";
    }

    /**
     * The file to serve for a costume.
     *
     * @return array{file: string, version: string}|null
     */
    public function file(int $costumeId): ?array
    {
        $imagePath = $this->database->fetchOne('SELECT imagePath FROM costume WHERE id = ?', [$costumeId]);
        $version = Files::version(is_string($imagePath) ? $imagePath : null);
        $file = is_string($imagePath) ? $this->files->find($imagePath) : null;

        return $file === null || $version === null ? null : ['file' => $file, 'version' => $version];
    }
}
