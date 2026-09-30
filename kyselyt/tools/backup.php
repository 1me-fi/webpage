<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/lib/service.php';
try { $config = loadKyselytConfig(); }
catch (Throwable $e) { fwrite(STDERR, "Kyselyt config error: " . $e->getMessage() . "\n"); exit(1); }
$destination = $argv[1] ?? '';
if (!$destination || file_exists($destination) || !is_dir(dirname($destination))) { fwrite(STDERR, "Provide a new absolute private backup filename.\n"); exit(1); }
$root = realpath(dirname(__DIR__, 2)); $parent = realpath(dirname($destination));
if (!str_starts_with($destination, '/') || $parent === $root || str_starts_with($parent, $root . '/')) { fwrite(STDERR, "Backup must be outside the web root.\n"); exit(1); }
umask(0077); $pdo = db($config);
$pdo->exec('VACUUM INTO ' . $pdo->quote($destination));
chmod($destination, 0600);
$backup = new PDO('sqlite:' . $destination);
if ($backup->query('PRAGMA integrity_check')->fetchColumn() !== 'ok' || $backup->query('PRAGMA foreign_key_check')->fetch()) { fwrite(STDERR, "Backup verification failed.\n"); exit(1); }
echo "Verified backup created.\n";
