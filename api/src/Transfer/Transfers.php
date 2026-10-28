<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\PasswordLinks;
use BrassBand\Http\ApiError;
use BrassBand\Members\Invitations;
use BrassBand\Members\PersonalData;
use BrassBand\Songs\ClipThumbnails;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;

// What the actions of the export, the import and the reprise share
// (model/export-import.md): opening a zip of the folder "import", telling an
// export from a reprise, reading it for the screen, and loading it.
final class Transfers
{
    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly Files $files,
        private readonly PasswordLinks $links,
        private readonly ClipThumbnails $thumbnails,
        private readonly Invitations $invitations,
        public readonly TransferFolder $folder,
    ) {
    }

    /**
     * Reads a zip for the screen: what it holds and what it would change, or
     * every problem. Nothing is written.
     *
     * @param list<string>|null $parts Null: every part of the file
     * @return array<string, mixed>
     */
    public function read(CurrentMember $me, string $name, ?array $parts): array
    {
        $zip = $this->open($name);
        try {
            if (ExportImport::isExport($zip)) {
                $result = $this->export($zip, $me)->run($parts ?? Exporter::PARTS, dryRun: true, invites: false);
            } elseif (Reprise::isReprise($zip)) {
                $result = (new Reprise($this->database, $this->personal, $zip, $parts ?? array_keys(Reprise::PARTS), $me->id))->read();
            } else {
                $problems = new Problems();
                $problems->add($name, null, null, 'unknownKind');
                $result = ['problems' => $problems, 'summary' => ['kind' => null]];
            }
        } finally {
            $zip->close();
        }
        // A zip with problems is not loaded: the admin corrects the files
        // and drops it again. Kept, it would wait in the folder for nothing.
        if (!$result['problems']->isEmpty()) {
            $this->folder->delete($name);
        }

        return [
            'name' => $name,
            ...$result['summary'],
            'canSendEmail' => $this->invitations->canSend(),
            ...$result['problems']->view(),
        ];
    }

    /**
     * Loads a zip, all or nothing. Refused, with nothing written, when a
     * problem is found. The zip is deleted from the folder, loaded or refused.
     * Returns whether the sessions were ended (an import that holds members).
     *
     * @param list<string> $parts
     */
    public function load(CurrentMember $me, string $name, array $parts, bool $sendInvitations): bool
    {
        $zip = $this->open($name);
        $invites = $sendInvitations && $this->invitations->canSend();
        try {
            if (ExportImport::isExport($zip)) {
                $result = $this->export($zip, $me)->run($parts, dryRun: false, invites: $invites);
                if (!$result['problems']->isEmpty()) {
                    throw new ApiError(422, 'importRefused');
                }
                $tokens = $result['tokens'];
                $endsSessions = $result['members'];
            } elseif (Reprise::isReprise($zip)) {
                $read = (new Reprise($this->database, $this->personal, $zip, $parts, $me->id))->read();
                if (!$read['problems']->isEmpty()) {
                    throw new ApiError(422, 'importRefused');
                }
                $loader = new Loader($this->database, $this->personal, $this->files, $this->links, $this->thumbnails, $zip, $me->id);
                $tokens = $loader->loadReprise($read['plan'], $invites);
                $endsSessions = false;
            } else {
                throw new ApiError(422, 'importRefused');
            }
        } finally {
            $zip->close();
            $this->folder->delete($name);
        }

        // After an import that holds members, every session ends, the one
        // of the admin included: each signs in again with the password of the
        // file (model/export-import.md, "Who, and how").
        if ($endsSessions) {
            $this->database->executeStatement('DELETE FROM memberSession');
        }
        $this->invitations->sendLater($tokens);

        return $endsSessions;
    }

    private function export(\ZipArchive $zip, CurrentMember $me): ExportImport
    {
        $email = $this->personal->opened(['email' => $this->database->fetchOne('SELECT email FROM member WHERE id = ?', [$me->id])])['email'];

        return new ExportImport($this->database, $this->personal, $this->files, $this->links, $zip, $me->id, mb_strtolower((string) $email));
    }

    private function open(string $name): \ZipArchive
    {
        $zip = new \ZipArchive();
        if ($zip->open($this->folder->path($name), \ZipArchive::RDONLY) !== true) {
            throw new ApiError(422, 'notAZip');
        }

        return $zip;
    }
}
