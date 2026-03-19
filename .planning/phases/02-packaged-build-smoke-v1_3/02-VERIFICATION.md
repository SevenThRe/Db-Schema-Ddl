---
phase: 02-packaged-build-smoke-v1_3
verified: 2026-03-19T00:33:36.2759283Z
status: gaps_found
score: 3/4 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 1/4
  gaps_closed:
    - "Timestamp-prefixed checkpoint parsing no longer produces false win-unpacked readiness/shutdown failures."
    - "The latest win-unpacked artifact pair now proves startup, SQLite readiness, DB 管理 entry, screenshot capture, and clean shutdown."
    - "The NSIS artifact is no longer placeholder metadata; it now records explicit install, first-launch, db-entry, and close outcomes plus blocker/warning findings."
  gaps_remaining:
    - "The latest NSIS run still fails DB 管理 with `SqliteError: no such table: extension_lifecycle_states`."
  regressions: []
gaps:
  - truth: "Installed NSIS builds survive packaged DB-management access after install and first launch, so the packaged smoke goal holds for the real installer surface."
    status: failed
    reason: "The latest structured NSIS artifact records `db-entry=fail`, and the referenced packaged bootstrap log shows `SqliteError: no such table: extension_lifecycle_states` before clean shutdown."
    artifacts:
      - path: "artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.json"
        issue: "Structured installer evidence exists, but `proofStatus` is `failed` and `stepResults.db-entry.status` is `fail`."
      - path: "C:/Users/ISI202502/AppData/Roaming/db-schema-excel-2-ddl/logs/dbschemaexcel2ddl-bootstrap.log"
        issue: "The installed-app bootstrap log contains the missing-table unhandled rejection from the same installer run."
    missing:
      - "Fix packaged install-time SQLite schema or migration coverage so `extension_lifecycle_states` exists before `DB 管理` entry."
      - "Capture a fresh NSIS artifact pair where `install`, `first-launch`, `db-entry`, and `close` all succeed."
      - "Attach installer and first-launch screenshots for the passing installer run."
---

# Phase 2: Packaged Build Smoke Verification Report

