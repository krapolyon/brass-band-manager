<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Http\Json;
use BrassBand\Mail\Mailer;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/transfer: what the screens "Exporter" and "Importer" show before
// anything is chosen: how much each part holds, and the zips that wait in
// the folder "import". For the admin only.
final class ShowTransferAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly TransferFolder $folder,
        private readonly Mailer $mailer,
        private readonly string $storageFolder,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        // The weight of the files of songs: what makes an export large.
        $bytes = 0;
        foreach (glob("{$this->storageFolder}/songs/*/*") ?: [] as $file) {
            $bytes += (int) filesize($file);
        }

        return Json::write($response, [
            'members' => (int) $this->database->fetchOne("SELECT COUNT(*) FROM member WHERE status <> 'LEFT'"),
            'songs' => (int) $this->database->fetchOne('SELECT COUNT(*) FROM song'),
            'songBytes' => $bytes,
            'gigs' => (int) $this->database->fetchOne('SELECT COUNT(*) FROM gig'),
            'zips' => $this->folder->zips(),
            'canSendEmail' => $this->mailer->canSend(),
        ]);
    }
}
