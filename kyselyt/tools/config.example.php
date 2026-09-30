<?php
// Copy to /private/kyselyt/config.php in the Plesk SSH/File Manager view (outside /httpdocs).
// The web runtime resolves the same file below /var/www/vhosts/1me.fi/private/kyselyt/.
return [
    'database' => __DIR__ . '/kyselyt.sqlite',
    'public_origin' => 'https://1me.fi',
    'rate_secret' => '', // Set to at least 32 random bytes (for example 64 hex characters).
    'authorize_admin' => static function (): bool {
        // Plesk/Apache Password-Protected Directories authenticates the request first.
        // Only server-generated REMOTE_USER/REDIRECT_REMOTE_USER is accepted here.
        return authorizePleskAdminSession();
    },
];
