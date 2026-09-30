"""Real PHP CGI request tests, without a network listener or production credentials.

Set PHP_CGI and optionally PHP_CGI_ARGS (JSON array) to the test runtime.
The test injects CGI REMOTE_USER to model the identity that Plesk/Apache supplies
after Password-Protected Directories authentication.
"""
import http.cookies
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
CGI = os.environ.get('PHP_CGI', 'php-cgi')
ARGS = json.loads(os.environ.get('PHP_CGI_ARGS', '[]'))

with tempfile.TemporaryDirectory(prefix='kyselyt-cgi-') as tmp:
    private = Path(tmp)
    database = private / 'test.sqlite'
    config = private / 'config.php'
    con = sqlite3.connect(database)
    con.executescript((ROOT / 'kyselyt/lib/schema.sql').read_text())
    definition = json.loads((ROOT / 'kyselyt/tests/example.json').read_text())
    tokens = {state: secrets.token_hex(24) for state in ['open', 'draft', 'closed']}
    for state, token in tokens.items():
        con.execute('INSERT INTO surveys(public_token,title,organisation,state,definition_json,created_at,published_at) VALUES(?,?,?,?,?,?,?)',
                    (token, definition['title'], 'Testi', state, json.dumps(definition), '2026-09-30T06:00:00Z', None if state == 'draft' else '2026-09-30T06:00:00Z'))
    con.commit()

    config.write_text("<?php return ['database'=>" + repr(str(database)) + ", 'rate_secret'=>'" + 'x'*64 + "','public_origin'=>'https://1me.fi','authorize_admin'=>static function():bool { return authorizePleskAdminSession(); }];")

    def request(path, method='GET', payload=None, cookie='', form=False, remote_user=None, spoof_user=None):
        body = (urllib.parse.urlencode(payload) if form else json.dumps(payload)).encode() if payload is not None else b''
        env = dict(os.environ, REQUEST_METHOD=method, REQUEST_URI=path, SCRIPT_FILENAME=str(ROOT / 'kyselyt/index.php'),
                   SCRIPT_NAME='/kyselyt/index.php', DOCUMENT_ROOT=str(ROOT), SERVER_PROTOCOL='HTTP/1.1', SERVER_NAME='1me.fi',
                   SERVER_PORT='443', HTTPS='on', REDIRECT_STATUS='1', REMOTE_ADDR='192.0.2.10', HTTP_COOKIE=cookie,
                   QUERY_STRING=urllib.parse.urlsplit(path).query, CONTENT_LENGTH=str(len(body)),
                   CONTENT_TYPE='application/x-www-form-urlencoded' if form else 'application/json', KYSELYT_CONFIG=str(config))
        if remote_user is not None:
            env['REMOTE_USER'] = remote_user
        if spoof_user is not None:
            env['HTTP_REMOTE_USER'] = spoof_user
        result = subprocess.run([CGI, *ARGS, '-d', 'session.save_path='+str(private)], input=body, env=env, capture_output=True, check=True)
        header, content = result.stdout.split(b'\r\n\r\n', 1)
        headers = dict(line.decode().split(': ',1) for line in header.split(b'\r\n') if b': ' in line)
        status = int(headers.get('Status','200').split()[0])
        return status, headers, content

    def check(condition, label):
        assert condition, label
        print('PASS', label)

    check(request('/kyselyt/hallinta/')[0] == 403, 'anonymous admin denied')
    check(request('/kyselyt/hallinta/?survey=1&csv=1')[0] == 403, 'anonymous CSV denied')
    check(request('/kyselyt/hallinta/', spoof_user='attacker')[0] == 403, 'client-style REMOTE_USER spoof denied')
    check(request('/kyselyt/api/survey/'+tokens['draft'])[0] == 404, 'draft API hidden')
    check(request('/kyselyt/k/'+tokens['draft'])[0] == 404, 'draft HTML hidden')
    check(request('/kyselyt/k/'+'b'*48)[0] == 404, 'unknown HTML link is HTTP 404')
    check(request('/kyselyt/k/'+tokens['closed'])[0] == 410, 'closed HTML page is HTTP 410')
    status, headers, content = request('/kyselyt/k/'+tokens['open'])
    check(status == 200 and b'/kyselyt/assets/survey.js' in content and 'no-store' in headers['Cache-Control'], 'real respondent shell, subpath assets, no cache')
    payload = {'token':tokens['open'],'idempotencyKey':secrets.token_hex(32),'firstName':'Ääkkönen','feedback':'Toive; "lainaus"\nuusi rivi',
               'answers':[{'questionId':q['id'],'optionId':'unsure','teamNeed':True} for g in definition['groups'] for q in g['questions']]}
    status, _, data = request('/kyselyt/api/responses','POST',payload)
    check(status == 200 and json.loads(data)['saved'] is True, 'actual CGI request commits SQLite response')
    check(request('/kyselyt/api/responses','POST',payload)[0] == 200 and con.execute('SELECT COUNT(*) FROM submissions').fetchone()[0] == 1, 'CGI retry is idempotent')
    changed = dict(payload, firstName='Muutos')
    status, _, data = request('/kyselyt/api/responses','POST',changed)
    check(status == 409 and json.loads(data)['alreadySaved'] is True, 'CGI changed retry returns already-saved conflict')
    con.execute("UPDATE surveys SET state='closed' WHERE public_token=?",(tokens['open'],));con.commit()
    check(request('/kyselyt/api/responses','POST',dict(payload,idempotencyKey=secrets.token_hex(32)))[0] == 410, 'closing during completion rejects new response')
    check(request('/kyselyt/api/responses','POST',payload)[0] == 200, 'lost response recovery remains possible after close')
    status, headers, html = request('/kyselyt/hallinta/', remote_user='plesk-admin')
    check(status == 200 and 'Kyselyiden hallinta' in html.decode(), 'server-authenticated Plesk admin opens management')
    set_cookie = headers.get('Set-Cookie', '')
    check('Secure' in set_cookie and 'HttpOnly' in set_cookie and 'SameSite=Strict' in set_cookie and 'Path=/kyselyt/hallinta/' in set_cookie, 'admin session cookie is scoped and hardened')
    jar = http.cookies.SimpleCookie();jar.load(set_cookie);cookie='; '.join(k+'='+v.value for k,v in jar.items())
    check(request('/kyselyt/hallinta/','POST',{'action':'state','survey':1,'state':'open','csrf':'wrong'},cookie,True,remote_user='plesk-admin')[0] == 403, 'admin mutation requires CSRF')
    import re
    csrf=re.search(r'name="csrf" value="([a-f0-9]+)"',html.decode()).group(1)
    check(request('/kyselyt/hallinta/','POST',{'action':'state','survey':1,'state':'open','csrf':csrf},cookie,True,remote_user='plesk-admin')[0] == 303, 'authorized CSRF-protected reopen succeeds')
    status, headers, csv = request('/kyselyt/hallinta/?survey=1&csv=1',cookie=cookie,remote_user='plesk-admin')
    check(status == 200 and csv.startswith(b'\xef\xbb\xbf') and 'text/csv' in headers['Content-Type'], 'authorized CSV download')
    # A missing schema is a real PDO failure; no success response may escape.
    con.execute('DROP TABLE answers'); con.commit()
    status, _, data = request('/kyselyt/api/responses','POST',dict(payload,idempotencyKey=secrets.token_hex(32)))
    check(status == 503 and 'saved' not in json.loads(data) and con.execute('SELECT COUNT(*) FROM submissions').fetchone()[0] == 1, 'CGI database failure returns 503 and rolls back')
    con.close()
