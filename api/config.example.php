<?php

// Configuration of the app ON THE HOST. Copy this file to config.php there and
// fill it in. config.php is never committed and never copied by a deployment.
// (For the local Docker stack, the file to copy is config.local.php.)

return [
    'database' => [
        'host' => '',
        'port' => 3306,
        'name' => '',
        'user' => '',
        'password' => '',
    ],

    // Asked by the install screen, so that only the person who can read this
    // file can install the app and become its first admin. Write a long random
    // text here (16 characters at least, 30 is better) before opening the app
    // for the first time. While it is empty or shorter, install is refused.
    // It is of no use once the app is installed.
    'installKey' => '',

    // The public address of the app, as members type it, without a slash at
    // the end: 'https://app.example.org'. The links written in emails start
    // with it.
    'appUrl' => '',

    // The mail server the app sends its emails through (today: the link of a
    // forgotten password). Use a mailbox of your own domain. While "from" or
    // "host" is empty, the app sends nothing, and the forgotten password
    // screen sends members to those who manage members.
    'mail' => [
        // The address the emails come from, for instance 'app@example.org'.
        'from' => '',
        'host' => '',
        'port' => 587,
        // 'tls' (port 587) or 'ssl' (port 465). Nothing else is accepted.
        'encryption' => 'tls',
        'user' => '',
        'password' => '',
    ],

    // There is deliberately no "session" setting here: without one, the
    // session cookie only travels over HTTPS, which is what the host must do.
];
