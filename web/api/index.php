<?php

declare(strict_types=1);

// The relay of the API on the host. The web server only serves web/, and the
// code of the API is outside it: this file, the only PHP a browser reaches,
// hands every /api/... request over to it and does nothing else.

require __DIR__ . '/../../api/public/index.php';