**Phase Goal:** Prove `win-unpacked` and installer builds survive packaged startup, shutdown, migration, extension entry, and DB-management access with structured evidence.
**Verified:** 2026-03-19T00:33:36.2759283Z
**Status:** gaps_found
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `win-unpacked` packaged builds survive startup, SQLite init/migration, `DB 管理` entry, and clean shutdown. | ✓ VERIFIED | `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.json` shows `startup`, `sqlite-init`, `extension-entry`, and `shutdown` as `passed`, includes a screenshot path and bootstrap-log excerpt, and carries no blocker findings. The checkpoint parser is now timestamp-tolerant in `script/desktop-packaged-smoke.ts` and the app emits the required checkpoints from `electron/main.ts` plus the real renderer entry path in `client/src/pages/Dashboard.tsx`. |
| 2 | The installer seam now records explicit install, first-launch, `DB 管理`, and close outcomes instead of placeholder success metadata. | ✓ VERIFIED | `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.json` has `stepResults`, `proofStatus`, `evidenceRefs`, warning findings for missing screenshots, and a blocker finding for `DB_ENTRY_FAILURE`. `script/desktop-packaged-smoke-installer.ps1` accepts screenshot/log inputs and writes those exact fields, and `test/electron/packaged-smoke-phase2.test.ts` passes against that contract. |
| 3 | Installed NSIS builds survive `DB 管理` access on at least one recorded packaged run. | ✗ FAILED | The latest NSIS artifact records `install=pass`, `first-launch=pass`, `db-entry=fail`, `close=pass`, with blocker `DB_ENTRY_FAILURE`. The referenced packaged bootstrap log under `C:\Users\ISI202502\AppData\Roaming\db-schema-excel-2-ddl\logs\dbschemaexcel2ddl-bootstrap.log` contains `SqliteError: no such table: extension_lifecycle_states`. |
| 4 | Packaged smoke evidence remains structured and reviewable: JSON + Markdown artifacts, screenshot/log references where captured, and explicit release-blocker policy. | ✓ VERIFIED | `shared/schema.ts` and `script/desktop-smoke.ts` still define one shared packaged artifact model, `docs/desktop-packaged-smoke.md` documents the operator checklist and blocker policy, the latest `win-unpacked` artifact pair includes screenshot/log evidence, and the latest NSIS artifact pair preserves missing screenshot proof as warnings rather than hidden success. |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `shared/schema.ts` | Shared packaged smoke schema for run mode, screenshots, log excerpt, and blocker findings | ✓ VERIFIED | Contains `packaged-win-unpacked`, `packaged-nsis`, `desktopSmokeArtifactSchema`, `screenshotPaths`, `logExcerpt`, and `blockerFindings`. |
| `script/desktop-smoke.ts` | Shared checklist plus JSON/Markdown renderer for packaged evidence | ✓ VERIFIED | Renders screenshots, log excerpts, and blocker findings from the shared artifact model. |
| `script/desktop-packaged-smoke.ts` | `win-unpacked` runner with timestamp-tolerant checkpoint parsing, screenshot extraction, and packaged step classification | ✓ VERIFIED | Uses `matchAll(/\[checkpoint:([^\]]+)\]/g)`, classifies `smoke_sqlite_init_ready` and `smoke_db_management_ready`, and persists screenshot refs from `smoke_screenshot_written`. |
| `electron/main.ts` | Packaged smoke checkpoints for SQLite readiness, DB-management entry, screenshot capture, and clean shutdown | ✓ VERIFIED | Emits `smoke_sqlite_init_ready`, `smoke_db_management_entry_requested`, `smoke_db_management_ready`, `smoke_screenshot_written`, and `server_shutdown_complete`. |
| `client/src/pages/Dashboard.tsx` | Smoke-only use of the real `DB 管理` entry path | ✓ VERIFIED | Reuses `handleDbManagementEntryClick()` and emits `db-management-entry-requested`, `db-management-ready`, and blocked signals from the real flow. |
| `script/desktop-packaged-smoke-installer.ps1` | NSIS artifact writer with explicit step outcomes, evidence refs, and proof status | ✓ VERIFIED | Accepts screenshot/log inputs, computes `proofStatus`, records `stepResults`, and turns failed or missing proof into blocker/warning findings. |
| `docs/desktop-packaged-smoke.md` | Reviewable packaged checklist and installer attachment requirements | ✓ VERIFIED | Documents `installer UI screenshot`, `first-launch screenshot`, `packaged log excerpt`, per-step statuses, and blocker policy. |
| `test/electron/packaged-smoke-phase2.test.ts` | Contract coverage for packaged parser and installer evidence seam | ✓ VERIFIED | `node --test --import tsx test/electron/packaged-smoke-phase2.test.ts` passed with 14/14 tests. |
| `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.json` | Latest `win-unpacked` proof artifact | ✓ VERIFIED | Structured artifact exists and proves the fast packaged path end to end. |
| `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.md` + `.bootstrap.log` + `.png` | Human-review evidence pair plus concrete screenshot/log files | ✓ VERIFIED | All referenced files exist on disk and agree with the JSON artifact. |
| `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.json` | Latest NSIS proof artifact | ✓ VERIFIED | Structured artifact exists, but it records a real runtime blocker rather than a passing installer run. |
| `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.md` | Human-readable mirror of the latest NSIS artifact | ✓ VERIFIED | Mirrors the same `install/pass`, `first-launch/pass`, `db-entry/fail`, `close/pass`, and blocker/warning findings. |
| `C:\Users\ISI202502\AppData\Roaming\db-schema-excel-2-ddl\logs\dbschemaexcel2ddl-bootstrap.log` | Installed-app evidence for the NSIS run | ✓ VERIFIED | Exists and contains the missing-table unhandled rejection plus clean shutdown checkpoints. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `package.json` | `script/desktop-packaged-smoke.ts` | `smoke:packaged` | WIRED | `smoke:packaged` runs `build:electron` and then executes the packaged smoke runner. |
| `script/desktop-packaged-smoke.ts` | `electron/main.ts` | `DBSCHEMA_SMOKE_*` env vars + checkpoint log parsing | WIRED | The runner launches the real packaged exe, waits on checkpoint tokens anywhere in each line, then classifies final step outcomes from the emitted checkpoints. |
| `electron/main.ts` | `client/src/pages/Dashboard.tsx` | smoke-mode console signals for `DB 管理` proof | WIRED | Main process listens for `[desktop-smoke]` console messages and turns the renderer’s real entry flow into `smoke_db_management_*` checkpoints. |
| `script/desktop-packaged-smoke.ts` | `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.*` | JSON + Markdown + screenshot + bootstrap log | WIRED | Latest `win-unpacked` JSON, Markdown, log, and PNG all exist and reference the same run id. |
| `script/desktop-packaged-smoke-installer.ps1` | `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.{json,md}` | `evidenceRefs`, `stepResults`, `proofStatus`, blocker/warning findings | WIRED | Latest NSIS JSON and Markdown mirror the same step outcomes and findings. |
| `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.json` | `C:\Users\ISI202502\AppData\Roaming\db-schema-excel-2-ddl\logs\dbschemaexcel2ddl-bootstrap.log` | `evidenceRefs[kind=packaged-log]` | WIRED | The referenced log exists and corroborates the `DB_ENTRY_FAILURE` blocker. |
| `docs/desktop-packaged-smoke.md` | `script/desktop-packaged-smoke-installer.ps1` | documented command shape and attachment checklist | WIRED | Docs name `-InstallerScreenshotPath`, `-FirstLaunchScreenshotPath`, `-PackagedLogPath`, per-step statuses, and note parameters that the script accepts. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `STAB-05` | `02-01` through `02-06` | Packaged Windows builds have a repeatable smoke path covering startup, SQLite init/migration, extension entry, `DB 管理` access, and clean shutdown. | ✗ BLOCKED | `win-unpacked` now satisfies the path, but the latest installed NSIS run fails `DB 管理` with `SqliteError: no such table: extension_lifecycle_states`, so the real installer surface does not yet survive the required flow. |
| `STAB-06` | `02-01` through `02-06` | Packaged smoke leaves structured JSON/Markdown review evidence plus screenshots/log excerpts and explicit release blockers. | ✓ SATISFIED | Shared schema + renderer are in place, `docs/desktop-packaged-smoke.md` encodes the policy, the `win-unpacked` artifact pair includes screenshot/log evidence, and the NSIS artifact pair keeps missing screenshots and the real blocker explicit instead of hidden. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `-` | `-` | None observed in the touched packaged-smoke code paths | ℹ️ Info | The remaining phase blocker is a real packaged runtime/schema defect evidenced by the installer artifact and packaged log, not a placeholder implementation or unwired seam. |

### Human Verification Required

No additional human-only uncertainty blocks this conclusion. The remaining gap is already evidenced by the latest NSIS JSON/Markdown artifact pair and the packaged bootstrap log. After fixing the installer SQLite schema/migration issue, rerun one NSIS install -> first launch -> `DB 管理` -> close pass with installer and first-launch screenshots attached.

### Gaps Summary

Re-verification closed the earlier evidence-quality gaps. The `win-unpacked` path is now trustworthy: the parser fix is present in code, the app emits the needed checkpoints, the latest artifact pair carries screenshot and log references, and the recorded steps pass through startup, SQLite readiness, `DB 管理` entry, and shutdown.

The phase still does not achieve its goal because the real installer surface fails on `DB 管理`. The latest NSIS artifact is no longer a placeholder; it is good evidence that reveals the product problem clearly. It records `install=pass`, `first-launch=pass`, `db-entry=fail`, and `close=pass`, and the referenced packaged bootstrap log shows `SqliteError: no such table: extension_lifecycle_states`. That leaves `STAB-05` blocked and keeps Phase 2 open from a goal perspective.

---

_Verified: 2026-03-19T00:33:36.2759283Z_
_Verifier: Claude (gsd-verifier)_
