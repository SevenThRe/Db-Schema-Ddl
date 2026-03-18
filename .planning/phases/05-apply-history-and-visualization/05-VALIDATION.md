---
phase: 5
slug: apply-history-and-visualization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 5 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DIFF-02 | unit scaffold | `node --test --import tsx test/server/db-history-phase5.test.ts` | W0 | pending |
| 05-01-02 | 01 | 1 | DEPL-04 | contract/storage | `npm run check` | existing | pending |
| 05-01-03 | 01 | 1 | VIZ-02 | dependency/hook seam | `npm run check` | existing | pending |
| 05-02-01 | 02 | 2 | DIFF-02 | integration | `node --test --import tsx test/server/db-history-phase5.test.ts` | W0 | pending |
| 05-02-02 | 02 | 2 | DEPL-03 | integration | `node --test --import tsx test/server/db-apply-phase5.test.ts` | W0 | pending |
| 05-02-03 | 02 | 2 | DEPL-04, VIZ-02 | route/DTO | `npm run check` | existing | pending |
| 05-03-01 | 03 | 3 | DIFF-02 | client workflow | `node --test --import tsx test/client/db-management-phase5-ui.test.tsx` | W0 | pending |
| 05-03-02 | 03 | 3 | DEPL-03 | client workflow | `node --test --import tsx test/client/db-management-phase5-ui.test.tsx` | W0 | pending |
| 05-03-03 | 03 | 3 | DEPL-04 | integration wiring | `npm run check` | existing | pending |
| 05-04-01 | 04 | 4 | VIZ-02 | client graph | `node --test --import tsx test/client/db-management-phase5-ui.test.tsx` | W0 | pending |
| 05-04-02 | 04 | 4 | VIZ-02 | client integration | `npm run check` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `test/server/db-apply-phase5.test.ts` - safe apply job execution, plan-hash gating, and per-statement result coverage for DEPL-03 and DEPL-04
- [ ] `test/server/db-history-phase5.test.ts` - changed-only snapshot history and snapshot/live plus snapshot/snapshot compare coverage for DIFF-02 and DEPL-04
- [ ] `test/server/db-phase5-fixtures.ts` - canonical schema, snapshot, and job fixtures shared across apply/history tests
- [ ] `test/client/db-management-phase5-ui.test.tsx` - history panel, blocked-selection apply UI, graph mode toggles, and last-view persistence coverage for VIZ-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Safe apply feels conservative and understandable | DEPL-03 | Trust and risk perception are product judgments | Run a diff with both safe and blocked changes, verify blocked tables are disabled with clear reasons, then execute only safe tables and confirm the summary/drilldown flow feels trustworthy |
| History view answers "what changed since last meaningful scan?" | DIFF-02, DEPL-04 | Scanability and audit usefulness need human judgment | Perform at least two changed scans and one unchanged scan, then verify the history panel highlights changed versions while unchanged scans only update recent-scan state |
| Graph mode remains useful on a full database view | VIZ-02 | Readability and interaction quality require human review | Open graph mode on a medium schema, verify changed tables are highlighted, filtering works, and the remembered last-view behavior returns you to the previous mode correctly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
