# KYSELYT-20260930-01 — implementation checkpoint

Status: **PARTIAL**, not production-ready acceptance. User target: `https://1me.fi/kyselyt/`; the Plesk host/runtime/storage/auth shape has now been verified and the respondent UI is user-approved. Main integration, production deployment and real-host smoke are still pending.

## Baseline and ownership

- Implementation base: webpage main `6a1f7950e6445d8a6340c2748b0e622b174a7e50`.
- Isolated work branch: `work/kyselyt-20260930-01`.
- Clean checkout before work; no local stashes/other worktrees. No open webpage PRs returned at preflight. User's laptop-only work is unknown; this change only adds `kyselyt/`.
- Platform registry read was empty; the scoped reservation was published with blob-SHA compare-and-swap and read back before editing. Coordination commit `30802a8f5e3c9a3bb472ebfb567fa85480aa58da`.
- Codex acts as implementation and GitHub action owner for this work. Master/supervisor checks are by the same actor, **not independent double verification**. No messages sent to other actors.
- Preserved markers: existing root, root `.htaccess`, UI Playground, STUI-20-002 and STUI-20-004 fixtures/behaviors. No deletions or modifications outside the new directory.

## Tests actually run

| Test | Result | Evidence scope |
|---|---|---|
| PHP syntax | PASS | All seven PHP files, PHP 8.3.6 CLI |
| `tests/service.php` | PASS, 19 assertions | Real SQLite transactions, canonical validation, duplicate retries/conflicts, closed state, immutable definition, injected mid-transaction failure, CSV/BOM/formula/newlines, restored backup integrity |
| `tests/http_cgi.py` | PASS, 17 assertions | Actual PHP CGI execution with temporary SQLite and synthetic auth adapter; anonymous admin/CSV denial, 404/draft/closed HTML, API save/retry/conflict, closure, CSRF, admin reopen, CSV and database failure rollback |
| `tests/export.test.cjs` | PASS, 3 tests | Synthetic package-derived spreadsheet rows; selection, semantic IDs, ordering, no maintenance-note leakage, invalid content rejection |
| Existing `ui/tests/playground.test.mjs` | PASS, 21 tests | Existing webpage UI Playground regression suite |

## Not tested or not completed

- 1me.fi Plesk access, document root, automatic Git deployment target, PHP 8.3.35 runtime, SQLite/mbstring support, private storage and Password-Protected Directory were verified. The adapter now targets that host contract. No production write/deploy occurred; real Apache auth propagation and routing must still be confirmed by live smoke.
- Browser/UI smoke at 320/390/768/1280 and 200% text is **NOT RUN**. The local Chrome process failed because this execution environment denies the required socket operation. No screenshot or simulated layout is represented as browser evidence. The local PHP listener is not a publicly reachable review server. CGI checks above do not test Apache or visual rendering.
- Live Sheets metadata returned HTTP 403. Exporter is not inserted into Apps Script; both real templates and existing Forms behavior remain unverified and unchanged.
- Respondent UI approval is recorded. There is still no main merge, no real response collection, no host backup scheduling or production restore test.

## Handoff gates

1. Independently review the Plesk adapter and focused auth/config/session tests on the exact PR head.
2. Before first live smoke, create the private `/private/kyselyt/config.php`, set its secret/permissions and initialize the SQLite schema; do not place secrets under `/httpdocs`.
3. After an explicit merge/deploy gate, verify the Plesk protected `/kyselyt/hallinta/` path, anonymous denial, authenticated admin/CSRF/CSV, public survey submission and protected paths on the real host.
4. Obtain access to the referenced Google spreadsheet and existing Apps Script; verify export on both actual tabs without replacing Forms/onOpen.

Only package-scoped changes: yes. Product-scope deviations: no; unknown host integration is explicitly pending. Unsolicited feature additions: no. No new authentication database, email delivery, respondent accounts, reload persistence, scoring or charts. Do not treat this checkpoint as PASS or production completion.
