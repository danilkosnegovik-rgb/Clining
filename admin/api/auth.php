<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function ict_start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'secure' => $isHttps,
            'samesite' => 'Strict'
        ]);
        session_start();
    }
}

function ict_json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function ict_require_admin(): array
{
    ict_start_session();
    if (!empty($_SESSION['ict_admin_auth']) && $_SESSION['ict_admin_auth'] === true) {
        return [
            'login' => $_SESSION['ict_admin_login'] ?? 'admin',
            'max_file_size' => 15 * 1024 * 1024,
            'webp_quality' => 82
        ];
    }

    ict_json_response(401, [
        'ok' => false,
        'error' => 'Требуется авторизация в админ-панели.'
    ]);
}

// Direct endpoint handler for /admin/api/auth.php
if (realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    ict_start_session();
    $action = $_GET['action'] ?? '';
    $env = ict_load_env();

    if ($action === 'session') {
        ict_json_response(200, [
            'ok' => true,
            'authenticated' => !empty($_SESSION['ict_admin_auth']),
            'login' => !empty($_SESSION['ict_admin_auth']) ? ($_SESSION['ict_admin_login'] ?? '') : ''
        ]);
    }

    if ($action === 'challenge') {
        $parsed = ict_parse_pbkdf2_hash((string)($env['ADMIN_PASSWORD_HASH'] ?? ''));
        if (!$parsed) {
            ict_json_response(500, ['ok' => false, 'error' => 'Файл .env не настроен (отсутствует ADMIN_PASSWORD_HASH).']);
        }
        $nonce = bin2hex(random_bytes(24));
        $_SESSION['ict_auth_nonce'] = $nonce;
        $_SESSION['ict_auth_nonce_exp'] = time() + 120;

        ict_json_response(200, [
            'ok' => true,
            'nonce' => $nonce,
            'salt' => $parsed['salt'],
            'iterations' => $parsed['iterations']
        ]);
    }

    if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
        $login = trim((string)($body['login'] ?? ''));
        $nonce = (string)($body['nonce'] ?? '');
        $proof = strtolower((string)($body['proof'] ?? ''));

        $storedLogin = (string)($env['ADMIN_LOGIN'] ?? '');
        $parsed = ict_parse_pbkdf2_hash((string)($env['ADMIN_PASSWORD_HASH'] ?? ''));
        $expectedNonce = (string)($_SESSION['ict_auth_nonce'] ?? '');
        $nonceExp = (int)($_SESSION['ict_auth_nonce_exp'] ?? 0);

        unset($_SESSION['ict_auth_nonce'], $_SESSION['ict_auth_nonce_exp']);

        if (!$parsed || $expectedNonce === '' || time() > $nonceExp || !hash_equals($expectedNonce, $nonce)) {
            ict_json_response(401, ['ok' => false, 'error' => 'Сессия входа устарела. Попробуйте ещё раз.']);
        }

        $expectedProof = hash_hmac('sha256', $nonce . ':' . $storedLogin, $parsed['hash']);
        if (!hash_equals($storedLogin, $login) || !hash_equals($expectedProof, $proof)) {
            ict_json_response(401, ['ok' => false, 'error' => 'Неверный логин или пароль.']);
        }

        session_regenerate_id(true);
        $_SESSION['ict_admin_auth'] = true;
        $_SESSION['ict_admin_login'] = $storedLogin;

        ict_json_response(200, ['ok' => true, 'login' => $storedLogin]);
    }

    if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $_SESSION = [];
        session_destroy();
        ict_json_response(200, ['ok' => true]);
    }

    if ($action === 'change-credentials' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        ict_require_admin();
        $body = json_decode((string)file_get_contents('php://input'), true) ?: [];
        $nonce = (string)($body['nonce'] ?? '');
        $currentProof = strtolower((string)($body['currentProof'] ?? ''));
        $newLogin = trim((string)($body['newLogin'] ?? ''));
        $newSalt = trim((string)($body['newSalt'] ?? ''));
        $newHash = strtolower(trim((string)($body['newHash'] ?? '')));
        $iterations = (int)($body['iterations'] ?? 120000);

        $storedLogin = (string)($env['ADMIN_LOGIN'] ?? '');
        $parsed = ict_parse_pbkdf2_hash((string)($env['ADMIN_PASSWORD_HASH'] ?? ''));
        $expectedNonce = (string)($_SESSION['ict_auth_nonce'] ?? '');
        $nonceExp = (int)($_SESSION['ict_auth_nonce_exp'] ?? 0);
        unset($_SESSION['ict_auth_nonce'], $_SESSION['ict_auth_nonce_exp']);

        if (!$parsed || $expectedNonce === '' || time() > $nonceExp || !hash_equals($expectedNonce, $nonce)) {
            ict_json_response(401, ['ok' => false, 'error' => 'Запрос устарел. Повторите попытку.']);
        }

        $expectedProof = hash_hmac('sha256', $nonce . ':' . $storedLogin, $parsed['hash']);
        if (!hash_equals($expectedProof, $currentProof)) {
            ict_json_response(401, ['ok' => false, 'error' => 'Текущий пароль указан неверно.']);
        }

        if ($newLogin === '' || strlen($newLogin) < 3 || !preg_match('/^[a-f0-9]{32,64}$/', $newSalt) || !preg_match('/^[a-f0-9]{64}$/', $newHash)) {
            ict_json_response(400, ['ok' => false, 'error' => 'Некорректные данные нового логина или хеша пароля.']);
        }

        $encodedHash = sprintf('pbkdf2_sha256$%d$%s$%s', max(100000, $iterations), $newSalt, $newHash);
        if (!ict_save_env([
            'ADMIN_LOGIN' => $newLogin,
            'ADMIN_PASSWORD_HASH' => $encodedHash,
            'ADMIN_SESSION_SECRET' => $env['ADMIN_SESSION_SECRET'] ?? bin2hex(random_bytes(32))
        ])) {
            ict_json_response(500, ['ok' => false, 'error' => 'Не удалось сохранить изменения в .env.']);
        }

        $_SESSION['ict_admin_login'] = $newLogin;
        ict_json_response(200, ['ok' => true, 'login' => $newLogin]);
    }

    ict_json_response(400, ['ok' => false, 'error' => 'Неизвестное действие']);
}
