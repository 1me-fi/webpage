<?php
declare(strict_types=1);

function kyselytPublicRoot(): string {
    $configured = $_SERVER['DOCUMENT_ROOT'] ?? '';
    $real = is_string($configured) && $configured !== '' ? realpath($configured) : false;
    if ($real !== false) return rtrim($real, '/');
    $repoRoot = realpath(dirname(__DIR__, 2));
    if ($repoRoot === false) throw new RuntimeException('Unable to resolve public document root');
    return rtrim($repoRoot, '/');
}
function kyselytPathInside(string $path, string $root): bool {
    return $path === $root || str_starts_with($path, rtrim($root, '/') . '/');
}
function kyselytExternalConfigPath(string $candidate, string $root): string {
    if (!str_starts_with($candidate, '/') || kyselytPathInside($candidate, $root)) {
        throw new RuntimeException('Config must be an absolute path outside document root');
    }
    $real = realpath($candidate);
    if ($real === false || !is_file($real)) throw new RuntimeException('Kyselyt config file not found');
    if (kyselytPathInside($real, $root)) throw new RuntimeException('Config must be outside document root');
    return $real;
}
function resolveKyselytConfigPath(): string {
    $root = kyselytPublicRoot();
    $configured = getenv('KYSELYT_CONFIG');
    if (is_string($configured) && $configured !== '') return kyselytExternalConfigPath($configured, $root);
    return kyselytExternalConfigPath(dirname($root) . '/private/kyselyt/config.php', $root);
}
function loadKyselytConfig(): array {
    $config = require resolveKyselytConfigPath();
    if (!is_array($config)
        || !is_string($config['database'] ?? null) || !str_starts_with($config['database'], '/')
        || !is_string($config['public_origin'] ?? null) || !str_starts_with($config['public_origin'], 'https://')
        || !is_string($config['rate_secret'] ?? null) || strlen($config['rate_secret']) < 32
        || !is_callable($config['authorize_admin'] ?? null)) {
        throw new RuntimeException('Invalid server configuration');
    }
    return $config;
}
function serverAuthenticatedAdminIdentity(): ?string {
    foreach (['REMOTE_USER', 'REDIRECT_REMOTE_USER'] as $key) {
        $value = $_SERVER[$key] ?? null;
        if (!is_string($value) || $value === '' || strlen($value) > 256 || trim($value) !== $value) continue;
        if (preg_match('/[\x00-\x1F\x7F]/', $value)) continue;
        return $value;
    }
    return null;
}
function authorizePleskAdminSession(): bool {
    $principal = serverAuthenticatedAdminIdentity();
    if ($principal === null) return false;
    if (session_status() === PHP_SESSION_ACTIVE) {
        $stored = $_SESSION['kyselyt_admin_principal'] ?? null;
        return session_name() === 'KYSSESSID' && is_string($stored) && hash_equals($stored, $principal);
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Strict');
    session_name('KYSSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/kyselyt/hallinta/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    if (!session_start()) throw new RuntimeException('Unable to start admin session');
    $stored = $_SESSION['kyselyt_admin_principal'] ?? null;
    if (!is_string($stored) || !hash_equals($stored, $principal)) {
        session_regenerate_id(true);
        $_SESSION = ['kyselyt_admin_principal' => $principal];
    }
    return true;
}
