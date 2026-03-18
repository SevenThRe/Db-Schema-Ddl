---
phase: 03-reverse-import-expansion-v1_2
slug: reverse-import-expansion-v1_2
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-03-18
---

# Phase 3 - Validation Strategy

> Per-phase validation contract for SQL bundle import, Oracle subset reverse import, and convergence into the existing canonical review/export workflow.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/reverse-import-phase3.test.ts`, `node --test --import tsx test/client/reverse-import-phase3-ui.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After contract/parser waves:** Run focused server reverse-import tests
- **After UI wave:** Run focused client reverse-import UI tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 3 needs validation in five layers:

1. **Contract validation**
   - all new source modes stay typed and machine-usable
   - source mode, dialect, stable ids, and issue payloads remain explicit
2. **Bundle handling validation**
   - multi-statement SQL bundles are accepted only within the documented structure-oriented subset
   - unsupported statement families surface explicitly instead of being silently discarded
3. **Oracle subset validation**
   - the documented Oracle first-cut subset parses into the shared canonical review model
   - unsupported or partial Oracle features surface as blocking or lossy issues
4. **Workflow convergence validation**
   - MySQL, SQL bundle, and Oracle subset all converge on the same review/export flow
   - official template export plus parser-backed round-trip remains the hard trust gate
5. **UI workflow validation**
   - the existing DDL import workspace expands source modes without fragmenting into separate review screens
   - issue gating, template memory, and export handoff remain coherent

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | reverse-import source modes, dialect metadata, and issue payloads remain stable |
| Parser adapters | MySQL bundle and Oracle subset adapters normalize into one review artifact |
| Issue handling | unsupported and lossy constructs stay explicit across all input modes |
| UI shell | one DDL import workspace handles all supported source modes without breaking existing flow |

---

## Exit Conditions

- [x] `npm run check`
- [x] Focused server reverse-import tests green
- [x] Focused client reverse-import UI tests green
- [x] `npm test`
- [x] Oracle support remains scoped to the documented first-cut subset
- [x] Unsupported bundle statements never disappear silently
- [x] Exported workbooks still pass parser-backed round-trip validation before registration

---

## Validation Audit 2026-03-18

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
