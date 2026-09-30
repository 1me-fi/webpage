<?php
declare(strict_types=1);
// Physical entrypoint required by Plesk Password-Protected Directories.
// The canonical router keeps the request URI and performs the same fail-closed server identity check.
require dirname(__DIR__) . '/index.php';
