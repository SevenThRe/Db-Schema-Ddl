---
phase: 01-electron-stability-and-real-env-smoke-v1_3
slug: electron-stability-and-real-env-smoke-v1_3
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-03-18
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for hardening the Electron desktop runtime and proving one real-environment smoke path.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/electron/extensions-delivery.test.ts` plus new phase-specific Electron/runtime tests |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150-210 seconds |

---

## Sampling Rate

- **After contract/helper tasks:** Run `npm run check`
- **After Electron/runtime waves:** Run focused phase tests for error helpers, log artifacts, and preflight guards
- **After smoke-artifact wave:** Run the new smoke serialization/checklist tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 1 needs validation in five layers:

1. **Operational contract validation**
   - log artifacts, smoke artifacts, and user-facing error categories stay structured and machine-usable
2. **Runtime hardening validation**
   - startup/shutdown helper behavior is deterministic
   - duplicate dialogs are suppressed during shutdown paths
3. **Guard validation**
   - native-module, migration-compatibility, and extension-catalog fallback checks fail clearly
4. **Diagnostics validation**
   - fatal-path events write persistent local log entries
   - translated user-facing messages do not expose raw transport text
5. **Smoke-path validation**
   - one repeatable startup/shutdown/SQLite/extension/MySQL smoke path is documented and produces evidence

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | log/smoke artifacts and friendly error categories remain typed and stable |
| Electron runtime | error reporter, shutdown suppression, and checkpoint logging behave predictably |
| Guards | native-module, migration, and catalog fallback guards produce clear outcomes |
| Smoke seam | checklist/artifact generation is deterministic and reviewable |

---

## Exit Conditions

- [x] `npm run check`
- [x] Focused Electron/runtime phase tests green
- [x] `npm run build`
- [x] `npm test`
- [x] One recorded smoke evidence path exists or is explicitly documented as the phase-close manual proof

---

## Manual-Only Coverage

- One real-environment MySQL smoke execution remains operator-run, but its evidence now has a structured JSON/Markdown seam and template artifact.

---

## Validation Audit

- Wave 0 contract coverage is complete:
  - `test/server/db-phase1-smoke-artifacts.test.ts`
  - `test/electron/electron-runtime-phase1.test.ts`
  - `test/electron/electron-preflight-phase1.test.ts`
  - `test/electron/desktop-smoke-phase1.test.ts`
- Focused extension-delivery regression coverage stayed green via `test/electron/extensions-delivery.test.ts`
- Final phase-close verification passed:
  - `npm run check`
  - `npm run build`
  - `npm test`
  - `npm run smoke:desktop`
- Gaps found: 0
