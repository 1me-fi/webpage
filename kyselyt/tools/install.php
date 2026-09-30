<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/lib/service.php';
try { $config = loadKyselytConfig(); }
catch (Throwable $e) { fwrite(STDERR, "Kyselyt config error: " . $e->getMessage() . "\n"); exit(1); }
umask(0077);
$pdo = db($config, true);
$pdo->exec(file_get_contents(dirname(__DIR__) . '/lib/schema.sql'));
chmod($config['database'], 0600);
echo "Schema installed. No surveys published or administrator accounts created.\n";
