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
        $this->encryption = $text($mail['encryption'] ?? '');
        $this->user = $text($mail['user'] ?? '');
        $this->password = is_string($mail['password'] ?? null) ? $mail['password'] : '';
        $this->appUrl = rtrim($text($config['appUrl'] ?? ''), '/');
    }

    // Whether this instance can send email: it needs a mail server, an
    // address to write from, and its own public address to write links with.
    public function canSend(): bool
    {
        return $this->from !== '' && $this->host !== '' && $this->appUrl !== '';
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
        $mail->CharSet = PHPMailer::CHARSET_UTF8;

        $mail->setFrom($this->from, $fromName);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->Body = $text;
        $mail->isHTML(false);
        $mail->send();
    }
}
