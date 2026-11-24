<?php
declare(strict_types=1);

function ict_env_path(): string
{
    return dirname(__DIR__, 2) . '/.env';
}

function ict_load_env(): array
{
    $path = ict_env_path();
    if (!is_file($path) || !is_readable($path)) {
        return [];
    }

    $vars = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return [];
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }
        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($trimmed, 0, $pos));
        $val = trim(substr($trimmed, $pos + 1));
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
            (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }
        $vars[$key] = $val;
    }

    return $vars;
}

function ict_save_env(array $updates): bool
{
    $current = ict_load_env();
    foreach ($updates as $k => $v) {
        $current[$k] = str_replace(["\r", "\n"], '', (string)$v);
    }

    $lines = [
        '# ICT Admin Credentials (stored as salted PBKDF2-SHA256 hash)',
        '# Managed automatically via Admin Panel or edited manually'
    ];
    foreach ($current as $k => $v) {
        $lines[] = $k . '=' . $v;
    }

    return file_put_contents(ict_env_path(), implode("\n", $lines) . "\n", LOCK_EX) !== false;
}

function ict_parse_pbkdf2_hash(string $encoded): ?array
{
    $parts = explode('$', $encoded);
    if (count($parts) !== 4 || $parts[0] !== 'pbkdf2_sha256') {
        return null;
    }
    return [
        'iterations' => (int)$parts[1],
        'salt' => $parts[2],
        'hash' => strtolower($parts[3])
    ];
}
