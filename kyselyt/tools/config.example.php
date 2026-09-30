<?php
// Copy OUTSIDE the public document root, chmod 600 and set KYSELYT_CONFIG.
// Adapt to the verified existing host. Never deploy this example unchanged.
return [
    'database' => '/absolute/private/path/kyselyt.sqlite',
    'public_origin' => 'https://1me.fi',
    'rate_secret' => '', // Set to at least 32 random bytes (e.g. 64 hex characters).
    'authorize_admin' => static function (): bool {
        // Load the existing trusted platform bootstrap, start its secure session,
        // and return true only after its SERVER-SIDE administrator permission check.
        // Unconfigured by design; never trust query parameters or browser role flags.
        return false;
    },
];
