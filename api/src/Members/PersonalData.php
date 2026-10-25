<?php

declare(strict_types=1);

namespace BrassBand\Members;

use BrassBand\Http\ApiError;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\TableNotFoundException;

// The fields of a member that identify them or say where to reach them,
// encrypted in the database (model/members.md, entry 1, "Encryption"; issue
// #32). Everything that reads or writes them goes through here.
//
// What it protects: a dump or a backup of the database read without the
// server configuration. What it does not: someone who reaches the files of
// the server, where the key is, as the password of the database is.
//
// - The key is "encryptionKey" in config.php: 32 random bytes in base64, made
//   with "npm run encryption:key". Two keys are derived from it, one that
//   encrypts and one that hashes the email: a lost key is lost data.
// - A value is encrypted with XChaCha20-Poly1305 (libsodium, part of PHP), a
//   fresh random nonce each time, the name of its column as associated data
//   (a value moved to another column does not open), and stored as
//   "v1:" + base64. A value without that prefix is one written before 0.3.1,
//   in clear: it is read as it is until the database update encrypts it.
// - emailHash is the HMAC-SHA256 of the email in lowercase. Sign-in, the
//   forgotten password and the uniqueness of the email compare it.
final class PersonalData
{
    /** The encrypted columns of member. */
    public const FIELDS = ['firstName', 'lastName', 'email', 'mobilePhone', 'streetAddress', 'postalCode', 'city', 'countryCode', 'addressInstructions'];

    private const PREFIX = 'v1:';
    // The context of the derivation: 8 bytes, the same forever.
    private const CONTEXT = 'bbMember';

    private ?bool $isMigrated = null;

    private function __construct(
        private readonly Connection $database,
        private readonly ?string $encryptionKey,
        private readonly ?string $hashKey,
    ) {
    }

    /**
     * @param array<string, mixed> $config
     */
    public static function from(array $config, Connection $database): self
    {
        $key = self::keyOf($config);
        $personal = new self(
            $database,
            $key === null ? null : sodium_crypto_kdf_derive_from_key(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES, 1, self::CONTEXT, $key),
            $key === null ? null : sodium_crypto_kdf_derive_from_key(32, 2, self::CONTEXT, $key),
        );
        // Asked now, outside any transaction: a look at the columns of a
        // table inside one fixes what it reads before the row it locks is
        // held (two forgotten-password requests at once sent two emails).
        $personal->isMigrated();

        return $personal;
    }

    /**
     * The key of the configuration, or null when there is none or it is not
     * one (anything but 32 bytes in base64).
     *
     * @param array<string, mixed> $config
     */
    public static function keyOf(array $config): ?string
    {
        $text = is_string($config['encryptionKey'] ?? null) ? trim($config['encryptionKey']) : '';
        $key = $text === '' ? false : base64_decode($text, true);

        return is_string($key) && strlen($key) === SODIUM_CRYPTO_KDF_KEYBYTES ? $key : null;
    }

    public function hasKey(): bool
    {
        return $this->encryptionKey !== null;
    }

    /**
     * Whether the database has the columns of 0.3.1 (migration 015). Before
     * it is applied, sign-in reads and writes as 0.3.0 did, so that the admin
     * can reach the database update ("Not locking oneself out").
     */
    public function isMigrated(): bool
    {
        if ($this->isMigrated === null) {
            try {
                $this->isMigrated = $this->database->fetchOne("SHOW COLUMNS FROM member LIKE 'emailHash'") !== false;
            } catch (TableNotFoundException) {
                // Not installed yet: the install applies every migration first.
                return false;
            }
        }

        return $this->isMigrated;
    }

    /** Asks the database again whether it has the columns of 0.3.1: after migrations ran. */
    public function forgetSchema(): void
    {
        $this->isMigrated = null;
    }

    /**
     * The values of a record as they are written: the personal fields
     * encrypted, with the hash of the email. Before the migration, as they are.
     *
     * @param array<string, mixed> $values Clear values, some of FIELDS among them
     * @return array<string, mixed>
     */
    public function sealed(array $values): array
    {
        if (!$this->isMigrated()) {
            return $values;
        }
        if (array_key_exists('email', $values) && $values['email'] !== null) {
            $values['emailHash'] = $this->emailHash((string) $values['email']);
        }
        foreach (self::FIELDS as $field) {
            if (array_key_exists($field, $values)) {
                $values[$field] = $this->seal($field, $values[$field] === null ? null : (string) $values[$field]);
            }
        }

        return $values;
    }

