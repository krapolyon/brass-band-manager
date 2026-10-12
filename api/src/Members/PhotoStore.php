<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Storage\Files;
use BrassBand\Storage\Images;
use Doctrine\DBAL\Connection;

// The profile photos of members: checking what is received, keeping the
// file, finding it again. Rules: model/members.md, "Profile photo".
//
// member.photoPath holds the path of the file in the storage folder:
//
//   members/9a8b7c6d5e4f3a2b/photo.jpg
//
// The browser crops the photo to a square and makes it small before sending
// it, which also removes what a phone writes inside a photo (the place it was
// taken, in particular). The server accepts nothing larger than that.
final class PhotoStore
{
    private const MAX_BYTES = 1_000_000;
    public const SIDE = 512;
    private const MIN_SIDE = 16;

    public function __construct(
        private readonly Connection $database,
        private readonly Files $files,
    ) {
    }

    /**
     * Checks a photo. Reports a problem on $field, or returns the file, ready
     * to be written.
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

        // A PNG, a JPEG or a WebP, whatever its name said; square, and no
        // larger than what the browser is asked to send.
        $read = Images::read($image);
        $isSquare = $read !== null && $read['width'] === $read['height'];
        if ($read === null || !$isSquare || $read['width'] < self::MIN_SIDE || $read['width'] > self::SIDE) {
            $errors->add($field, 'invalid');
            return null;
        }

        return ['extension' => $read['extension'], 'image' => $image];
    }

    /**
     * Gives a member a new photo, or none, and deletes the file of the one
     * they had. Two requests doing this at the same instant go one after the
     * other, so that no file is left behind.
     *
     * @param array{extension: string, image: string}|null $photo
     */
    public function replace(int $memberId, ?array $photo, int $byMemberId): void
    {
        $written = null;
        try {
            $this->database->transactional(function () use ($memberId, $photo, $byMemberId, &$written): void {
                // Holds the row until the end: the next request waits here.
                $member = $this->database->fetchAssociative('SELECT status, photoPath FROM member WHERE id = ? FOR UPDATE', [$memberId]);
                // Judged here, with the row held: the member may have been
                // deleted, or have left, since the request arrived.
                if ($member === false) {
                    throw new ApiError(404, 'notFound');
                }
                if ($member['status'] === 'LEFT') {
                    // The photo of a member who left was erased, and stays so.
                    throw new ApiError(409, 'memberLeft');
                }
                $previous = $member['photoPath'];
                if ($photo !== null) {
                    $name = "photo.{$photo['extension']}";
                    $written = $this->files->write('members', [$name => $photo['image']]) . "/{$name}";
                }
                $this->database->update(
                    'member',
                    ['photoPath' => $written, 'updatedByMemberId' => $byMemberId],
                    ['id' => $memberId],
                );
                $this->delete(is_string($previous) ? $previous : null);
            });
        } catch (\Throwable $failure) {
            // Nothing was saved: the file just written belongs to nobody.
            $this->delete($written);
            throw $failure;
        }
    }

    // Deletes the file of a photo, given the path that was in member.photoPath.
    public function delete(?string $photoPath): void
    {
        $this->files->delete($photoPath);
    }

    // The address of the photo of a member, or null when they have none. The
    // version in it changes with the photo: a browser can keep the file.
    public static function url(int $memberId, mixed $photoPath): ?string
    {
        $version = Files::version(is_string($photoPath) ? $photoPath : null);

        return $version === null ? null : "/api/members/{$memberId}/photo?v={$version}";
    }

    /**
     * The file to serve for a photo path.
     *
     * @return array{file: string, version: string}|null
     */
    public function file(?string $photoPath): ?array
    {
        $version = Files::version($photoPath);
        $file = $photoPath === null ? null : $this->files->find($photoPath);

        return $file === null || $version === null ? null : ['file' => $file, 'version' => $version];
    }
}
