<?php

declare(strict_types=1);

namespace BrassBand\Mail;

// The members this instance may write to (config.php, "allowedRecipients").
//
// Left empty, as on the instance the band uses, everyone is written to. Filled
// in, as on an instance used to try a version out with a copy of the real
// data, an email or a notification for anyone else is put aside: it is not
// sent, and the log says that one was, without saying to whom.
//
// Only a setting left out, or an empty list, means everyone. Anything else
// that holds no address (a text instead of a list, a list of empty texts) is
// a mistake in the file, and then nobody is written to: a mistake must not
// make an instance write to every member.
final class AllowedRecipients
{
    /** @var list<string> */
    private readonly array $emails;
    private readonly bool $isEveryone;

    /**
     * @param array<mixed> $config The whole configuration of the server
     */
    public function __construct(array $config)
    {
        $setting = $config['allowedRecipients'] ?? [];
        $this->isEveryone = $setting === [];
        $listed = is_array($setting) ? $setting : [];
        $emails = [];
        foreach ($listed as $email) {
            if (is_string($email) && trim($email) !== '') {
                $emails[] = mb_strtolower(trim($email));
            }
        }
        $this->emails = $emails;
    }

    public function allows(string $email): bool
    {
        return $this->isEveryone || in_array(mb_strtolower(trim($email)), $this->emails, true);
    }

    // What the log keeps of what was put aside: how many and of which kind,
    // never an address.
    public static function logPutAside(string $kind, int $count): void
    {
        if ($count > 0) {
            error_log("{$count} {$kind}(s) put aside: the recipient is not in allowedRecipients of config.php.");
        }
    }
}
