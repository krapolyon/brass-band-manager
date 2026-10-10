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
    // text here before opening the app for the first time.
    // While it is empty, install is refused.
    'installKey' => '',

    // There is deliberately no "session" setting here: without one, the
    // session cookie only travels over HTTPS, which is what the host must do.
];
