---
phase: 2
slug: github-delivery-and-lifecycle
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-17
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | DIST-01 | typecheck | `npm run check` | existing | green |
| 02-01-02 | 01 | 1 | DIST-03 | integration | `npm test` | W0 | green |
| 02-01-03 | 01 | 1 | DIST-04 | typecheck | `npm run check` | existing | green |
| 02-02-01 | 02 | 2 | DIST-02 | integration | `npm test` | W0 | green |
| 02-02-02 | 02 | 2 | DIST-03 | integration | `npm test` | W0 | green |
| 02-02-03 | 02 | 2 | DIST-04 | regression | `npm test` | W0 | green |
| 02-03-01 | 03 | 3 | DIST-01 | integration | `npm test` | W0 | green |
| 02-03-02 | 03 | 3 | DIST-04 | typecheck | `npm run check` | existing | green |
| 02-03-03 | 03 | 3 | DIST-04 | integration | `npm test` | W0 | green |
| 02-04-01 | 04 | 4 | DIST-01 | manual+typecheck | `npm run check` | existing | green |
| 02-04-02 | 04 | 4 | DIST-02 | manual+integration | `npm test` | W0 | green |
| 02-04-03 | 04 | 4 | DIST-04 | manual+regression | `npm test` | W0 | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `test/server/extensions-catalog.test.ts` - official catalog and metadata contract coverage for DIST-01
- [x] `test/electron/extensions-delivery.test.ts` - download, verify, unpack, enable, update, and uninstall lifecycle coverage for DIST-02, DIST-03, and DIST-04
- [x] `test/client/extension-management-ui.test.tsx` - install panel and settings management UI coverage for DIST-01, DIST-02, and DIST-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install detail panel feels compact while still surfacing version, size, compatibility, and summary | DIST-01 | Information density and readability are UX judgments | Open the absent-state DB 管理 entry, inspect the panel, and confirm the metadata is scannable without feeling like a marketplace page |
| In-panel progress view communicates download, verification, and install stages clearly | DIST-02, DIST-03 | Perceived clarity of stage transitions is visual and interaction-heavy | Trigger a download in Electron mode and verify each lifecycle stage appears in the same panel with understandable status changes |
| Settings-based extension management is discoverable without duplicating the sidebar module entry | DIST-04 | IA and terminology need human validation | Open Settings, locate `扩展管理`, and confirm enable/disable/update/uninstall controls feel like administration rather than module navigation |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** passed
