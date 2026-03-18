# Requirements: Bidirectional Schema Workflow Platform

**Defined:** 2026-03-18
**Core Value:** Users can compare real database environments directly and move between supported DDL and parser-compatible Excel schema workbooks without rebuilding structure by hand.

## v1.1 Requirements

### DB-vs-DB Compare

- [x] **DBDB-01**: User can choose a source DB and a target DB from saved connections and compare their schemas directly
- [x] **DBDB-02**: User can inspect `DB vs DB` differences in the `DB 管理` workspace with clear source/target labels, filters, and object drilldown
- [x] **DBDB-03**: User can review ambiguous rename or equivalence candidates before directional preview proceeds
- [x] **DBDB-04**: User can generate a non-applying directional preview that shows how the target DB would need to change to match the selected source DB

### XLSX Templates and Round-Trip Validation

- [x] **TPL-01**: User can create a new schema-definition workbook from a built-in `.xlsx` template aligned to the supported Japanese header layout
- [x] **TPL-02**: User can choose a template variant for `multi-table per sheet` versus `table per sheet` authoring
- [x] **TPL-03**: App can round-trip validate generated or templated `.xlsx` outputs by reopening them through the parser and surfacing mismatches before the user trusts them

### DDL-to-XLSX Conversion

- [x] **DDLX-01**: User can paste or import supported MySQL `CREATE TABLE` DDL and parse it into the app's canonical schema model
- [x] **DDLX-02**: App surfaces unsupported or lossy DDL constructs before workbook export so the user knows what requires manual cleanup
- [x] **DDLX-03**: User can export parsed DDL into an `.xlsx` workbook that the existing Excel parser can open without format surgery
- [x] **DDLX-04**: Oracle DDL import remains explicitly deferred until the MySQL-first reverse-authoring workflow is stable

## Deferred / Future

### Reverse Authoring Expansion

- **DDLX-05**: Oracle DDL import supports a documented first-class subset once MySQL-first reverse authoring is stable
- **DDLX-06**: Users can import generated SQL bundles rather than single pasted statements

### DB Operations

- **DBDB-05**: User can compare stored snapshots from two different DB environments without requiring both to be live at compare time
- **DBDB-06**: User can export DB-vs-DB compare reports for review and handoff

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic `DB -> DB` sync/apply | Too risky for the compare-first milestone |
| Arbitrary SQL parser | Breaks the “supported subset” contract and balloons scope |
| Custom user-defined Excel formats | Conflicts with parser compatibility and trust goals |
| First-cut Oracle reverse import | Better deferred than rushed into unstable support |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DBDB-01 | Phase 1 | Complete |
| DBDB-02 | Phase 1 | Complete |
| DBDB-03 | Phase 1 | Complete |
| DBDB-04 | Phase 1 | Complete |
| TPL-01 | Phase 2 | Complete |
| TPL-02 | Phase 2 | Complete |
| TPL-03 | Phase 2 | Complete |
| DDLX-01 | Phase 3 | Complete |
| DDLX-02 | Phase 3 | Complete |
| DDLX-03 | Phase 3 | Complete |
| DDLX-04 | Phase 3 | Complete |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after completing v1.1 Phase 3*
