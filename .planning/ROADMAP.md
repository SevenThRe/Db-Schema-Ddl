# Roadmap: Bidirectional Schema Workflow Platform

**Created:** 2026-03-18
**Granularity:** Coarse
**Coverage:** 11 / 11 v1.1 requirements mapped

## Summary

This roadmap treats `v1.1` as the follow-on milestone to the shipped DB management extension. Instead of broadening apply risk, it focuses on two adjacent value paths: direct `DB vs DB` comparison and trusted reverse authoring back into Excel-based schema documents.

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria | Status |
|---|-------|------|--------------|------------------|--------|
| 1 | Cross-Database Compare | Compare two saved DB targets directly and inspect directional preview inside `DB 管理` | DBDB-01, DBDB-02, DBDB-03, DBDB-04 | 4 | Complete (2026-03-18) |
| 2 | Template and Round-Trip Authoring | Provide built-in `.xlsx` templates and validate that outputs reopen cleanly | TPL-01, TPL-02, TPL-03 | 3 | Complete (2026-03-18) |
| 3 | DDL Import and XLSX Export | Turn supported MySQL DDL into canonical schema and parser-compatible `.xlsx` output | DDLX-01, DDLX-02, DDLX-03, DDLX-04 | 4 | Complete (2026-03-18) |

## Phase Details

### Phase 1: Cross-Database Compare

Goal: Users can compare one live DB environment against another inside `DB 管理` and review a directional preview without applying changes.

Requirements:
- DBDB-01
- DBDB-02
- DBDB-03
- DBDB-04

Success criteria:
1. User can choose two saved connection/schema targets and run a direct compare without exporting an intermediate `.xlsx` or snapshot file manually.
2. User can inspect added, removed, modified, and rename-candidate differences in the existing DB diff workspace with unambiguous source and target context.
3. Ambiguous rename or equivalence cases block directional preview until the user resolves them.
4. User can generate a non-applying preview that explains what would need to change in the target DB to converge toward the source DB.

### Phase 2: Template and Round-Trip Authoring

Goal: Users can start from supported `.xlsx` templates and trust generated workbooks because the app validates that they reopen correctly.

Requirements:
- TPL-01
- TPL-02
- TPL-03

Success criteria:
1. User can create a new workbook from first-party templates that already match the product's supported Japanese header and sheet-layout conventions.
2. User can choose an authoring layout variant that matches either `multi-table per sheet` or `table per sheet` maintenance style.
3. Generated or templated workbooks can be re-imported automatically and either pass round-trip validation or show actionable mismatch warnings before use.

### Phase 3: DDL Import and XLSX Export

Goal: Users can turn supported SQL table definitions into the product's Excel-based document format with explicit fidelity reporting.

Requirements:
- DDLX-01
- DDLX-02
- DDLX-03
- DDLX-04

Success criteria:
1. User can paste or load supported MySQL table DDL and see the parsed tables in a reviewable canonical form before export.
2. Unsupported or lossy syntax is surfaced explicitly instead of being silently discarded during conversion.
3. User can export the reviewed result into an `.xlsx` workbook that opens through the normal parser flow and preserves the expected tables and columns.
4. Oracle DDL import is kept explicitly out of the first reverse-authoring cut unless later added as a separate requirement expansion.

## Phase Dependencies

- Phase 2 stands independently of Phase 3 and can ship earlier
- Phase 3 benefits from Phase 2 because trusted templates and round-trip validation reduce export risk

## Notes

- Keep `DB vs DB` strictly compare-and-preview in `v1.1`
- Keep reverse authoring inside a supported subset contract
- Preserve the `v1.0` audit trail as historical evidence rather than trying to fold it into the new milestone docs
- Phase 1 shipped with a dedicated `db-vs-db` workspace, directional preview, graph linkage, and settings-backed rename policy thresholds
- Phase 2 shipped with first-party parser-backed workbook templates and create-from-template registration flow
- Phase 3 shipped with a dedicated DDL import workspace, parser-backed issue review, and official-template export with round-trip validation

---
*Last updated: 2026-03-18 after completing v1.1 Phase 3*
