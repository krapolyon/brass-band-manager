<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Http\FieldErrors;
use BrassBand\Http\Text;
use Doctrine\DBAL\Connection;

// Checks the record of a member as it was sent, and gives it back as it will
// be saved. Used when a member is created and when one is edited.
// Fields and their rules: model/members.md, "Fields".
final class MemberRecord
{
    public function __construct(private readonly Connection $database)
    {
    }

    /**
     * @param int|null $memberId The member being edited; null for a new one
     * @return array<string, int|string|null> Column => value
     */
    public function check(MemberInput $input, ?int $memberId): array
    {
        $errors = new FieldErrors();

        foreach (['nickname' => $input->nickname, 'firstName' => $input->firstName, 'lastName' => $input->lastName] as $field => $name) {
            $errors->text($field, $name, 50);
            // A name is read by the others: one made only of signs, or of
            // characters that show nothing, is not a name.
            // (Four characters count as letters and show nothing: they are set aside.)
            $visible = preg_replace('/[\x{115F}\x{1160}\x{3164}\x{FFA0}]/u', '', Text::clean($name)) ?? '';
            if (preg_match('/[\p{L}\p{N}]/u', $visible) !== 1) {
                $errors->add($field, 'invalid');
            }
        }
        $email = mb_strtolower(trim($input->email));
        $errors->email('email', $email);

        // Stored in international format: a plus sign and digits. Spaces,
        // dots and dashes typed to make it readable are dropped. Nothing
        // else is: "+33 (0)6..." is not rewritten into a wrong number.
        $mobilePhone = $input->mobilePhone === null ? '' : (preg_replace('/[\s.\-]+/u', '', $input->mobilePhone) ?? '');
        if ($mobilePhone !== '' && preg_match('/\A\+[1-9][0-9]{6,14}\z/', $mobilePhone) !== 1) {
            $errors->add('mobilePhone', 'invalid');
        }
        $countryCode = $input->countryCode === null ? '' : strtoupper(trim($input->countryCode));
        if ($countryCode !== '' && !Countries::exists($countryCode)) {
            $errors->add('countryCode', 'invalid');
        }

        $values = [
            'nickname' => Text::clean($input->nickname),
            'firstName' => Text::clean($input->firstName),
            'lastName' => Text::clean($input->lastName),
            'email' => $email,
            'mobilePhone' => $mobilePhone === '' ? null : $mobilePhone,
            'streetAddress' => $errors->optionalText('streetAddress', $input->streetAddress, 200, lines: true),
            'postalCode' => $errors->optionalText('postalCode', $input->postalCode, 12),
            'city' => $errors->optionalText('city', $input->city, 80),
            'countryCode' => $countryCode === '' ? null : $countryCode,
            'addressInstructions' => $errors->optionalText('addressInstructions', $input->addressInstructions, 500, lines: true),
            'instrumentId' => $input->instrumentId,
        ];

        if ((int) $this->database->fetchOne('SELECT COUNT(*) FROM instrument WHERE id = ?', [$input->instrumentId]) === 0) {
            $errors->add('instrumentId', 'invalid');
        }
        // A nickname is unique whatever its case and its accents, as the
        // database compares it; an email is unique as it is written.
        if ($this->isTaken('nickname', $values['nickname'], $memberId)) {
            $errors->add('nickname', 'duplicate');
        }
        if ($this->isTaken('email', $email, $memberId)) {
            $errors->add('email', 'duplicate');
        }

        $errors->throwIfAny();

        return $values;
    }

    private function isTaken(string $column, string $value, ?int $memberId): bool
    {
        return (int) $this->database->fetchOne(
            "SELECT COUNT(*) FROM member WHERE {$column} = ? AND id <> ?",
            [$value, $memberId ?? 0],
        ) > 0;
    }
}
