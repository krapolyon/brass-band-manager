<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Members\MemberInput;

final class ValidateInvitationInput
{
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $token,
        public readonly MemberInput $member,
    ) {
    }
}
