---
phase: 03-ddl-import-and-xlsx-export-v1_1
slug: ddl-import-and-xlsx-export-v1_1
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-18
updated: 2026-03-18
---

# Phase 3 - Validation Strategy

> Per-phase validation contract for MySQL DDL import, fidelity reporting, and parser-compatible workbook export.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/ddl-import-phase3.test.ts`, `node --test --import tsx test/server/ddl-export-phase3.test.ts`, `node --test --import tsx test/client/ddl-import-phase3-ui.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After parser/backend wave:** Run focused server tests
- **After export pipeline wave:** Run export-focused server tests
- **After UI wave:** Run focused client tests
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 3 needs validation in four layers:

1. **Contract validation**
   - DDL import requests, preview responses, issue taxonomy, export settings, and remembered template choice are typed explicitly
   - Oracle import remains explicitly deferred in contracts and UX
2. **Parser and normalization validation**
   - supported MySQL `CREATE TABLE` input becomes a stable canonical review model
   - unsupported or lossy constructs are surfaced explicitly instead of being silently dropped
3. **Workbook export validation**
   - exported `.xlsx` files are produced only through the official template family
   - exported workbooks reopen through the existing Excel parser before registration
4. **UI workflow validation**
   - the DDL import workspace is three-column and review-first
   - pasted SQL remains the primary entry path while upload remains available
   - blocking vs confirmable lossy cases are visible and actionable before export

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | Typed DDL import preview/export payloads and issue taxonomy exist |
| Parser pipeline | Supported MySQL DDL normalizes into canonical tables and issues |
| Export flow | Workbook export uses official templates and blocks on parser-backed round-trip failure |
| UI shell | Three-column review flow, source-mode controls, subset export, and warning states stay coherent |

---

## Exit Conditions

- [ ] `npm run check`
- [ ] Focused server DDL import tests green
- [ ] Focused server DDL export tests green
- [ ] Focused client DDL import UI tests green
- [ ] `npm test`
- [ ] Oracle import remains explicitly deferred
- [ ] Exported workbooks cannot bypass parser-backed round-trip validation

