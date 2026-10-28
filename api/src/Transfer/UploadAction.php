<?php

declare(strict_types=1);

namespace BrassBand\Transfer;

use BrassBand\Http\ApiError;
use BrassBand\Http\FileBody;
use BrassBand\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/transfer/upload?name=…: a zip dropped on the screen "Importer",
// sent alone as the body of the request, like a file of a song (FileBody),
// and kept in the folder "import" until it is read and loaded. Up to
// TransferFolder::MAX_UPLOAD_BYTES; a larger one goes by FTP.
final class UploadAction
{
    public function __construct(private readonly TransferFolder $folder)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (strtolower($request->getHeaderLine('Content-Type')) !== FileBody::CONTENT_TYPE) {
            throw new ApiError(400, 'invalidBody');
        }
        $name = $request->getQueryParams()['name'] ?? '';
        $name = is_string($name) && $name !== '' ? $name : 'import.zip';

        return Json::write($response, ['name' => $this->folder->receive($request->getBody(), $name)], 201);
    }
}
