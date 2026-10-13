<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/install: tells whether the app has been installed.
// While it has not, also gives the languages the install can be done in and
// the starting library of sections and instruments, in the language asked
// with ?language=fr. The library says which of its instruments are preselected
// (model/members.md, "Starting library").
final class InstallStatusAction
{
    public function __construct(private readonly Connection $database)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (self::isInstalled($this->database)) {
            return Json::write($response, ['installed' => true]);
        }

        $language = $request->getQueryParams()['language'] ?? Languages::DEFAULT;

        return Json::write($response, [
            'installed' => false,
            'languages' => Languages::AVAILABLE,
            'library' => Languages::instrumentLibrary(is_string($language) ? $language : Languages::DEFAULT),
        ]);
    }

    // The app is installed as soon as a member exists (model/members.md, "Install").
    //
    // Marked impure: it reads the database, so asking twice can give two answers.
    /** @phpstan-impure */
    public static function isInstalled(Connection $database): bool
    {
        try {
            return (int) $database->fetchOne('SELECT COUNT(*) FROM member') > 0;
        } catch (TableNotFoundException) {
            // An empty database: the install applies the migrations first.
            return false;
        }
    }
}
