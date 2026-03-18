# Roadmap: Schema Provenance and Reverse Expansion

**Created:** 2026-03-18
**Granularity:** Coarse
**Coverage:** 10 / 10 v1.2 requirements mapped

## Summary

This roadmap treats `v1.2` as the follow-on milestone to the delivered bidirectional workflow. Instead of broadening apply risk, it focuses on schema provenance and broader reverse authoring: comparing historical DB states, exporting live DB structure back to trusted workbook formats, and widening reverse import beyond the current MySQL-first pasted-DDL path.

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria | Status |
|---|-------|------|--------------|------------------|--------|
| 1 | Snapshot Compare and Reports | Compare arbitrary stored DB snapshots and export reviewable history reports | HIST-01, HIST-02, HIST-03 | 3 | Complete |
| 2 | Live DB to XLSX Export | Turn live DB schema directly into parser-compatible `.xlsx` workbooks with the same trust model as other exports | DBXLSX-01, DBXLSX-02, DBXLSX-03 | 3 | Complete |
| 3 | Reverse Import Expansion | Expand reverse import to SQL bundles and first-cut Oracle DDL while keeping canonical review and trust gates | REV-01, REV-02, REV-03, REV-04 | 4 | Complete |

## Phase Details

### Phase 1: Snapshot Compare and Reports

Goal: Users can compare historical DB states directly, including arbitrary snapshot pairs and live-vs-snapshot, and can export those findings for review.

Requirements:
- HIST-01
- HIST-02
- HIST-03

Success criteria:
1. User can compare any two stored DB snapshots, including snapshots from different connection/database histories.
2. User can compare current live DB state against any stored snapshot from the same DB history without rebuilding or rescanning unrelated sources by hand.
3. User can export history/snapshot compare results with clear source/target version context for review and handoff.

### Phase 2: Live DB to XLSX Export

Goal: Users can export live DB schema directly into parser-compatible workbook templates without detouring through pasted DDL.

Requirements:
- DBXLSX-01
- DBXLSX-02
- DBXLSX-03

Success criteria:
1. User can export selected live DB tables or a whole database into one of the official workbook template families.
2. Live DB export preserves the current trust model by surfacing lossy constructs and by round-tripping the generated workbook through the parser before it is trusted.
3. User can control export scope with explicit whole-database or filtered-table selection.

### Phase 3: Reverse Import Expansion

Goal: Users can reverse-import broader SQL sources, including SQL bundles and a documented Oracle subset, through the same canonical review and workbook-export flow.

Requirements:
- REV-01
- REV-02
- REV-03
- REV-04

Success criteria:
1. User can import multi-statement SQL files or bundles and review them through the same canonical model used by the current DDL import workspace.
2. User can import a documented supported subset of Oracle DDL with explicit unsupported/lossy reporting.
3. Oracle and SQL-bundle imports converge on the same review/export flow as the existing MySQL-first DDL import path.
4. New reverse-import inputs continue to surface unsupported or lossy behavior explicitly instead of silently discarding it.

## Phase Dependencies

- Phase 1 stands on the shipped snapshot/history infrastructure from `v1.0`
- Phase 2 benefits from Phase 1 because historical snapshot compare and canonical DB schemas make `live DB -> XLSX` easier to trust and debug
- Phase 3 benefits from Phase 2 because broader reverse-import inputs should converge on the same export and round-trip gates

## Notes

- Keep cross-environment DB apply out of scope
- Keep every reverse-authoring path behind explicit lossy reporting and parser-backed round-trip validation
- Preserve the `v1.0` and `v1.1` audit trail as historical evidence rather than folding them into the new milestone docs
- `v1.2` deliberately starts from deferred requirements and tech-debt-adjacent product gaps exposed by the `v1.1` audit

---
*Last updated: 2026-03-18 after completing v1.2 Phase 3*
