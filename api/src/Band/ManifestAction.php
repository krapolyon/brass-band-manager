<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET /api/manifest: what a phone reads to install the app: its name and its
// icons. Both are those of the band (model/band.md). Before the install, and
// for a band without a logo, the app keeps its neutral name and icons.
//
// Public: a device reads it without being signed in.
final class ManifestAction
{
    // The name of the app before a band has given it its own.
    private const NEUTRAL_NAME = 'Brass band';

    public function __construct(
        private readonly Connection $database,
        private readonly LogoStore $logos,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $name = $this->database->fetchOne('SELECT name FROM band WHERE id = 1');
        } catch (TableNotFoundException) {
            // An empty database, before the install: the neutral name and icons.
            $name = false;
        }
        $name = is_string($name) ? $name : self::NEUTRAL_NAME;
        $icons = $this->logos->urls()['icons'] ?? [
            192 => '/appIcons/icon-192.png',
            512 => '/appIcons/icon-512.png',
        ];

        return Json::write($response, [
            'name' => $name,
            'short_name' => $name,
            'start_url' => '/',
            'scope' => '/',
            'display' => 'standalone',
            'icons' => [
                ['src' => $icons[192], 'sizes' => '192x192', 'type' => 'image/png'],
                ['src' => $icons[512], 'sizes' => '512x512', 'type' => 'image/png'],
            ],
        ])
            ->withHeader('Content-Type', 'application/manifest+json; charset=utf-8')
            // Read again each time: the name and the icons can change.
            ->withHeader('Cache-Control', 'no-cache');
    }
}
