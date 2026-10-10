<?php

declare(strict_types=1);

namespace BrassBand\Install;

use BrassBand\Access\Passwords;
use BrassBand\Access\Profile;
use BrassBand\Access\Role;
use BrassBand\Access\SessionCookie;
use BrassBand\Access\Sessions;
use BrassBand\Http\ApiError;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// POST /api/install: installs the app. Creates the band, its sections and
// instruments, and the first member, who is the admin; then signs that member
// in. Rules: model/members.md ("Install") and model/band.md.
//
// This route is reachable without signing in, and it creates an admin. Two
// things keep it safe:
//   - it works only while no member exists;
//   - it asks for the install key written in the server configuration, which
//     only the person who set the app up on the host can read.
final class InstallAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Sessions $sessions,
        private readonly SessionCookie $cookie,
        private readonly Profile $profile,
        #[\SensitiveParameter]
        private readonly string $installKey,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (InstallStatusAction::isInstalled($this->database)) {
            throw new ApiError(409, 'alreadyInstalled');
        }

        $input = Input::from($request, InstallInput::class);

        // An empty key in the configuration never matches: install is closed
        // until the owner of the host has written one.
        if ($this->installKey === '' || !hash_equals($this->installKey, $input->installKey)) {
            throw new ApiError(403, 'invalidInstallKey');
        }

        $this->check($input);

        try {
            $memberId = $this->database->transactional(fn () => $this->save($input));
        } catch (UniqueConstraintViolationException) {
            // Either another install finished at the same instant and won...
            if (InstallStatusAction::isInstalled($this->database)) {
                throw new ApiError(409, 'alreadyInstalled');
            }
            // ...or two names are the same for the database, which also
            // ignores accents ("Flute" and "Flûte"), unlike the check above.
            throw new ApiError(422, 'invalidInput', ['sections' => 'duplicate']);
        }

        [$current, $token] = $this->sessions->signIn($memberId);

        return $this->cookie->write(Json::write($response, $this->profile->of($current), 201), $token);
    }

    private function check(InstallInput $input): void
    {
        $errors = new FieldErrors();

        if (!Languages::isAvailable($input->language)) {
            $errors->add('language', 'invalid');
        }
        $errors->text('bandName', $input->bandName, 80);

        // Names are unique whatever their case, as in the database.
        $sectionNames = [];
        $instrumentNames = [];
        if ($input->sections === []) {
            $errors->add('sections', 'required');
        }
        foreach ($input->sections as $s => $section) {
            $errors->text("sections.$s.name", $section->name, 50);
            if (in_array(self::key($section->name), $sectionNames, true)) {
                $errors->add("sections.$s.name", 'duplicate');
            }
            $sectionNames[] = self::key($section->name);

            if ($section->instruments === []) {
                $errors->add("sections.$s.instruments", 'required');
            }
            foreach ($section->instruments as $i => $instrument) {
                $errors->text("sections.$s.instruments.$i", $instrument, 50);
                if (in_array(self::key($instrument), $instrumentNames, true)) {
                    $errors->add("sections.$s.instruments.$i", 'duplicate');
                }
                $instrumentNames[] = self::key($instrument);
            }
        }

        $admin = $input->admin;
        $errors->email('admin.email', trim($admin->email));
        Passwords::check($errors, 'admin.password', $admin->password);
        $errors->text('admin.lastName', $admin->lastName, 50);
        $errors->text('admin.firstName', $admin->firstName, 50);
        $errors->text('admin.nickname', $admin->nickname, 50);
        if (!in_array(self::key($admin->instrument), $instrumentNames, true)) {
            $errors->add('admin.instrument', 'invalid');
        }

        $errors->throwIfAny();
    }

    // Returns the id of the first member.
    private function save(InstallInput $input): int
    {
        // The band comes first: its id is always 1, so a second install running
        // at the same instant fails here and saves nothing.
        $this->database->insert('band', [
            'id' => 1,
            'name' => Text::clean($input->bandName),
            'defaultLanguage' => $input->language,
        ]);

        $adminInstrumentId = null;
        foreach ($input->sections as $s => $section) {
            $this->database->insert('section', ['name' => Text::clean($section->name), 'position' => $s + 1]);
            $sectionId = (int) $this->database->lastInsertId();

            foreach ($section->instruments as $i => $instrument) {
                $this->database->insert('instrument', [
                    'sectionId' => $sectionId,
                    'name' => Text::clean($instrument),
                    'position' => $i + 1,
                ]);
                if (self::key($instrument) === self::key($input->admin->instrument)) {
                    $adminInstrumentId = (int) $this->database->lastInsertId();
                }
            }
        }

        $admin = $input->admin;
        $this->database->insert('member', [
            'nickname' => Text::clean($admin->nickname),
            'firstName' => Text::clean($admin->firstName),
            'lastName' => Text::clean($admin->lastName),
            'email' => mb_strtolower(trim($admin->email)),
            'instrumentId' => $adminInstrumentId,
            'passwordHash' => Passwords::hash($admin->password),
            'status' => 'ACTIVE',
            'language' => $input->language,
        ]);
        $memberId = (int) $this->database->lastInsertId();

        $this->database->insert('memberRole', ['memberId' => $memberId, 'role' => Role::ADMIN->value]);

        return $memberId;
    }

    // The form of a name used to tell whether two names are the same.
    private static function key(string $name): string
    {
        return mb_strtolower(Text::clean($name));
    }
}