    /**
     * A row read from member, with its personal fields in clear. The other
     * columns are left as they are.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public function opened(array $row): array
    {
        foreach (self::FIELDS as $field) {
            if (array_key_exists($field, $row)) {
                $row[$field] = $this->open($field, $row[$field]);
            }
        }
        unset($row['emailHash']);

        return $row;
    }

    /**
     * The email of every member, in clear, by id: what an export, an import
     * and a reprise match members with.
     *
     * @return array<int, string>
     */
    public function emailsById(): array
    {
        $emails = [];
        foreach ($this->database->fetchAllAssociative('SELECT id, email FROM member') as $row) {
            $emails[(int) $row['id']] = (string) $this->opened($row)['email'];
        }

        return $emails;
    }

    /** The hash of an email, compared by sign-in and by the uniqueness of the email. */
    public function emailHash(string $email): string
    {
        return hash_hmac('sha256', mb_strtolower($email), $this->hashKey ?? throw self::noKey());
    }

    /**
     * The SQL condition, and its values, that finds a member by their email:
     * by its hash, or as it is for a row still in clear. The database
     * compares a clear email without regard to accents: the caller checks
     * the address it found, letter by letter.
     *
     * @return array{0: string, 1: list<string>}
     */
    public function whereEmail(string $email, string $alias = ''): array
    {
        $column = $alias === '' ? '' : "{$alias}.";
        if (!$this->isMigrated()) {
            return ["{$column}email = ?", [$email]];
        }

        return ["({$column}emailHash = ? OR ({$column}emailHash IS NULL AND {$column}email = ?))", [$this->emailHash($email), $email]];
    }

    /**
     * Encrypts the rows written before 0.3.1, in place: the step of the
     * database update that follows migration 015. Safe to run again: a row
     * already encrypted is left alone. Returns how many rows it encrypted.
     */
    /**
     * Whether the key of config.php is the one that encrypted the records
     * already encrypted (true when none is). Checked before a run of the
     * migrations: encrypting the rest with another key would leave a database
     * that no key reads whole.
     */
    public function isKeyOfExisting(): bool
    {
        if (!$this->isMigrated()) {
            return true;
        }
        $email = $this->database->fetchOne('SELECT email FROM member WHERE emailHash IS NOT NULL ORDER BY id LIMIT 1');
        if ($email === false) {
            return true;
        }
        try {
            $this->open('email', $email);
        } catch (ApiError) {
            return false;
        }

        return true;
    }

    public function sealExisting(): int
    {
        if (!$this->isMigrated()) {
            return 0;
        }
        $count = 0;
        $ids = $this->database->fetchFirstColumn('SELECT id FROM member WHERE emailHash IS NULL ORDER BY id');
        foreach ($ids as $id) {
            $this->database->transactional(function () use ($id, &$count): void {
                $row = $this->database->fetchAssociative(
                    'SELECT ' . implode(', ', self::FIELDS) . ' FROM member WHERE id = ? AND emailHash IS NULL FOR UPDATE',
                    [$id],
                );
                if ($row === false) {
                    return;
                }
                // A row without its hash is one written before 0.3.1: all in
                // clear, all encrypted at once with its hash.
                $this->database->update('member', $this->sealed($row), ['id' => $id]);
                $count++;
            });
        }

        return $count;
    }

    private function seal(string $field, ?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $nonce = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
        $sealed = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($value, $field, $nonce, $this->encryptionKey ?? throw self::noKey());

        return self::PREFIX . base64_encode($nonce . $sealed);
    }

    private function open(string $field, mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $value = (string) $value;
        if (!self::isSealed($value)) {
            return $value;
        }
        $bytes = base64_decode(substr($value, strlen(self::PREFIX)), true);
        $size = SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES;
        if (!is_string($bytes) || strlen($bytes) < $size + SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_ABYTES) {
            // Not something seal() wrote: a value of before 0.3.1 that happens
            // to start like one ("v1: ring twice"), still in clear.
            return $value;
        }
        $clear = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($bytes, $size), $field, substr($bytes, 0, $size), $this->encryptionKey ?? throw self::noKey());
        if ($clear === false) {
            // Another key than the one that encrypted it, or a value damaged:
            // nothing is shown rather than something wrong. Nothing is logged.
            throw new ApiError(500, 'encryptionKeyWrong');
        }

        return $clear;
    }

    private static function isSealed(string $value): bool
    {
        return str_starts_with($value, self::PREFIX);
    }

    private static function noKey(): ApiError
    {
        return new ApiError(500, 'encryptionKeyMissing');
    }
}
