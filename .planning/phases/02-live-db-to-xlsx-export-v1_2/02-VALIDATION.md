---
phase: 02-live-db-to-xlsx-export-v1_2
slug: live-db-to-xlsx-export-v1_2
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-18
updated: 2026-03-18
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for exporting live DB catalogs into trusted workbook templates.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | `node --test --import tsx test/server/db-live-export-phase2.test.ts`, `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150 seconds |

---

## Sampling Rate

- **After every task batch:** Run `npm run check`
- **After contract/backend waves:** Run `node --test --import tsx test/server/db-live-export-phase2.test.ts`
- **After UI wave:** Run `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx`
- **Before phase close:** Run `npm test`

---

## Validation Architecture

Phase 2 needs validation in five layers:

1. **Contract validation**
   - export preview and export execution use one stable machine-friendly artifact
   - the artifact records source connection/database, freshness mode, snapshot hash, selected tables, chosen template, issues, and output file metadata
2. **Source-resolution validation**
   - `使用最近 snapshot` and `导出前刷新 live` remain explicit and observable
   - whole-database-first catalog loading does not collapse into an entry-time table picker
3. **Trust-model validation**
   - live DB export reuses blocker / confirm / info issue semantics from existing workbook export flows
   - constructs that cannot be represented safely block before workbook registration
4. **Workbook validation**
   - generated `.xlsx` files only target the two official template families
   - parser-backed round-trip remains the final trust gate before files enter the file list
5. **UI workflow validation**
   - `live DB -> XLSX` appears as its own `DB 管理` main view
   - users can review whole-database scope, narrow to selected tables, inspect issues, and export without leaving the workspace

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | Preview/export artifacts stay typed, stable, and MCP-friendly |
| Backend source handling | Live freshness resolution and issue classification reuse existing trust rules |
| Workbook export | Official template generation plus round-trip validation block unsafe outputs |
| UI shell | Dedicated export workspace exposes freshness, selection, issue review, and export CTA coherently |

---

## Per-Task Coverage Map

| Plan | Task | Requirements | Status | Automated evidence |
|------|------|--------------|--------|--------------------|
| `02-01` | Add live-export preview and export artifacts to shared schema | `DBXLSX-01`, `DBXLSX-02`, `DBXLSX-03` | `COVERED` | `node --test --import tsx test/server/db-live-export-phase2.test.ts`, `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx` |
| `02-01` | Expose typed route and hook seams for preview/export | `DBXLSX-01`, `DBXLSX-02` | `COVERED` | `npm run check`, `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx` |
| `02-02` | Build live-export preview service with explicit freshness and whole-catalog loading | `DBXLSX-01`, `DBXLSX-03` | `COVERED` | `node --test --import tsx test/server/db-live-export-phase2.test.ts`, `npm run check` |
| `02-02` | Reuse workbook trust rules for live DB export issue classification | `DBXLSX-02` | `COVERED` | `node --test --import tsx test/server/db-live-export-phase2.test.ts`, `npm run check` |
| `02-03` | Convert reviewed live catalogs into official workbook templates | `DBXLSX-01`, `DBXLSX-02`, `DBXLSX-03` | `COVERED` | `node --test --import tsx test/server/db-live-export-phase2.test.ts` |
| `02-03` | Register successful workbooks through the normal file lifecycle and route layer | `DBXLSX-01`, `DBXLSX-02` | `COVERED` | `node --test --import tsx test/server/db-live-export-phase2.test.ts`, `npm run check` |
| `02-04` | Build the dedicated live-export workspace UI | `DBXLSX-01`, `DBXLSX-03` | `COVERED` | `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx` |
| `02-04` | Integrate the workspace into DB 管理 and activate exported files | `DBXLSX-01`, `DBXLSX-02` | `COVERED` | `node --test --import tsx test/client/db-live-export-phase2-ui.test.tsx`, `npm run check`, `npm test` |

---

## Requirement Coverage Summary

| Requirement | Coverage | Evidence |
|-------------|----------|----------|
| `DBXLSX-01` | `COVERED` | Preview/export contract tests, backend execution tests, UI activation wiring tests |
| `DBXLSX-02` | `COVERED` | Trust-model classification tests, official-template export tests, parser-backed round-trip execution tests |
| `DBXLSX-03` | `COVERED` | Whole-catalog preview tests, selected-table export tests, dedicated workspace selection UI checks |

---

## Manual-Only Coverage

None. Phase 2 currently has automated coverage for all locked requirements and plan tasks.

---

## Exit Conditions

- [x] `npm run check`
- [x] Focused server live-export tests green
- [x] Focused client live-export workflow tests green
- [x] `npm test`
- [x] Unsafe or inexpressible constructs block workbook registration

---

## Validation Audit 2026-03-18

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Result:
- Existing focused tests already covered contract, backend preview/export, trust gating, and UI workflow.
- No additional Nyquist test generation was required.
- The primary gap was documentation drift: this file still reflected planning-time status and is now updated to the executed, compliant state.
