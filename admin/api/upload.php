<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ict_json_response(405, ['ok' => false, 'error' => 'Метод не поддерживается']);
}

$config = ict_require_admin();
$rootDir = dirname(__DIR__, 2);
$imagesDir = $rootDir . '/assets/images';
$mediaJsonPath = $rootDir . '/data/media.json';

if (!is_dir($imagesDir) && !mkdir($imagesDir, 0755, true)) {
    ict_json_response(500, ['ok' => false, 'error' => 'Не удалось создать папку assets/images']);
}

$savedPath = null;

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['file'];
    $maxSize = (int)($config['max_file_size'] ?? (15 * 1024 * 1024));
    if ($file['size'] > $maxSize) {
        ict_json_response(400, ['ok' => false, 'error' => 'Файл превышает допустимый размер']);
    }

    $rawName = (string)($_POST['filename'] ?? $file['name']);
    $baseName = preg_replace('/[^a-zA-Z0-9_-]/', '', pathinfo($rawName, PATHINFO_FILENAME));
    if ($baseName === '') {
        $baseName = 'photo-' . time();
    }
    $targetFilename = $baseName . '.webp';
    $targetPath = $imagesDir . '/' . $targetFilename;

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowed = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'];
    if (!in_array($mime, $allowed, true)) {
        ict_json_response(400, ['ok' => false, 'error' => 'Недопустимый формат изображения: ' . $mime]);
    }

    if ($mime === 'image/webp') {
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            ict_json_response(500, ['ok' => false, 'error' => 'Не удалось сохранить WebP-файл']);
        }
    } else {
        // Fallback server-side conversion to WebP via GD
        if (!function_exists('imagewebp')) {
            ict_json_response(500, ['ok' => false, 'error' => 'На сервере не включена поддержка WebP в PHP GD']);
        }
        $img = null;
        if ($mime === 'image/jpeg') $img = @imagecreatefromjpeg($file['tmp_name']);
        elseif ($mime === 'image/png') {
            $img = @imagecreatefrompng($file['tmp_name']);
            if ($img) {
                imagepalettetotruecolor($img);
                imagealphablending($img, true);
                imagesavealpha($img, true);
            }
        } elseif ($mime === 'image/gif') $img = @imagecreatefromgif($file['tmp_name']);

        if (!$img) {
            ict_json_response(400, ['ok' => false, 'error' => 'Не удалось декодировать изображение']);
        }

        $quality = (int)($config['webp_quality'] ?? 82);
        $ok = imagewebp($img, $targetPath, $quality);
        imagedestroy($img);
        if (!$ok) {
            ict_json_response(500, ['ok' => false, 'error' => 'Ошибка конвертации в WebP на сервере']);
        }
    }

    $savedPath = 'assets/images/' . $targetFilename;
}

if (isset($_POST['mediaJson']) && $_POST['mediaJson'] !== '') {
    $decoded = json_decode((string)$_POST['mediaJson'], true);
    if (!is_array($decoded)) {
        ict_json_response(400, ['ok' => false, 'error' => 'Некорректный JSON для media.json']);
    }
    $encoded = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (file_put_contents($mediaJsonPath, $encoded . "\n", LOCK_EX) === false) {
        ict_json_response(500, ['ok' => false, 'error' => 'Не удалось записать data/media.json']);
    }
}

ict_json_response(200, [
    'ok' => true,
    'path' => $savedPath
]);
