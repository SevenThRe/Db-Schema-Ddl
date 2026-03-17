---
phase: 1
slug: extension-host-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | HOST-01 | typecheck | `npm run check` | existing | pending |
| 01-01-02 | 01 | 1 | HOST-03 | typecheck | `npm run check` | existing | pending |
| 01-01-03 | 01 | 1 | HOST-03 | integration | `npm test` | W0 | pending |
| 01-02-01 | 02 | 2 | HOST-03 | typecheck | `npm run check` | existing | pending |
| 01-02-02 | 02 | 2 | HOST-04 | typecheck | `npm run check` | existing | pending |
| 01-02-03 | 02 | 2 | HOST-03 | integration | `npm test` | W0 | pending |
| 01-03-01 | 03 | 2 | HOST-01 | integration | `npm test` | W0 | pending |
| 01-03-02 | 03 | 2 | HOST-03 | integration | `npm test` | W0 | pending |
| 01-03-03 | 03 | 2 | HOST-04 | typecheck | `npm run check` | existing | pending |
| 01-04-01 | 04 | 3 | HOST-01 | manual+typecheck | `npm run check` | existing | pending |
| 01-04-02 | 04 | 3 | HOST-02 | manual+typecheck | `npm run check` | existing | pending |
| 01-04-03 | 04 | 3 | HOST-04 | regression | `npm test` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `test/server/extensions-routes.test.ts` - extension host API contract coverage for HOST-01 and HOST-03
- [ ] `test/electron/extension-host.test.ts` or equivalent server-side lifecycle coverage - host lifecycle state validation for HOST-03
- [ ] `test/client/sidebar-extension-state.test.tsx` or equivalent UI coverage - absent/disabled/incompatible sidebar states for HOST-01 and HOST-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar DB management entry communicates absent/disabled/incompatible states clearly | HOST-01, HOST-02 | Visual treatment and UX copy still need human judgment | Launch the app, inspect sidebar in each mocked extension state, verify badge/status meaning is immediately understandable |
| Install dialog feels concise rather than like a full settings panel | HOST-02 | Copy density and perceived complexity are UX-level checks | Trigger absent-state click, confirm modal is short, official-branded, and action-oriented |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
