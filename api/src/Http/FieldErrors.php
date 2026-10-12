<?php

declare(strict_types=1);

namespace BrassBand\Http;

// Checks on the content of data that Input has already given its shape to:
// lengths, formats, duplicates. Collects what is wrong, field by field, then
// refuses everything at once so that the form can show every fault together.
//
//   $errors = new FieldErrors();
//   $errors->text('band.name', $input->band->name, 80);
//   $errors->throwIfAny();
//
// The front receives {"error": "invalidInput", "fields": {"band.name": "tooLong"}}.
// What can be wrong: required, tooLong, tooShort, invalid, duplicate.
final class FieldErrors
{
    /** @var array<string, string> */
    private array $fields = [];

    public function add(string $field, string $problem): void
    {
        // The first problem found on a field is the one reported.
        $this->fields[$field] ??= $problem;
    }

    // A one-line text that must not be blank and has a maximum length, in
    // characters. Judged as it will be saved, that is after Text::clean().
    public function text(string $field, string $value, int $maxLength): void
    {
        $value = Text::clean($value);
        if ($value === '') {
            $this->add($field, 'required');
        } elseif (mb_strlen($value) > $maxLength) {
            $this->add($field, 'tooLong');
        }
    }

    // A text that may be left empty, of one line or several. Returns it as it
    // will be saved: cleaned, and null when nothing is left.
    public function optionalText(string $field, ?string $value, int $maxLength, bool $lines = false): ?string
    {
        $value = $value === null ? '' : ($lines ? Text::cleanLines($value) : Text::clean($value));
        if (mb_strlen($value) > $maxLength) {
            $this->add($field, 'tooLong');
        }

        return $value === '' ? null : $value;
    }

    public function email(string $field, string $value): void
    {
        if (strlen($value) > 254 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            $this->add($field, 'invalid');
        }
    }

    public function isEmpty(): bool
    {
        return $this->fields === [];
    }

    public function throwIfAny(): void
    {
        if ($this->fields !== []) {
            throw new ApiError(422, 'invalidInput', $this->fields);
        }
    }
}
