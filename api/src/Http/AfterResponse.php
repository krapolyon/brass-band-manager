<?php

declare(strict_types=1);

namespace BrassBand\Http;

// Work done once the answer has left: sending an email, which takes a second
// or two. Whoever asked does not wait for it, and above all cannot tell from
// the time of the answer whether an email was sent (model/members.md,
// "Forgotten password").
//
// The host has no long-running process: this runs at the end of the same
// request, after the answer was handed over.
final class AfterResponse
{
    /** @var list<callable(): void> */
    private static array $tasks = [];

    /**
     * @param callable(): void $task
     */
    public static function add(callable $task): void
    {
        self::$tasks[] = $task;
    }

    // Called by the entry point, after the answer was written.
    public static function run(): void
    {
        if (self::$tasks === []) {
            return;
        }

        // Hands the answer over and closes it for the browser. With PHP-FPM
        // (the host) that is one function; elsewhere, the length sent with the
        // answer tells the browser that it has everything.
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            flush();
        }
        ignore_user_abort(true);

        foreach (self::$tasks as $task) {
            try {
                $task();
            } catch (\Throwable $failure) {
                // The class of the failure only: its message can hold an email address.
                error_log('A task run after the answer failed: ' . $failure::class);
            }
        }
        self::$tasks = [];
    }
}
