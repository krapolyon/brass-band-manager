<?php

declare(strict_types=1);

namespace BrassBand\Access;

use BrassBand\Members\MemberInput;
use BrassBand\Members\PhotoInput;

// What the screen of a password link sends. A member who forgot their
// password sends the token and the new password. An invited member sends
// their whole account with them: the invitation is completed in one request
// (model/members.md, entry 3).
final class UsePasswordLinkInput
{
    /**
     * @param MemberInput|null $member The record of the invited member, as they checked and completed it
     * @param PhotoInput|null $photo A new photo. Left out: the one given by whoever invited is kept
     * @param bool $removePhoto True: the member wants no photo
     * @param AccessibilityInput|null $accessibility The options chosen during the invitation
     */
    public function __construct(
        #[\SensitiveParameter]
        public readonly string $token,
        #[\SensitiveParameter]
        public readonly string $password,
        public readonly ?MemberInput $member = null,
        public readonly ?PhotoInput $photo = null,
        public readonly bool $removePhoto = false,
        public readonly ?AccessibilityInput $accessibility = null,
    ) {
    }

    // Whether the request carries more than a password: only an invitation may.
    public function completesAnAccount(): bool
    {
        return $this->member !== null || $this->photo !== null || $this->removePhoto || $this->accessibility !== null;
    }
}
