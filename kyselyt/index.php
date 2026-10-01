<?php
declare(strict_types=1);
require __DIR__ . '/lib/service.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
function jsonResponse(array $data, int $status = 200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo encode($data); exit;
}
function h(mixed $value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function shell(string $content, bool $script = false): never {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Koulutustarvekysely · 1ME</title><link rel="icon" type="image/svg+xml" href="/kyselyt/assets/1me-logo.svg"><link rel="stylesheet" href="/kyselyt/assets/survey.css"></head><body><div id="survey"><header class="k-top"><div class="k-brand"><img class="k-logo" src="/kyselyt/assets/1me-logo.svg" alt="" aria-hidden="true"><span class="k-wordmark">1ME</span><span>Koulutustarvekysely</span></div><span class="k-muted">1me.fi/kyselyt</span></header>' . $content . '<footer class="k-bottom"><span>TSI Finland Oy</span></footer></div>';
    if ($script) echo '<script type="module" src="/kyselyt/assets/survey.js"></script>';
    echo '</body></html>'; exit;
}
function body(int $limit): mixed {
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new RequestError(415, 'Käytä JSON-pyyntöä.');
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if (strlen($raw) > $limit) throw new RequestError(413, 'Pyyntö ylittää sallitun koon.');
    return decode($raw);
}
$api = false;
try {
    $route = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (!is_string($route)) throw new RequestError(404, 'Sivua ei löytynyt.');
    $api = str_starts_with($route, '/kyselyt/api/');
    if (in_array($route, ['/kyselyt', '/kyselyt/'], true)) {
        shell('<main class="k-sent"><h1>Koulutustarvekyselyt</h1><p>Avaa kouluttajalta tai työnantajalta saamasi kyselylinkki.</p></main>');
    }
    $config = loadKyselytConfig();
    $db = db($config);
    if (preg_match('~\A/kyselyt/k/[a-f0-9]{48}/?\z~D', $route)) {
        $token = basename(rtrim($route, '/'));
        $survey = one($db, 'SELECT state FROM surveys WHERE public_token=?', [$token]);
        if (!$survey || $survey['state'] === 'draft') throw new RequestError(404, 'Kyselyä ei löytynyt.');
        if ($survey['state'] === 'closed') throw new RequestError(410, 'Kysely on suljettu. Kiitos kiinnostuksestasi.');
        shell('<div class="k-layout"><aside class="k-sidebar"><p class="k-eyebrow">Kyselyn aiheet</p><nav class="k-nav" aria-label="Kyselyn osiot"></nav></aside><main><div class="k-progress-label"><span id="k-step"></span><span id="k-count" aria-live="polite"></span></div><progress id="k-progress" max="1" value="0" aria-label="Vastatut kysymykset"></progress><div id="k-content"><p>Ladataan kyselyä…</p></div><p class="k-error" id="k-error" role="alert"></p><div class="k-footer" hidden><button type="button" class="k-action" id="k-prev">Edellinen</button><button type="button" class="k-action k-primary" id="k-next">Seuraava aihe</button></div><noscript>Kyselyyn vastaaminen vaatii JavaScriptin.</noscript></main></div>', true);
    }
    if (preg_match('~\A/kyselyt/api/survey/([a-f0-9]{48})\z~D', $route, $m)) {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') throw new RequestError(405, 'Pyyntömenetelmä ei ole sallittu.');
        $s = one($db, 'SELECT state,definition_json FROM surveys WHERE public_token=?', [$m[1]]);
        if (!$s || $s['state'] === 'draft') throw new RequestError(404, 'Kyselyä ei löytynyt.');
        if ($s['state'] === 'closed') throw new RequestError(410, 'Kysely on suljettu. Kiitos kiinnostuksestasi.');
        jsonResponse(['definition' => decode($s['definition_json'])]);
    }
    if ($route === '/kyselyt/api/responses') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new RequestError(405, 'Pyyntömenetelmä ei ole sallittu.');
        // Never trust forwarded IP headers without a verified platform proxy contract.
        $bucket = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['rate_secret']);
        jsonResponse(submit($db, body(131072), $bucket));
    }
    if (str_starts_with($route, '/kyselyt/hallinta')) {
        // Platform adapter starts its existing session and returns verified admin rights.
        // No parallel user/password database or publicly supplied role/header is accepted.
        $auth = $config['authorize_admin'] ?? null;
        if (!is_callable($auth) || $auth() !== true) throw new RequestError(403, 'Hallinta vaatii ylläpitäjän kirjautumisen.');
        if (session_status() !== PHP_SESSION_ACTIVE) throw new RuntimeException('Admin adapter must start the existing platform session');
        require __DIR__ . '/lib/admin.php';
        exit;
    }
    throw new RequestError(404, 'Sivua ei löytynyt.');
} catch (RequestError $e) {
    if ($e->status === 429) header('Retry-After: 60');
    if ($api) jsonResponse(['error' => $e->getMessage()] + $e->details, $e->status);
    http_response_code($e->status); shell('<main class="k-sent"><h1>' . h($e->status === 404 ? 'Sivua ei löytynyt' : 'Palvelun ilmoitus') . '</h1><p>' . h($e->getMessage()) . '</p></main>');
} catch (Throwable $e) {
    // No payload, personal data, paths, tokens or stack traces in responses/logs.
    error_log('Kyselyt: internal service failure (' . get_class($e) . ')');
    if ($api) jsonResponse(['error' => 'Tallennusta ei voitu vahvistaa. Yritä samaa lähetystä uudelleen.'], 503);
    http_response_code(503); shell('<main class="k-sent"><h1>Palvelu ei ole juuri nyt käytettävissä</h1><p>Yritä myöhemmin uudelleen.</p></main>');
}
