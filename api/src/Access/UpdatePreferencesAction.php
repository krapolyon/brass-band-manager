<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Install\Languages;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// PUT /api/me/preferences: the signed-in member sets their language, their
// appearance and their accessibility options. Nobody else can: these are seen
// and changed by the member only (model/members.md, "Personal data").
final class UpdatePreferencesAction
{
    private const COLOR_SCHEMES = ['AUTO', 'LIGHT', 'DARK'];

    public function __construct(
        private readonly Connection $database,
        private readonly Profile $profile,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Input::from($request, PreferencesInput::class);
        $me = CurrentMember::of($request);

        $errors = new FieldErrors();
        if (!Languages::isAvailable($input->language)) {
            $errors->add('language', 'invalid');
        }
        if (!in_array($input->colorScheme, self::COLOR_SCHEMES, true)) {
            $errors->add('colorScheme', 'invalid');
        }
        if ($input->accentTheme !== null && !in_array($input->accentTheme, AccentThemes::AVAILABLE, true)) {
            $errors->add('accentTheme', 'invalid');
        }
        if (!in_array($input->textSizePercent, AccessibilityInput::TEXT_SIZES, true)) {
            $errors->add('textSizePercent', 'invalid');
        }
        $errors->throwIfAny();

        $this->database->update(
            'member',
            [
                'language' => $input->language,
                'colorScheme' => $input->colorScheme,
                'accentTheme' => $input->accentTheme,
                'textSizePercent' => $input->textSizePercent,
                'hasHighContrast' => (int) $input->hasHighContrast,
                'hasIncreasedSpacing' => (int) $input->hasIncreasedSpacing,
                'hasLegibleFont' => (int) $input->hasLegibleFont,
                'hasReducedMotion' => (int) $input->hasReducedMotion,
                'hasExtendedTimeouts' => (int) $input->hasExtendedTimeouts,
                'updatedByMemberId' => $me->id,
            ],
            ['id' => $me->id],
        );

        return Json::write($response, $this->profile->of($me));
    }
}
