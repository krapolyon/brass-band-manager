<?php

declare(strict_types=1);

namespace BrassBand\Members;

// The record of a member, all at once: the form that creates or edits a
// member sends every field. A contact field left out is erased.
final class MemberInput
{
    public function __construct(
        public readonly string $nickname,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $email,
        public readonly int $instrumentId,
        public readonly ?string $mobilePhone = null,
        public readonly ?string $streetAddress = null,
        public readonly ?string $postalCode = null,
        public readonly ?string $city = null,
        public readonly ?string $countryCode = null,
        public readonly ?string $addressInstructions = null,
    ) {
    }
}
