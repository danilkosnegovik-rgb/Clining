<?php
declare(strict_types=1);

function ict_json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function ict_require_admin(): array
{
    $localConfigPath = __DIR__ . '/config.local.php';
    if (!file_exists($localConfigPath)) {
        ict_json_response(500, [
            'ok' => false,
            'error' => 'Создайте admin/api/config.local.php на основе config.example.php и задайте хеш пароля.'
        ]);
    }

    $config = require $localConfigPath;
    $provided = $_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? '';

    if ($provided === '' || empty($config['password_hash']) || !password_verify($provided, (string)$config['password_hash'])) {
        ict_json_response(401, [
            'ok' => false,
            'error' => 'Неверный пароль администратора.'
        ]);
    }

    return $config;
}
