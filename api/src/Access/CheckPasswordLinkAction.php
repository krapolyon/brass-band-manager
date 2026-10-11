<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\ApiError;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Members\PhotoStore;
use BrassBand\Sections\Sections;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/passwordLink/check: says whether a password link still opens
// something, and for whom. Changes nothing.
//
// Public: whoever holds the link is not signed in yet. The token travels in
// the body, never in an address, where it would end in the log of the server.
// Every link that opens nothing gets the same answer.
//
// What it answers depends on who the link is for (model/members.md, entry 3):
//   - a current member who forgot their password: their nickname, nothing else;
//   - an invited member: their own record as whoever invited them filled it
//     in, so that they can check and complete it, with their photo and the
//     instruments of the band to choose from. Whoever holds this link can
//     already take the account: the record gives away nothing more.
final class CheckPasswordLinkAction
{
    private const RECORD = 'nickname, firstName, lastName, email, mobilePhone, streetAddress,
        postalCode, city, countryCode, addressInstructions, instrumentId, photoPath';

    public function __construct(
        private readonly Connection $database,
        private readonly PasswordLinks $links,
        private readonly PhotoStore $photos,
        private readonly Sections $sections,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $link = $this->links->find(Input::from($request, PasswordLinkInput::class)->token);
        if ($link === null) {
            throw new ApiError(404, 'invalidPasswordLink');
        }
        if ($link['status'] !== 'INVITED') {
            return Json::write($response, ['isInvitation' => false, 'nickname' => $link['nickname']]);
        }

        $member = $this->database->fetchAssociative(
            'SELECT ' . self::RECORD . ' FROM member WHERE id = ? AND status = ?',
            [$link['memberId'], 'INVITED'],
        );
        if ($member === false) {
            throw new ApiError(404, 'invalidPasswordLink');
        }
        $photoPath = $member['photoPath'];
        unset($member['photoPath']);
        $member['instrumentId'] = (int) $member['instrumentId'];

        // Flat, in the order of the band: sections are not group titles where
        // one instrument is chosen.
        $instruments = [];
        foreach ($this->sections->all() as $section) {
            foreach ($section['instruments'] as $instrument) {
                $instruments[] = ['id' => $instrument['id'], 'name' => $instrument['name']];
            }
        }

        return Json::write($response, [
            'isInvitation' => true,
            'nickname' => $link['nickname'],
            'member' => $member,
            'photo' => $this->photo(is_string($photoPath) ? $photoPath : null),
            'instruments' => $instruments,
        ]);
    }

    // The photo itself, inside the answer: the address of a photo is for
    // signed-in members, and a link must not travel in an address.
    private function photo(?string $photoPath): ?string
    {
        $file = $this->photos->file($photoPath);
        if ($file === null) {
            return null;
        }
        $type = match (strtolower(pathinfo($file['file'], PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return "data:{$type};base64," . base64_encode((string) file_get_contents($file['file']));
    }
}
