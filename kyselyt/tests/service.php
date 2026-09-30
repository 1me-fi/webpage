<?php
declare(strict_types=1);
require dirname(__DIR__) . '/lib/service.php';
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); echo "PASS $message\n"; }
function rejects(callable $fn, int $status, string $message): void {
    try { $fn(); } catch (RequestError $e) { check($e->status === $status, $message); return; }
    throw new RuntimeException("Expected rejection: $message");
}
$path = sys_get_temp_dir() . '/kyselyt-test-' . bin2hex(random_bytes(8)) . '.sqlite';
$db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
try {
    $db->exec(file_get_contents(dirname(__DIR__) . '/lib/schema.sql'));
    $d = definition(decode(file_get_contents(__DIR__ . '/example.json')));
    check(count(questions($d)) === 6, 'example imports six questions');
    $bad = $d; $bad['groups'][0]['questions'][1]['id'] = 'overload';
    rejects(fn() => definition($bad), 422, 'duplicate question rejected');
    $bad = $d; $bad['groups'][0]['questions'][1]['title'] = $bad['groups'][0]['questions'][0]['title'];
    rejects(fn() => definition($bad), 422, 'duplicate title in group rejected');
    $token = bin2hex(random_bytes(24));
    execute($db, 'INSERT INTO surveys VALUES(1,?,?,?,?,?,?,?,NULL)', [$token, $d['title'], 'Testi', 'open', encode($d), now(), now()]);
    $payload = ['token'=>$token,'idempotencyKey'=>bin2hex(random_bytes(32)), 'firstName'=>'Ääkkönen', 'feedback'=>"=SUM(A1:A2); \"testi\"\nuusi rivi", 'answers'=>array_map(fn($q)=>['questionId'=>$q['id'],'optionId'=>'unsure','teamNeed'=>false],questions($d))];
    $a = submit($db,$payload,'test'); $b = submit($db,$payload,'test');
    check($a === $b && (int)$db->query('SELECT COUNT(*) FROM submissions')->fetchColumn() === 1, 'identical retries save exactly once');
    check((int)$db->query('SELECT COUNT(*) FROM answers')->fetchColumn() === 6, 'all six answers saved');
    $changed = $payload; $changed['firstName']='Muutettu';
    rejects(fn()=>submit($db,$changed,'test'),409,'changed payload under same key rejected');
    $bad=$payload; $bad['idempotencyKey']=bin2hex(random_bytes(32)); array_pop($bad['answers']);
    rejects(fn()=>submit($db,$bad,'test'),422,'missing answer rejected');
    $bad=$payload; $bad['answers'][0]['optionId']='invented';
    rejects(fn()=>submit($db,$bad,'test'),422,'unknown option rejected');
    $bad=$payload; $bad['answers'][0]['questionId']='invented';
    rejects(fn()=>submit($db,$bad,'test'),422,'unknown question rejected');
    $bad=$payload; $bad['answers'][0]['teamNeed']='false';
    rejects(fn()=>submit($db,$bad,'test'),422,'team need must be boolean');
    $bad=$payload; $bad['firstName']=str_repeat('ä',101);
    rejects(fn()=>submit($db,$bad,'test'),422,'Unicode name length checked');
    execute($db,"UPDATE surveys SET state='closed' WHERE id=1");
    check(submit($db,$payload,'test') === $a,'lost success recoverable after survey closes');
    $bad=$payload; $bad['idempotencyKey']=bin2hex(random_bytes(32));
    rejects(fn()=>submit($db,$bad,'test'),410,'closed survey rejects new submission');
    try { execute($db,"UPDATE surveys SET title='changed' WHERE id=1"); throw new RuntimeException('Mutable published content'); } catch(PDOException $e) { echo "PASS published definition immutable\n"; }
    execute($db,"UPDATE surveys SET state='open' WHERE id=1");
    $db->exec("CREATE TRIGGER force_failure BEFORE INSERT ON answers WHEN NEW.question_id='speed' BEGIN SELECT RAISE(ABORT,'test'); END");
    try { submit($db,$bad,'test'); throw new RuntimeException('Expected database failure'); } catch(PDOException $e) {}
    check((int)$db->query('SELECT COUNT(*) FROM submissions')->fetchColumn() === 1 && (int)$db->query('SELECT COUNT(*) FROM answers')->fetchColumn() === 6,'mid-transaction failure rolls back entire response');
    $db->exec('DROP TRIGGER force_failure');
    $out=fopen('php://temp','w+b'); exportCsv($db,one($db,'SELECT * FROM surveys WHERE id=1'),$out); rewind($out); $bytes=stream_get_contents($out);
    check(str_starts_with($bytes,"\xEF\xBB\xBF"),'CSV UTF-8 BOM');
    rewind($out); $headers=fgetcsv($out,0,';','"',''); $row=fgetcsv($out,0,';','"','');
    check(count($headers) === 19 && count($row) === 19 && $row[5] === 'Ääkkönen' && $row[18] === "'".$payload['feedback'] && $row[7] === 'Ei ilmoitettu' && fgetcsv($out,0,';','"','') === false,'CSV quoting, multiline, formula neutralization, team semantics and row count');
    check(csvSafe("\t=1") === "'\t=1",'leading whitespace formula neutralized');
    $backup = $path.'.backup'; $db->exec('VACUUM INTO '.$db->quote($backup)); $restored=new PDO('sqlite:'.$backup);
    check($restored->query('PRAGMA integrity_check')->fetchColumn() === 'ok' && (int)$restored->query('SELECT COUNT(*) FROM answers')->fetchColumn() === 6,'backup restored and integrity checked');
    $restored=null; unlink($backup);
    echo "All service tests passed.\n";
} finally { $db=null; if(is_file($path)) unlink($path); }
