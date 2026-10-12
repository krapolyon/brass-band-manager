<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\AccentThemes;
use BrassBand\Access\CurrentMember;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use BrassBand\Install\Languages;
use BrassBand\Members\Countries;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PATCH /api/band: changes the name of the band, its accent theme, its default
// language or its country. Only what is sent changes. Asks for MANAGE_BAND.
final class UpdateBandAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Bands $bands,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, UpdateBandInput::class);

        $errors = new FieldErrors();
        $changes = [];
        if ($input->name !== null) {
            $errors->text('name', $input->name, 80);
            $changes['name'] = Text::clean($input->name);
        }
        if ($input->defaultAccentTheme !== null) {
            if (!in_array($input->defaultAccentTheme, AccentThemes::AVAILABLE, true)) {
                $errors->add('defaultAccentTheme', 'invalid');
            }
            $changes['defaultAccentTheme'] = $input->defaultAccentTheme;
        }
        if ($input->defaultLanguage !== null) {
            if (!Languages::isAvailable($input->defaultLanguage)) {
                $errors->add('defaultLanguage', 'invalid');
            }
            $changes['defaultLanguage'] = $input->defaultLanguage;
        }
        if ($input->defaultCountryCode !== null) {
            if (!Countries::exists($input->defaultCountryCode)) {
                $errors->add('defaultCountryCode', 'invalid');
            }
            $changes['defaultCountryCode'] = $input->defaultCountryCode;
        }
        $errors->throwIfAny();

        if ($changes !== []) {
            $this->database->update(
                'band',
                [...$changes, 'updatedByMemberId' => CurrentMember::of($request)->id],
                ['id' => 1],
            );
        }

        return Json::write($response, $this->bands->view());
    }
}
