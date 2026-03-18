---
phase: 3
slug: db-connectivity-and-introspection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 3 - Validation Strategy

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
| 03-01-01 | 01 | 1 | DBCO-01 | typecheck | `npm run check` | existing | pending |
| 03-01-02 | 01 | 1 | DBCO-02 | unit | `npm test` | W0 | pending |
| 03-01-03 | 01 | 1 | DBCO-03 | unit | `npm test` | W0 | pending |
| 03-02-01 | 02 | 2 | DBCO-01 | integration | `npm test` | W0 | pending |
| 03-02-02 | 02 | 2 | DBCO-02 | integration | `npm test` | W0 | pending |
| 03-03-01 | 03 | 3 | DBCO-03 | integration | `npm test` | W0 | pending |
| 03-03-02 | 03 | 3 | DBCO-03 | regression | `npm test` | W0 | pending |
| 03-04-01 | 04 | 4 | DBCO-01 | manual+integration | `npm test` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `test/electron/db-credential-vault.test.ts` - safeStorage-backed encryption/decryption coverage for DBCO-02
- [ ] `test/server/db-connections-storage.test.ts` - saved connection persistence and selected-database metadata coverage for DBCO-01
- [ ] `test/server/mysql-introspection-normalizer.test.ts` - canonical normalization of tables, columns, PKs, FKs, indexes, and comments for DBCO-03
- [ ] `test/client/db-management-connections.test.tsx` - module UI coverage for saved connections, connection test, and database switching for DBCO-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Remembered-password UX feels trustworthy and unobtrusive | DBCO-01, DBCO-02 | Security wording and user confidence are product-UX judgments | Install the extension, save a MySQL connection with remembered password, restart the app, and verify the reconnect experience is clear without exposing secrets |
| Database switching is discoverable inside `DB 管理` | DBCO-01 | Information architecture and module flow need human judgment | Connect to a server with multiple databases, switch the selected database from the module, and confirm the current target is obvious |
| Introspection failure messages distinguish auth problems from connectivity problems | DBCO-01, DBCO-03 | Error comprehension is partly copy and interaction quality | Test one bad-password case and one unreachable-host case, and verify the extension explains the likely next action clearly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
