<?php
declare(strict_types=1);
$_SESSION['kyselyt_csrf'] ??= bin2hex(random_bytes(32));
$csrf = $_SESSION['kyselyt_csrf'];
$notice = '';
$base = '/kyselyt/hallinta/';
function csrfInput(string $csrf): string { return '<input type="hidden" name="csrf" value="' . h($csrf) . '">'; }
function adminLink(int|string $id): string { return '/kyselyt/hallinta/?survey=' . rawurlencode((string)$id); }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_string($_POST['csrf'] ?? null) || !hash_equals($csrf, $_POST['csrf'])) throw new RequestError(403, 'Istunto vanhentui. Lataa sivu uudelleen.');
    $action = $_POST['action'] ?? '';
    if ($action === 'preview') {
        $file = $_FILES['definition'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 1048576 || !is_uploaded_file($file['tmp_name'])) throw new RequestError(422, 'Valitse enintään 1 MiB:n JSON-tiedosto.');
        $d = definition(decode(file_get_contents($file['tmp_name'])));
        $_SESSION['kyselyt_import'] = $d;
        $notice = 'Tuonti on valmis esikatseltavaksi. Tallenna uutena luonnoksena alla.';
    } elseif ($action === 'import') {
        if (!isset($_SESSION['kyselyt_import'])) throw new RequestError(422, 'Tuo ensin JSON-tiedosto esikatseluun.');
        $d = definition($_SESSION['kyselyt_import']);
        $d['title'] = textField($_POST['title'] ?? null, 250);
        $org = textField($_POST['organisation'] ?? null, 250);
        execute($db, 'INSERT INTO surveys(public_token,title,organisation,state,definition_json,created_at) VALUES(?,?,?,?,?,?)', [bin2hex(random_bytes(24)), $d['title'], $org, 'draft', encode($d), now()]);
        unset($_SESSION['kyselyt_import']);
        header('Location: ' . adminLink($db->lastInsertId()), true, 303); exit;
    } elseif ($action === 'state') {
        $id = filter_var($_POST['survey'] ?? null, FILTER_VALIDATE_INT);
        $state = $_POST['state'] ?? '';
        if (!$id || !in_array($state, ['open', 'closed'], true)) throw new RequestError(422, 'Virheellinen tilamuutos.');
        $db->exec('BEGIN IMMEDIATE');
        try {
            $s = one($db, 'SELECT * FROM surveys WHERE id=?', [$id]);
            if (!$s) throw new RequestError(404, 'Kyselyä ei löytynyt.');
            if ($s['state'] === 'draft' && $state !== 'open') throw new RequestError(422, 'Julkaise luonnos ensin.');
            execute($db, 'UPDATE surveys SET state=?,published_at=COALESCE(published_at,?),closed_at=? WHERE id=?', [$state, now(), $state === 'closed' ? now() : null, $id]);
            $db->exec('COMMIT');
        } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
        header('Location: ' . adminLink($id), true, 303); exit;
    } else throw new RequestError(422, 'Tuntematon toiminto.');
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') throw new RequestError(405, 'Pyyntömenetelmä ei ole sallittu.');
$id = filter_var($_GET['survey'] ?? null, FILTER_VALIDATE_INT);
$s = $id ? one($db, 'SELECT * FROM surveys WHERE id=?', [$id]) : null;
if (isset($_GET['survey']) && !$s) throw new RequestError(404, 'Kyselyä ei löytynyt.');
if ($s && isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="kysely-' . (int)$id . '.csv"');
    exportCsv($db, $s, fopen('php://output', 'wb')); exit;
}
$labels = ['draft' => 'Luonnos', 'open' => 'Avoin', 'closed' => 'Suljettu'];
$out = '<main class="admin"><h1>Kyselyiden hallinta</h1><p><a href="' . $base . '">Kaikki kyselyt</a></p>';
if ($notice) $out .= '<p role="status">' . h($notice) . '</p>';
if ($s) {
    $d = decode($s['definition_json']);
    $out .= '<section class="k-question"><h2>' . h($s['title']) . '</h2><p>' . h($s['organisation']) . ' · ' . $labels[$s['state']] . '</p>';
    if ($s['state'] !== 'draft') {
        $public = rtrim($config['public_origin'], '/') . '/kyselyt/k/' . $s['public_token'];
        $out .= '<label class="k-field">Vastauslinkki<input readonly value="' . h($public) . '" aria-describedby="copy-help"></label><p id="copy-help">Valitse ja kopioi linkki vastaajille.</p><a href="' . h($public) . '">Avaa vastausnäkymä</a>';
    }
    $target = $s['state'] === 'open' ? 'closed' : 'open';
    $out .= '<form method="post">' . csrfInput($csrf) . '<input type="hidden" name="action" value="state"><input type="hidden" name="survey" value="' . (int)$id . '"><input type="hidden" name="state" value="' . $target . '"><p><button class="k-action k-primary">' . ($s['state'] === 'draft' ? 'Julkaise kysely' : ($target === 'open' ? 'Avaa vastaaminen' : 'Sulje vastaaminen')) . '</button></p></form></section>';
    $count = one($db, 'SELECT COUNT(*) AS n FROM submissions WHERE survey_id=?', [$id])['n'];
    $out .= '<h2>Vastaukset (' . (int)$count . ')</h2><p><a href="' . adminLink($id) . '&amp;csv=1">Lataa CSV</a></p>';
    $page = max(1, (int)($_GET['page'] ?? 1)); $offset = ($page - 1) * 25;
    $stmt = $db->prepare('SELECT * FROM submissions WHERE survey_id=? ORDER BY id DESC LIMIT 25 OFFSET ?'); $stmt->bindValue(1, $id, PDO::PARAM_INT); $stmt->bindValue(2, $offset, PDO::PARAM_INT); $stmt->execute();
    foreach ($stmt as $sub) {
        $time = (new DateTimeImmutable($sub['submitted_at']))->setTimezone(new DateTimeZone('Europe/Helsinki'))->format('d.m.Y H:i P');
        $out .= '<details class="k-question"><summary>' . h($sub['first_name']) . ' · ' . h($time) . ' · #' . (int)$sub['id'] . '</summary>';
        $as = $db->prepare('SELECT * FROM answers WHERE submission_id=?'); $as->execute([$sub['id']]); $answers = array_column($as->fetchAll(), null, 'question_id');
        foreach ($d['groups'] as $g) {
            $out .= '<h3>' . h($g['title']) . '</h3>';
            foreach ($g['questions'] as $q) { $a = $answers[$q['id']]; $out .= '<p><strong>' . h($q['title']) . '</strong><br>' . h(OPTIONS[$a['option_id']]) . '<br>Tiimihavainto: ' . ($a['team_need_flag'] ? 'Kyllä' : 'Ei ilmoitettu') . '</p>'; }
        }
        $out .= '<p>' . nl2br(h($sub['feedback'])) . '</p></details>';
    }
    if ($page > 1) $out .= '<a href="' . adminLink($id) . '&amp;page=' . ($page - 1) . '">Edellinen sivu</a> ';
    if ($offset + 25 < $count) $out .= '<a href="' . adminLink($id) . '&amp;page=' . ($page + 1) . '">Seuraava sivu</a>';
    $out .= '<details class="k-question"><summary>Kyselyn sisältö</summary>';
    foreach ($d['groups'] as $g) { $out .= '<h3>' . h($g['title']) . '</h3>'; foreach ($g['questions'] as $q) $out .= '<p><strong>' . h($q['title']) . '</strong><br>' . h($q['description']) . '</p>'; }
    $out .= '</details>';
} else {
    $out .= '<section class="k-question"><h2>Tuo uusi kysely</h2><form method="post" enctype="multipart/form-data">' . csrfInput($csrf) . '<input type="hidden" name="action" value="preview"><label class="k-field">JSON-tiedosto (enintään 1 MiB)<input type="file" name="definition" accept="application/json,.json" required></label><button class="k-action">Näytä esikatselu</button></form></section>';
    if (isset($_SESSION['kyselyt_import'])) {
        $d = $_SESSION['kyselyt_import'];
        $out .= '<section class="k-question"><h2>Tuonnin esikatselu</h2><p>' . h($d['description']) . '</p><p>' . h($d['instructions']) . '</p>';
        foreach ($d['groups'] as $g) { $out .= '<h3>' . h($g['title']) . '</h3>'; foreach ($g['questions'] as $q) $out .= '<p><strong>' . h($q['title']) . '</strong><br>' . h($q['description']) . '</p>'; }
        $out .= '<p>Vastausvaihtoehdot: ' . h(implode(' · ', OPTIONS)) . '</p><p>' . h(TEAM_LABEL) . '</p><form method="post">' . csrfInput($csrf) . '<input type="hidden" name="action" value="import"><label class="k-field">Kyselyn nimi<input name="title" maxlength="250" required value="' . h($d['title']) . '"></label><label class="k-field">Organisaatio / asiakasryhmä<input name="organisation" maxlength="250" required></label><button class="k-action k-primary">Tallenna luonnos</button></form></section>';
    }
    $out .= '<h2>Kyselyt</h2><div class="table-wrap"><table><thead><tr><th>Nimi</th><th>Tila</th><th>Luotu</th><th>Vastauksia</th></tr></thead><tbody>';
    $rows = $db->query('SELECT s.*, (SELECT COUNT(*) FROM submissions r WHERE r.survey_id=s.id) AS response_count FROM surveys s ORDER BY s.id DESC')->fetchAll();
    foreach ($rows as $row) $out .= '<tr><td><a href="' . adminLink($row['id']) . '">' . h($row['title']) . '</a><br>' . h($row['organisation']) . '</td><td>' . $labels[$row['state']] . '</td><td>' . h((new DateTimeImmutable($row['created_at']))->setTimezone(new DateTimeZone('Europe/Helsinki'))->format('d.m.Y H:i')) . '</td><td>' . (int)$row['response_count'] . '</td></tr>';
    $out .= '</tbody></table></div>';
}
shell($out . '</main>');
