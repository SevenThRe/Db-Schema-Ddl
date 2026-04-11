# Requirements: Operator Productivity Surfaces v1.7

**Created:** 2026-04-11
**Milestone:** v1.7 Operator Productivity Surfaces
**Status:** Active

## Milestone Goal

Make DB Workbench faster to live in every day by adding persistent operator memory, deeper object inspection, richer data-browse controls, and quick-launch shortcuts while preserving the trusted `v1.5`/`v1.6` runtime baseline.

---

## Requirements

### Category: Runtime Correctness (COR)

- [ ] **COR-01**: User can execute supported result-returning statements such as `SHOW` and `EXPLAIN` even when load-more paging is unavailable for that result shape.
- [ ] **COR-02**: User sees a clear operator message when paging is unsupported, without silent empty-result behavior or ambiguity about whether the statement actually ran.

### Category: Workspace Memory (MEM)

- [ ] **MEM-01**: User can reopen recent queries for a connection after app restart, not just within the current session.
- [ ] **MEM-02**: User can save SQL snippets/scripts with explicit names and organize them in a reusable library for the active connection.
- [ ] **MEM-03**: User can rename, duplicate, delete, and insert saved scripts/snippets back into the current editor tab.
- [ ] **MEM-04**: User can pin favorite queries or tables and launch them quickly from the workbench.

### Category: Object Inspection (INSP)

- [ ] **INSP-01**: User can browse views alongside tables in the object explorer for the active schema.
- [ ] **INSP-02**: User can browse supported routines/triggers for the active connection where the driver can introspect them.
- [ ] **INSP-03**: User can open a definition/DDL preview for tables, views, and supported routines/triggers from the explorer.
- [ ] **INSP-04**: User can search and filter the explorer by schema and object type.

### Category: Data Browse Productivity (BROW)

- [ ] **BROW-01**: User can open table data with reusable starter actions such as top-N rows, row count, and explicit-column select.
- [ ] **BROW-02**: User can save and reapply browse presets for a table, including limit, sort, and filter settings that map to executable SQL.
- [ ] **BROW-03**: User can copy or export selected cells, rows, or columns with headers and type-aware formatting.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Broad DB engine expansion beyond MySQL/PostgreSQL | Operator productivity depth on the current trusted baseline has higher leverage |
| Visual ER authoring / drag-to-design modeling | Daily operational workflows and inspection productivity are the focus |
| Team collaboration / shared libraries / cloud sync | Keep this milestone local-first and operator-centric |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COR-01 | Phase 19 | Pending |
| COR-02 | Phase 19 | Pending |
| MEM-01 | Phase 19 | Pending |
| MEM-02 | Phase 20 | Pending |
| MEM-03 | Phase 20 | Pending |
| MEM-04 | Phase 20 | Pending |
| INSP-01 | Phase 21 | Pending |
| INSP-02 | Phase 21 | Pending |
| INSP-03 | Phase 21 | Pending |
| INSP-04 | Phase 21 | Pending |
| BROW-01 | Phase 22 | Pending |
| BROW-02 | Phase 22 | Pending |
| BROW-03 | Phase 22 | Pending |

**Coverage: 13/13 requirements mapped (100%)**

---

*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after milestone v1.7 requirement definition*
