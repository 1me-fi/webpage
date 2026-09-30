# Kyselyt — PHP survey service

Work: `KYSELYT-20260930-01`. Source: the supplied 30 September 2026 implementation package. Shared governance remains in `1me-platform`; this document describes only this implementation.

**Status: implementation and verified Plesk host adapter prepared; production smoke, main integration and deployment are still pending.** The user approved the respondent UI on 30 September 2026. No merge or production deployment is claimed.

## Scope

All production files are in `/kyselyt/`; the existing root page, root `.htaccess`, `/ui/` and `/mmd/` remain intact. No production fixture is automatically published. Routes:

- `/kyselyt/`: entry instruction, no public survey listing.
- `/kyselyt/k/{48-character-random-token}`: respondent.
- `GET /kyselyt/api/survey/{token}`: open definition only.
- `POST /kyselyt/api/responses`: transactional, idempotent submission.
- `/kyselyt/hallinta/`: authenticated administration, import preview, draft creation, publishing, closing/reopening, response details and CSV.

Content is immutable after first publication, enforced by an SQLite trigger. Every JSON import creates a separate draft and random link. Questions and answer choices are validated on the server. A team checkbox means a reported observation; unchecked exports as “Ei ilmoitettu”. UTC storage, Europe/Helsinki administration and CSV.

## Verified 1me.fi Plesk host contract

The live host was checked on 30 September 2026:

- public document root: `/var/www/vhosts/1me.fi/httpdocs` (Plesk SSH chroot view: `/httpdocs`);
- PHP `8.3.35`, PHP-FPM served by Apache;
- HTTPS enabled with HTTP→HTTPS redirect;
- `PDO`, `pdo_sqlite`, `sqlite3`, `mbstring` and session support are available;
- Plesk Git tracks `https://github.com/1me-fi/webpage`, branch `main`, with automatic deployment to `/httpdocs`;
- private storage exists at `/private/kyselyt/` with `/private/kyselyt/backups/` outside the document root;
- Plesk Password-Protected Directories protects `/kyselyt/hallinta`.

The application does not create a second administrator database. Plesk/Apache performs HTTP authentication and the PHP adapter accepts only the server-generated `REMOTE_USER` (or Apache rewrite-compatible `REDIRECT_REMOTE_USER`) identity. Browser headers, query parameters and client-side roles are not accepted as authentication. If the server identity is absent, administration fails closed.

A physical `kyselyt/hallinta/` entrypoint is kept in the repository so Plesk can protect a real directory. It delegates to the canonical `kyselyt/index.php` router. The application still performs its own server-identity check even if host protection is accidentally missing.

## Installation

1. In the Plesk File Manager, copy `kyselyt/tools/config.example.php` to the existing private location `/private/kyselyt/config.php` (physical web-runtime path `/var/www/vhosts/1me.fi/private/kyselyt/config.php`). Do not place the config under `/httpdocs`.
2. Keep `database => __DIR__ . '/kyselyt.sqlite'`. This deliberately works both in the Plesk SSH chroot and in the web runtime because it is resolved relative to the private config file itself.
3. Generate a fresh `rate_secret` with at least 32 random bytes and store only the resulting secret in the private config. Never commit it or paste it into tickets/transcripts. The example `authorize_admin` must remain bound to `authorizePleskAdminSession()`.
4. Restrict the private config to the subscription user (target mode `0600`). The production loader automatically resolves the sibling private path from the public document root; `KYSELYT_CONFIG` remains an explicit override for tests or alternate hosts, and is rejected if it points inside the document root.
5. Run `php kyselyt/tools/install.php` from the deployed checkout. It creates the SQLite schema idempotently and publishes no surveys or administrator accounts. Back up an existing database first if one already exists.
6. Keep the Plesk Password-Protected Directory on `/kyselyt/hallinta`. Verify that an anonymous request is challenged/denied and that an authenticated request reaches the PHP admin page. The PHP session uses a dedicated `KYSSESSID` cookie scoped to `/kyselyt/hallinta/`, with Secure, HttpOnly, SameSite=Strict and strict session mode.
7. Verify that `lib/`, `tests/`, `tools/`, README and test report are not served. Test the full workflow with an explicitly marked test survey before sharing any real respondent link. Do not use real personal responses as test fixtures.

The API enforces a 128 KiB request body, canonical options, exactly one answer per question, name 1–100 characters and feedback up to 5,000 characters. JSON import is capped at 1 MiB/300 questions. A per-IP HMAC bucket allows 300 successful new submissions/minute, shared across surveys; retrying an already committed payload does not consume this quota. Buckets expire after one hour. Raw IPs are not stored by this application. Verify hosting access-log policy separately; disable request-body logging and protect logs containing respondent URLs. Apply the host's request-rate/body controls for malformed-request floods, with a group-training shared-network allowance.

