<?php

declare(strict_types=1);

namespace BrassBand\Mail;

use PHPMailer\PHPMailer\PHPMailer;

// Sends the emails of the app, through the mail server written in the
// configuration (config.php, "mail"). An instance without that configuration
// sends nothing, and says so: the screens that depend on email adapt
// (model/members.md, "Sending email").
//
// Emails are plain text. Nothing here writes to a log: an address is personal
// data.
final class Mailer
{
    private readonly string $from;
    private readonly string $host;
    private readonly int $port;
    private readonly string $encryption;
    private readonly string $user;
    private readonly string $password;
    private readonly string $appUrl;

    /**
     * @param array<mixed> $config The whole configuration of the server
     */
    public function __construct(array $config)
    {
        $mail = is_array($config['mail'] ?? null) ? $config['mail'] : [];
        $text = static fn (mixed $value): string => is_string($value) ? trim($value) : '';

        $this->from = $text($mail['from'] ?? '');
        $this->host = $text($mail['host'] ?? '');
        $this->port = is_int($mail['port'] ?? null) ? $mail['port'] : 587;
        // Encrypted unless the configuration explicitly says otherwise.
        $this->encryption = $text($mail['encryption'] ?? 'tls');
        $this->user = $text($mail['user'] ?? '');
        $this->password = is_string($mail['password'] ?? null) ? $mail['password'] : '';
        $this->appUrl = rtrim($text($config['appUrl'] ?? ''), '/');
    }

    // Whether this instance can send email: it needs a mail server, an
    // address to write from, and its own public address to write links with.
    public function canSend(): bool
    {
        if ($this->from === '' || $this->host === '' || $this->appUrl === '') {
            return false;
        }
        if (filter_var($this->from, FILTER_VALIDATE_EMAIL) === false) {
            return false;
        }
        // 'tls' and 'ssl' are the two ways to encrypt. None at all is for a
        // mail server on the same machine, and never with a password, which
        // would travel in clear. Anything else is a mistake in the file:
        // better no email than an exchange nobody meant to leave unencrypted.
        return in_array($this->encryption, ['tls', 'ssl'], true)
            || ($this->encryption === '' && $this->user === '');
    }

    // An address of the app, as written in an email. It comes from the
    // configuration, never from the request: a request can claim any host,
    // and the link of an email would then lead to someone else's site.
    public function url(string $path): string
    {
        return $this->appUrl . $path;
    }

    /**
     * @throws \PHPMailer\PHPMailer\Exception When the mail server refuses or does not answer
     */
    public function send(string $to, string $fromName, string $subject, string $text): void
    {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $this->host;
        $mail->Port = $this->port;
        $mail->SMTPSecure = $this->encryption;
        // Never falls back to an unencrypted exchange unless the configuration says so.
        $mail->SMTPAutoTLS = $this->encryption !== '';
        $mail->SMTPAuth = $this->user !== '';
        $mail->Username = $this->user;
        $mail->Password = $this->password;
        $mail->Timeout = 10;
        $mail->getSMTPInstance()->Timelimit = 10;
        // The name this server gives itself, in the exchange and in the id of
        // the message: the one of the configuration, never the host a
        // request claims.
        $mail->Hostname = (string) (parse_url($this->appUrl, PHP_URL_HOST) ?: 'localhost');
        // Does not say which library sends, nor its version.
        $mail->XMailer = ' ';
        $mail->CharSet = PHPMailer::CHARSET_UTF8;

        $mail->setFrom($this->from, $fromName);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->Body = $text;
        $mail->isHTML(false);
        $mail->send();
    }
}
