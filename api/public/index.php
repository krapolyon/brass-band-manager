<?php

declare(strict_types=1);

// Single entry point of the API: every /api/... request arrives here.
// Routing is a plain comparison for now; the router library comes with the base layer.

require __DIR__ . '/../src/Database.php';

use BrassBand\Database;

$config = require __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($method === 'GET' && $path === '/api/health') {
    try {
        Database::connect($config['database'])->query('SELECT 1');
        echo json_encode(['database' => 'ok']);
    } catch (PDOException $exception) {
        error_log('Database unreachable: ' . $exception->getCode());
        http_response_code(503);
        echo json_encode(['database' => 'unreachable']);
    }
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'notFound']);