## Idempotency and uncertain delivery

The browser creates a cryptographically random 256-bit key for a submission. The server stores a canonical content hash and a unique `(survey_id, idempotency_key)` constraint. `BEGIN IMMEDIATE` serializes SQLite writes; parent and all answers commit together.

After an uncertain network/server result the browser retains the exact submitted payload and key and locks editing. “Yritä samaa lähetystä uudelleen” resends it. Identical retries return the existing receipt, even if the survey has since closed. A changed payload with an already saved key returns HTTP 409 with an already-saved indication, without exposing response contents. The UI explains that the earlier response was saved and changes were not saved again. Definitive validation/closed/rate-limit errors allow correction/retry. There is no reload-resistant draft persistence.

## Sheets exporter

`tools/SheetsExport.gs` is a separate Apps Script file. It adds no replacement `onOpen` and does not modify the existing Forms script or sheets.

1. Add the file to the existing spreadsheet-bound Apps Script project after reviewing existing source.
2. Run `Kyselyt_lisaaValikko` to add a **Kyselypalvelu** menu for the current spreadsheet session; optionally call it from the existing menu initialization after inspecting that function, preserving all current behavior.
3. Select **AUT-KuPi – tiivis kysely** or **AUT-KuPi – kysymyspohja**, select rows in column A, then run the JSON export.
4. Save `kysely.json`; import it through the website's admin preview.

The exporter reads row 6 headers and selected A7+ rows, preserves group/question order, rejects empty/duplicate selected questions, and rejects “täsmennettävä” markers in selected detailed rows. H–I must contain numeric option IDs and their expected meanings (1→not_needed, 2→basics, 3→refresh, 4→sufficient, 5→unsure), plus the separate team observation. The respondent receives the canonical short labels in UI order. Detailed D/E/F maintenance notes are never exposed; its exported description is empty because no respondent description is defined there. Use the concise template for explanatory descriptions. No source sheet is changed.

**Live spreadsheet check pending:** the supplied spreadsheet returned HTTP 403 to the connected account. Header/option recognition is therefore tested against synthetic fixtures derived from the package, not the actual workbook. Inspect the live header and H–I layout before installing; fail-closed errors deliberately stop export when the actual template differs. Google Apps Script editor insertion and authorization have not been performed.

## Operator workflow

Valitse aiheet Sheetsissä → vie JSON → kirjaudu hallintaan → tuo ja esikatsele → anna nimi ja organisaatio → tallenna luonnos → julkaise → kopioi vastauslinkki → tarkastele vastauksia / lataa CSV. Sulje vastaaminen tarvittaessa. Sisältömuutoksesta tehdään uusi tuonti ja uusi linkki.

## Backup and restore

Use `php kyselyt/tools/backup.php /private/kyselyt/backups/kyselyt-YYYYMMDD-HHMM.sqlite` on the Plesk SSH shell. The production default config is discovered automatically; `KYSELYT_CONFIG` is only needed for an explicit override. The destination must be new and outside the web root. SQLite `VACUUM INTO` creates a consistent snapshot; the script checks database integrity and foreign keys. Schedule the command using the host's existing backup policy only after deciding retention and backup destination. Protect/encrypt backups using that system because they contain first names and feedback. No recurring job was installed.

Restore first into a **new private filename**, check `PRAGMA integrity_check` and `PRAGMA foreign_key_check`, and compare survey/submission/answer counts. Test the restored copy with separate test configuration. For an approved real recovery, put only the survey write path into maintenance, retain a verified backup of current data, point the external configuration to the verified restored file with correct ownership/mode, then test reading/admin/export before re-enabling submissions. Do not overwrite the only database or silently discard responses received after a backup. Host-level backup retention, restore and actual permissions still need verification.

## Verification

```sh
php kyselyt/tests/service.php
php kyselyt/tests/host.php
python3 kyselyt/tests/http_cgi.py  # PHP_CGI can name php-cgi; requires the same extensions
node --test kyselyt/tests/export.test.cjs
node --test ui/tests/playground.test.mjs
python3 kyselyt/tools/build-preview.py /private/review/Kyselyt_UI_esikatselu.html
```

The standalone preview uses production CSS and interaction code with a clearly labeled non-persistent transport. It is for UI review only; it neither submits nor stores answers. It is not a production URL or proof of browser QA.

Before acceptance, use the real hosted survey in browsers at 320/390/768/1280 px, with long text and >4 groups, light/dark themes, keyboard navigation and 200% text enlargement. Verify all answer choices/team toggle, missing-answer focus, review/edit and name/feedback preservation, actual submission/retry/database failure, closed-during-completion behavior, admin login/CSRF, CSV and protected paths. Record the tested deployment identity and user's UI approval.
