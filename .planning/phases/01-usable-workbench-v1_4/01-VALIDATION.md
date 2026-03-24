---
phase: 1
slug: usable-workbench
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`--experimental-strip-types`) + Rust `cargo test` |
| **Config file** | none (command-line based) |
| **Quick run command** | `node --test --experimental-strip-types test/client/extension-boundaries.test.ts` |
| **Full suite command** | `node --test --experimental-strip-types test/client/*.test.ts && cargo test -p db-schema-ddl-tauri` |
| **Estimated runtime** | ~30 seconds (client) + ~60 seconds (Rust) |

---

## Sampling Rate

- **After every task commit:** Run `node --test --experimental-strip-types test/client/extension-boundaries.test.ts` (existing regression guard)
- **After every plan wave:** Run full suite (client + Rust)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CONN-01 | unit | `node --test --experimental-strip-types test/client/db-connection-config.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-02 | 01 | 1 | CONN-03 | integration | `cargo test -p db-schema-ddl-tauri db_connector::query::tests` | ❌ Wave 0 | ⬜ pending |
| 1-02-01 | 02 | 1 | EDIT-04 | unit | `node --test --experimental-strip-types test/client/sql-formatter.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-02-02 | 02 | 1 | EXEC-02 | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::query::cancel_tests` | ❌ Wave 0 | ⬜ pending |
| 1-03-01 | 03 | 2 | SAFE-01 | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::query::tests` | ❌ Wave 0 | ⬜ pending |
| 1-03-02 | 03 | 2 | PLAN-01 | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::explain::tests` | ❌ Wave 0 | ⬜ pending |
| 1-03-03 | 03 | 2 | PLAN-02 | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::explain::tests` | ❌ Wave 0 | ⬜ pending |
| 1-04-01 | 04 | 2 | CONN-02 | manual | Visual: workbench header shows colored band | manual-only | ⬜ pending |
| 1-04-02 | 04 | 2 | SAFE-02 | manual | UI: prod dialog requires DB name typing | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/client/db-connection-config.test.ts` — type roundtrip for `environment`, `readonly`, `colorTag`, `defaultSchema` fields on `DbConnectionConfig` (CONN-01)
- [ ] `test/client/sql-formatter.test.ts` — verifies `sql-formatter` formats a known SQL string to expected output (EDIT-04)
- [ ] Rust test module `db_connector::query::tests` inside `src-tauri/src/db_connector/query.rs` — covers CONN-03 readonly rejection + EXEC-02 cancel token unregister + SAFE-01 dangerous SQL detection for all 6 categories
- [ ] Rust test module `db_connector::explain::tests` inside `src-tauri/src/db_connector/explain.rs` — covers PLAN-01 PlanNode normalization (MySQL and PG) + PLAN-02 FULL_TABLE_SCAN/Seq Scan warning detection

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Environment color band visible at all times | CONN-02 | Tauri window rendering — no headless DOM | Open workbench with prod/test/dev connection; verify colored band appears at top, correct color per env, always visible while workbench open |
| Monaco SQL editor with syntax highlighting | EDIT-01 | Monaco renders in Tauri webview — no headless | Open workbench; type a SELECT query; verify keywords are colored |
| Ctrl+Enter executes current statement | EDIT-02 | Keyboard events in Monaco | Editor focused; place cursor in statement; press Ctrl+Enter; verify only current statement runs |
| Shift+Ctrl+Enter runs full script | EDIT-03 | Keyboard events in Monaco | Multiple statements in editor; press Shift+Ctrl+Enter; verify all run |
| Alt+Shift+F formats SQL | EDIT-04 supplemental | Keyboard events | Type unformatted SQL; press Alt+Shift+F; verify formatted output |
| Multi-tab query switching | EDIT-05 | Tauri webview UI | Create 3 tabs; switch between them; verify each retains its SQL |
| Multi-statement incremental execution | EXEC-01 | Requires live DB connection | Connect to MySQL; run 3-statement script; verify per-segment results with elapsed time |
| Stop-on-error toggle | EXEC-01 | Requires live DB + error state | Toggle to continue-on-error; run script with failing middle statement; verify continues |
| Virtual-scroll grid 1000+ rows | EXEC-03 | Requires live DB query | Query that returns 1500 rows; verify "1,000 / 1,500 rows loaded" and "Load more" button |
| Export to CSV/JSON/Markdown/SQL Insert | EXEC-04 | File download | Execute query; open Export menu; download each format; verify file content |
| EXPLAIN node graph rendering | PLAN-01 | Tauri webview + xyflow | Execute EXPLAIN on a SELECT; verify graph renders with nodes and edges |
| Prod confirmation requires DB name | SAFE-02 | Tauri webview UI | Attempt DROP on prod connection; verify dialog shows DB name input; verify submit disabled until correct name typed |
| Readonly connection rejects DML | CONN-03 supplemental | Tauri invoke layer | Attempt INSERT on readonly connection; verify Rust-layer rejection before dialog |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
