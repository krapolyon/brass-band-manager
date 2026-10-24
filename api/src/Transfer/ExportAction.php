<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Access\CurrentMember;
use BrassBand\Access\CurrentPassword;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Members\PersonalData;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/transfer/export: the zip of the parts ticked, as a download
// (model/export-import.md). The password of the admin is asked again: the
// file holds the personal data of the members. Nothing is kept on the
// server afterwards.
final class ExportAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly PersonalData $personal,
        private readonly Files $files,
        private readonly CurrentPassword $currentPassword,
        private readonly string $appVersion,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, ExportInput::class);
        $me = CurrentMember::of($request);
        $errors = new FieldErrors();
        $parts = array_values(array_intersect(Exporter::PARTS, $input->parts));
        if ($parts === []) {
            $errors->add('parts', 'required');
        }
        if (!$this->currentPassword->isRight($me, $input->password)) {
            $errors->add('password', 'invalid');
        }
        $errors->throwIfAny();

        $email = (string) $this->personal->opened(['email' => $this->database->fetchOne('SELECT email FROM member WHERE id = ?', [$me->id])])['email'];
        $exporter = new Exporter($this->database, $this->personal, $this->files);
        $file = TransferFolder::temporary();
        try {
            $exporter->write($file, $parts, $email, $this->appVersion);
        } catch (\Throwable $failure) {
            @unlink($file);
            throw $failure;
        }

        return TransferActions::download($response, $file, $exporter->fileName());
    }
}
