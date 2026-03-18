---
phase: 4
slug: file-vs-db-diff-and-deploy-preview
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 4 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 150 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DIFF-01 | typecheck | `npm run check` | existing | pending |
| 04-01-02 | 01 | 1 | DIFF-03 | unit | `npm test` | W0 | pending |
| 04-02-01 | 02 | 2 | DIFF-01 | integration | `npm test` | W0 | pending |
| 04-02-02 | 02 | 2 | DIFF-03 | regression | `npm test` | W0 | pending |
| 04-03-01 | 03 | 3 | DEPL-01 | unit | `npm test` | W0 | pending |
| 04-03-02 | 03 | 3 | DEPL-02 | integration | `npm test` | W0 | pending |
| 04-04-01 | 04 | 4 | DIFF-01 | manual+integration | `npm test` | W0 | pending |
| 04-04-02 | 04 | 4 | DEPL-01 | manual+integration | `npm test` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `test/server/file-vs-db-diff.test.ts` - canonical file-vs-live-DB compare coverage for DIFF-01
- [ ] `test/server/db-rename-suggestions.test.ts` - high-confidence rename suggestion and blocking-state coverage for DIFF-03
- [ ] `test/server/db-dry-run-preview.test.ts` - SQL preview and blocker summary coverage for DEPL-01 and DEPL-02
- [ ] `test/client/db-diff-workspace-ui.test.tsx` - DB-oriented diff workspace, bulk rename review, and SQL pane wiring coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diff workspace is easier to scan than the legacy SchemaDiffPanel | DIFF-01 | Information hierarchy and usability need human judgment | Open `DB 管理`, run a sheet-vs-live comparison, and verify the three-column flow makes it obvious where to browse objects, inspect details, and read SQL |
| SQL highlight mapping feels trustworthy | DEPL-01 | Human perception is needed to judge whether selected diffs are clearly reflected in highlighted SQL fragments | Select several table and column diffs and verify the SQL pane highlights the matching statements or fragments clearly |
| Blocked preview states feel safe rather than confusing | DIFF-03, DEPL-02 | Copy quality and risk comprehension are product judgments | Trigger at least one blocked rename, one dangerous type shrink, and one `NULL -> NOT NULL` blocker, then verify the UI explains why preview is blocked and what action is needed |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
