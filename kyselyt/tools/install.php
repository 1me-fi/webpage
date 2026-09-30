<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/lib/service.php';
$configPath = getenv('KYSELYT_CONFIG');
if (!$configPath || !is_file($configPath)) { fwrite(STDERR, "Set KYSELYT_CONFIG to the external configuration file.\n"); exit(1); }
$config = require $configPath;
umask(0077);
$pdo = db($config, true);
$pdo->exec(file_get_contents(dirname(__DIR__) . '/lib/schema.sql'));
chmod($config['database'], 0600);
echo "Schema installed. No surveys published or administrator accounts created.\n";
