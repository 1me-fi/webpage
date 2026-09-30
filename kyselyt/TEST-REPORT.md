# KYSELYT-20260930-01 — implementation checkpoint

Status: **PARTIAL**, not production-ready acceptance. User target: `https://1me.fi/kyselyt/`; requested deployment scope exists, but the actual hosting access/integration is unavailable. UI approval is explicitly pending. Default C/main integration and target D/deployment are not reached.

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

- Actual 1me.fi SSH/deploy access, runtime extensions, database engine, existing admin rights/session and Apache rewrite behavior are not available. No production write/deploy occurred.
- Browser/UI smoke at 320/390/768/1280 and 200% text is **NOT RUN**. The local Chrome process failed because this execution environment denies the required socket operation. No screenshot or simulated layout is represented as browser evidence. The local PHP listener is not a publicly reachable review server. CGI checks above do not test Apache or visual rendering.
- Live Sheets metadata returned HTTP 403. Exporter is not inserted into Apps Script; both real templates and existing Forms behavior remain unverified and unchanged.
- No UI approval, no main merge, no real response collection, no host backup scheduling or production restore test.

## Handoff gates

1. Review the PR and standalone UI preview. Confirm the visible UI in a real hosted test survey before acceptance.
2. Supply a usable authorized connection to the current 1me.fi hosting environment; verify runtime, DB engine, private storage, auth and deployment effects. Adapt the database/auth adapter to those findings.
3. Obtain access to the referenced Google spreadsheet and existing Apps Script; verify export on both actual tabs without replacing Forms/onOpen.
4. Run the listed real-host/browser/security/restore checks, review the exact base/head and parallel reservations, then complete the authorized main integration and scoped deployment.

Only package-scoped changes: yes. Product-scope deviations: no; unknown host integration is explicitly pending. Unsolicited feature additions: no. No new authentication database, email delivery, respondent accounts, reload persistence, scoring or charts. Do not treat this checkpoint as PASS or production completion.
