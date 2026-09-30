<?php
declare(strict_types=1);

const OPTIONS = [
    'basics' => 'Tarvitsen peruskoulutusta',
    'refresh' => 'Tarvitsen kertausta tai syventämistä',
    'sufficient' => 'Osaamiseni riittää työssäni',
    'not_needed' => 'En tarvitse tätä työssäni',
    'unsure' => 'En osaa arvioida koulutustarvettani',
];
const TEAM_LABEL = 'Myös tiimissämme on koulutustarvetta tässä aiheessa.';

final class RequestError extends RuntimeException {
    public function __construct(public int $status, string $message, public array $details = []) {
        parent::__construct($message);
    }
}
function textField(mixed $value, int $max, bool $required = true): string {
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
        throw new RequestError(422, 'Tekstikentän muoto on virheellinen.');
    }
    $value = trim($value);
    if (($required && $value === '') || mb_strlen($value) > $max || str_contains($value, "\0")) {
        throw new RequestError(422, "Tekstikenttä on tyhjä tai ylittää sallitun pituuden ($max merkkiä).");
    }
    return $value;
}
function identifier(mixed $value): string {
    if (!is_string($value) || !preg_match('/\A[a-zA-Z0-9_-]{1,100}\z/D', $value)) {
        throw new RequestError(422, 'Tunniste on virheellinen.');
    }
    return $value;
}
function definition(mixed $input): array {
    if (!is_array($input) || ($input['schemaVersion'] ?? null) !== 1) {
        throw new RequestError(422, 'Tuonti vaatii schemaVersion-arvon 1.');
    }
    $d = ['schemaVersion' => 1, 'title' => textField($input['title'] ?? null, 250),
        'description' => textField($input['description'] ?? '', 3000, false),
        'instructions' => textField($input['instructions'] ?? '', 3000, false)];
    if (!is_array($input['options'] ?? null) || !array_is_list($input['options']) || count($input['options']) !== 5) {
        throw new RequestError(422, 'Tuonnissa on oltava viisi koulutustarpeen vaihtoehtoa.');
    }
    $ids = [];
    foreach ($input['options'] as $o) {
        if (!is_array($o) || !is_string($o['id'] ?? null) || !isset(OPTIONS[$o['id']]) || isset($ids[$o['id']])) {
            throw new RequestError(422, 'Vastausvaihtoehtojen tunnisteet eivät vastaa sopimusta.');
        }
        $ids[$o['id']] = true;
    }
    $d['options'] = array_map(fn($id, $label) => ['id' => $id, 'label' => $label], array_keys(OPTIONS), array_values(OPTIONS));
    if (($input['teamOption']['required'] ?? null) !== false) {
        throw new RequestError(422, 'Tiimihavainnon pitää olla vapaaehtoinen.');
    }
    $d['teamOption'] = ['label' => TEAM_LABEL, 'required' => false];
    $groups = $input['groups'] ?? null;
    if (!is_array($groups) || !array_is_list($groups) || count($groups) < 1 || count($groups) > 300) {
        throw new RequestError(422, 'Kyselyssä pitää olla 1–300 aihealuetta.');
    }
    $seenGroups = $seenQuestions = []; $count = 0; $d['groups'] = [];
    foreach ($groups as $g) {
        if (!is_array($g)) throw new RequestError(422, 'Aihealueen muoto on virheellinen.');
        $id = identifier($g['id'] ?? null);
        if (isset($seenGroups[$id])) throw new RequestError(422, 'Aihealueen tunniste toistuu.');
        $seenGroups[$id] = true;
        $group = ['id' => $id, 'title' => textField($g['title'] ?? null, 250),
            'description' => textField($g['description'] ?? '', 3000, false), 'questions' => []];
        if (!is_array($g['questions'] ?? null) || !array_is_list($g['questions']) || !$g['questions']) {
            throw new RequestError(422, 'Aihealueelta puuttuvat kysymykset.');
        }
        $titles = [];
        foreach ($g['questions'] as $q) {
            if (!is_array($q)) throw new RequestError(422, 'Kysymyksen muoto on virheellinen.');
            $qid = identifier($q['id'] ?? null);
            $title = textField($q['title'] ?? null, 300);
            $titleKey = mb_strtolower(preg_replace('/\s+/u', ' ', $title));
            if (isset($seenQuestions[$qid]) || isset($titles[$titleKey])) {
                throw new RequestError(422, 'Kysymyksen tunniste tai saman aihealueen kysymys toistuu.');
            }
            if (($q['required'] ?? null) !== true || ++$count > 300) {
                throw new RequestError(422, 'Kyselyssä voi olla enintään 300 pakollista kysymystä.');
            }
            $seenQuestions[$qid] = true; $titles[$titleKey] = true;
            $group['questions'][] = ['id' => $qid, 'title' => $title,
                'description' => textField($q['description'] ?? '', 3000, false), 'required' => true];
        }
        $d['groups'][] = $group;
    }
    return $d;
}
function encode(mixed $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}
function decode(string $json): mixed {
    try { return json_decode($json, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { throw new RequestError(422, 'JSON-tiedosto tai pyyntö ei ole kelvollinen.'); }
}
function db(array $config, bool $create = false): PDO {
    $path = $config['database'] ?? '';
    $parent = realpath(dirname($path));
    $root = realpath(($_SERVER['DOCUMENT_ROOT'] ?? '') ?: dirname(__DIR__, 2));
    if (!$parent || !str_starts_with($path, '/') || ($root && ($parent === $root || str_starts_with($parent, $root . '/')))) {
        throw new RuntimeException('Database must be outside document root');
    }
    if (!$create && !is_file($path)) throw new RuntimeException('Install the database before serving requests');
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    return $pdo;
}
function one(PDO $db, string $sql, array $args = []): array|false {
    $stmt = $db->prepare($sql); $stmt->execute($args); return $stmt->fetch();
}
function execute(PDO $db, string $sql, array $args = []): void {
    $db->prepare($sql)->execute($args);
}
function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function questions(array $d): array { return array_merge(...array_column($d['groups'], 'questions')); }
function rateLimit(PDO $db, string $bucket, int $limit): void {
    $time = time();
    execute($db, 'DELETE FROM rate_limits WHERE window_start < ?', [$time - 3600]);
    execute($db, 'INSERT INTO rate_limits(bucket,window_start,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count+1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END', [$bucket, $time, $time - 60, $time - 60]);
    if ((int)one($db, 'SELECT count FROM rate_limits WHERE bucket=?', [$bucket])['count'] > $limit) {
        throw new RequestError(429, 'Vastauksia saapuu juuri nyt paljon. Odota minuutti ja yritä uudelleen.');
    }
}
function submit(PDO $db, mixed $payload, string $bucket): array {
    if (!is_array($payload)) throw new RequestError(422, 'Vastauksen muoto on virheellinen.');
    $token = $payload['token'] ?? '';
    $key = $payload['idempotencyKey'] ?? '';
    if (!is_string($token) || !preg_match('/\A[a-f0-9]{48}\z/D', $token) || !is_string($key) || !preg_match('/\A[a-f0-9]{64}\z/D', $key)) {
        throw new RequestError(422, 'Lähetyksen tunniste on virheellinen.');
    }
    $db->exec('BEGIN IMMEDIATE');
    try {
        $s = one($db, 'SELECT * FROM surveys WHERE public_token=?', [$token]);
        if (!$s || $s['state'] === 'draft') throw new RequestError(404, 'Kyselyä ei löytynyt.');
        $d = decode($s['definition_json']);
        $name = textField($payload['firstName'] ?? null, 100);
        $feedback = textField($payload['feedback'] ?? '', 5000, false);
        $raw = $payload['answers'] ?? null;
        if (!is_array($raw) || !array_is_list($raw) || count($raw) !== count(questions($d))) {
            throw new RequestError(422, 'Vastaa jokaiseen kysymykseen kerran.');
        }
        $byId = [];
        foreach ($raw as $a) {
            if (!is_array($a)) throw new RequestError(422, 'Vastauksen muoto on virheellinen.');
            $qid = identifier($a['questionId'] ?? null);
            if (isset($byId[$qid]) || !is_string($a['optionId'] ?? null) || !isset(OPTIONS[$a['optionId']]) || !is_bool($a['teamNeed'] ?? null)) {
                throw new RequestError(422, 'Vastausvaihtoehto, tiimihavainto tai kysymystunniste on virheellinen.');
            }
            $byId[$qid] = ['questionId' => $qid, 'optionId' => $a['optionId'], 'teamNeed' => $a['teamNeed']];
        }
        $answers = [];
        foreach (questions($d) as $q) {
            if (!isset($byId[$q['id']])) throw new RequestError(422, 'Kysymykseen puuttuu vastaus.');
            $answers[] = $byId[$q['id']];
        }
        $hash = hash('sha256', encode([$name, $feedback, $answers]));
        $existing = one($db, 'SELECT id,payload_hash FROM submissions WHERE survey_id=? AND idempotency_key=?', [$s['id'], $key]);
        if ($existing) {
            if (!hash_equals($existing['payload_hash'], $hash)) {
                throw new RequestError(409, 'Aiempi lähetys on jo tallennettu. Muutettuja vastauksia ei tallennettu uudestaan.', ['alreadySaved' => true]);
            }
            $db->exec('COMMIT');
            return ['saved' => true, 'receipt' => (string)$existing['id']];
        }
        if ($s['state'] !== 'open') throw new RequestError(410, 'Kysely on suljettu. Vastauksia ei tallennettu.');
        rateLimit($db, $bucket, 300);
        execute($db, 'INSERT INTO submissions(survey_id,idempotency_key,payload_hash,first_name,feedback,submitted_at) VALUES(?,?,?,?,?,?)', [$s['id'], $key, $hash, $name, $feedback, now()]);
        $id = $db->lastInsertId();
        foreach ($answers as $a) execute($db, 'INSERT INTO answers VALUES(?,?,?,?)', [$id, $a['questionId'], $a['optionId'], (int)$a['teamNeed']]);
        $db->exec('COMMIT');
        return ['saved' => true, 'receipt' => $id];
    } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}
function csvSafe(string $value): string {
    return preg_match('/\A[\s\x00-\x20]*[=+@-]/u', $value) ? "'" . $value : $value;
}
function exportCsv(PDO $db, array $s, mixed $out): void {
    fwrite($out, "\xEF\xBB\xBF");
    $d = decode($s['definition_json']);
    $headers = ['Vastaustunniste','Kyselytunniste','Kyselyn nimi','Yritys','Vastausaika','Etunimi'];
    foreach ($d['groups'] as $g) foreach ($g['questions'] as $q) {
        $label = $g['title'] . ' / ' . $q['title'] . ' [' . $q['id'] . ']';
        $headers[] = $label . ' / Oma koulutustarve'; $headers[] = $label . ' / Tiimihavainto';
    }
    $headers[] = 'Vapaa palaute';
    fputcsv($out, array_map('csvSafe', $headers), ';', '"', '', "\r\n");
    $stmt = $db->prepare('SELECT * FROM submissions WHERE survey_id=? ORDER BY id'); $stmt->execute([$s['id']]);
    while ($sub = $stmt->fetch()) {
        $row = [(string)$sub['id'], (string)$s['id'], $s['title'], $s['organisation'], (new DateTimeImmutable($sub['submitted_at']))->setTimezone(new DateTimeZone('Europe/Helsinki'))->format('Y-m-d H:i:s P'), $sub['first_name']];
        $as = $db->prepare('SELECT * FROM answers WHERE submission_id=?'); $as->execute([$sub['id']]);
        $answers = array_column($as->fetchAll(), null, 'question_id');
        foreach (questions($d) as $q) {
            $a = $answers[$q['id']]; $row[] = OPTIONS[$a['option_id']]; $row[] = $a['team_need_flag'] ? 'Kyllä' : 'Ei ilmoitettu';
        }
        $row[] = $sub['feedback']; fputcsv($out, array_map('csvSafe', $row), ';', '"', '', "\r\n");
    }
}
