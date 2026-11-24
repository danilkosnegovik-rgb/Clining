<?php
/**
 * Скопируйте этот файл в admin/api/config.local.php на вашем PHP-хостинге
 * и задайте свой безопасный пароль (хеш можно сгенерировать командой:
 * php -r "echo password_hash('ВашПароль', PASSWORD_DEFAULT);").
 *
 * Файл config.local.php добавлен в .gitignore и не попадает в Git.
 */
return [
    // Пример хеша для пароля "change-me-now" — ОБЯЗАТЕЛЬНО замените на свой!
    'password_hash' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'max_file_size' => 15 * 1024 * 1024, // 15 MB
    'webp_quality'  => 82,
];
