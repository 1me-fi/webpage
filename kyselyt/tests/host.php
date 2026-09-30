<?php
declare(strict_types=1);
require dirname(__DIR__) . '/lib/service.php';

$results = [];
function hostCheck(bool $ok, string $label): void {
    global $results;
    if (!$ok) throw new RuntimeException($label);
    $results[] = "PASS $label";
}
$tmp = sys_get_temp_dir() . '/kyselyt-host-' . bin2hex(random_bytes(6));
$root = $tmp . '/site';
$private = $tmp . '/private';
mkdir($root, 0700, true);
mkdir($private, 0700, true);
ini_set('session.save_path', $tmp);
$_SERVER['DOCUMENT_ROOT'] = $root;
$inside = $root . '/config.php';
file_put_contents($inside, "<?php return [];\n");
putenv('KYSELYT_CONFIG=' . $inside);
try {
    resolveKyselytConfigPath();
    throw new RuntimeException('Config inside document root was accepted');
} catch (RuntimeException $e) {
    hostCheck(str_contains($e->getMessage(), 'outside document root'), 'config under document root rejected');
}
unlink($inside);
$external = $private . '/config.php';
file_put_contents($external, "<?php return ['database'=>__DIR__.'/kyselyt.sqlite','public_origin'=>'https://1me.fi','rate_secret'=>'" . str_repeat('x', 64) . "','authorize_admin'=>static fn(): bool => authorizePleskAdminSession()];\n");
putenv('KYSELYT_CONFIG=' . $external);
$loaded = loadKyselytConfig();
hostCheck($loaded['database'] === $private . '/kyselyt.sqlite', 'external config keeps database beside private config');
unset($_SERVER['REMOTE_USER'], $_SERVER['REDIRECT_REMOTE_USER']);
$_SERVER['HTTP_REMOTE_USER'] = 'spoofed-browser-value';
hostCheck(serverAuthenticatedAdminIdentity() === null, 'client-style user variable is not trusted');
$_SERVER['REMOTE_USER'] = 'plesk-admin';
hostCheck(serverAuthenticatedAdminIdentity() === 'plesk-admin', 'server REMOTE_USER is accepted');
hostCheck(authorizePleskAdminSession(), 'server-authenticated admin session starts');
$params = session_get_cookie_params();
hostCheck(session_status() === PHP_SESSION_ACTIVE, 'admin PHP session is active');
hostCheck(ini_get('session.use_strict_mode') === '1', 'strict session mode enabled');
hostCheck($params['secure'] && $params['httponly'] && $params['samesite'] === 'Strict' && $params['path'] === '/kyselyt/hallinta/', 'admin cookie is Secure HttpOnly SameSite Strict and path-scoped');
hostCheck(($_SESSION['kyselyt_admin_principal'] ?? null) === 'plesk-admin', 'authenticated principal is bound to session');
session_write_close();
foreach ($results as $line) echo $line . "\n";
foreach (glob($tmp . '/*') ?: [] as $path) if (is_file($path)) unlink($path);
if (is_file($external)) unlink($external);
@rmdir($private); @rmdir($root); @rmdir($tmp);
