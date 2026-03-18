---
phase: 02-live-db-to-xlsx-export-v1_2
slug: live-db-to-xlsx-export-v1_2
status: planned
nyquist_compliant: true
wave_0_complete: false
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

## Exit Conditions

- [ ] `npm run check`
- [ ] Focused server live-export tests green
- [ ] Focused client live-export workflow tests green
- [ ] `npm test`
- [ ] Unsafe or inexpressible constructs block workbook registration

