# Requirements: Schema Provenance and Reverse Expansion

**Defined:** 2026-03-18
**Core Value:** Users can compare historical DB states, reverse live DB structure into trusted Excel workbooks, and broaden reverse import beyond the current MySQL-first single-DDL flow.

## v1.2 Requirements

### Snapshot and History Compare

- [x] **HIST-01**: User can compare any two stored DB schema snapshots, including snapshots from different connections or databases
- [x] **HIST-02**: User can compare current live DB state against any stored snapshot from the same DB history without rescanning everything manually
- [x] **HIST-03**: User can export snapshot/history compare results for review and handoff with enough context to identify compared endpoints and versions

### Live DB to XLSX Export

- [ ] **DBXLSX-01**: User can export selected live DB tables into an official parser-compatible `.xlsx` workbook without first converting through pasted DDL
- [ ] **DBXLSX-02**: Live DB exports reuse the same template family, lossy reporting, and parser-backed round-trip validation as other workbook creation flows
- [ ] **DBXLSX-03**: User can choose whole-database or filtered-table export scopes before generating the workbook

### Reverse Import Expansion

- [ ] **REV-01**: User can import multi-statement SQL files/bundles rather than only pasted single-statement text
- [ ] **REV-02**: User can import a documented supported subset of Oracle DDL and review unsupported/lossy constructs explicitly before export
- [ ] **REV-03**: Reverse-imported Oracle or SQL-bundle content still converges on the same canonical review and workbook-export flow
- [ ] **REV-04**: Unsupported or lossy constructs remain explicit and reviewable across all new reverse-import entry modes

## Deferred / Future

- **REV-05**: Oracle reverse import reaches broader parity with MySQL-first coverage once first-cut subset is stable
- **DBXLSX-04**: User can reverse-export live DB objects beyond tables when canonical support expands
- **HIST-04**: Users can diff exported compare reports or publish them through richer sharing channels

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic `DB -> DB` sync/apply | Still too risky for the provenance-oriented milestone |
| Arbitrary SQL parser | Breaks the documented subset contract and balloons scope |
| Custom user-defined Excel formats | Still conflicts with parser compatibility and trust goals |
| Full Oracle parity on day one | Better deferred than rushed into unstable support |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HIST-01 | Phase 1 | Complete |
| HIST-02 | Phase 1 | Complete |
| HIST-03 | Phase 1 | Complete |
| DBXLSX-01 | Phase 2 | Pending |
| DBXLSX-02 | Phase 2 | Pending |
| DBXLSX-03 | Phase 2 | Pending |
| REV-01 | Phase 3 | Pending |
| REV-02 | Phase 3 | Pending |
| REV-03 | Phase 3 | Pending |
| REV-04 | Phase 3 | Pending |

**Coverage:**
- v1.2 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after completing v1.2 Phase 1*
