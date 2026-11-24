<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ict_json_response(405, ['ok' => false, 'error' => 'Метод не поддерживается']);
}

ict_require_admin();

$raw = file_get_contents('php://input');
$decoded = json_decode((string)$raw, true);

if (!is_array($decoded) || !isset($decoded['services']) || !is_array($decoded['services'])) {
    ict_json_response(400, ['ok' => false, 'error' => 'Некорректная структура services.json']);
}

$rootDir = dirname(__DIR__, 2);
$servicesPath = $rootDir . '/data/services.json';
$encoded = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

if (file_put_contents($servicesPath, $encoded . "\n", LOCK_EX) === false) {
    ict_json_response(500, ['ok' => false, 'error' => 'Не удалось записать data/services.json']);
}

ict_json_response(200, ['ok' => true]);
