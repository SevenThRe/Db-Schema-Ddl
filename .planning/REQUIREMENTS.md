# Requirements: 应用级 DB 工作台 v1.5

**Created:** 2026-04-07
**Milestone:** v1.5 应用级 DB 工作台
**Status:** Active

## Milestone Goal

Turn DB Workbench from a feature-demo surface into an app-grade daily database tool: one primary workflow, trustworthy query/runtime behavior on real databases, multi-schema awareness, safe row editing, and snapshot-guarded live DB-to-DB sync.

---

## Requirements

### Category: Runtime & Performance (RUN)

- [ ] **RUN-01**: User can run a result-returning query without the backend preloading the full result set before the first page is shown in the UI
- [ ] **RUN-02**: User can load additional result pages through a supported paging path that preserves query context and clearly surfaces when paging is unsafe or unavailable
- [ ] **RUN-03**: User can cancel long-running query and export operations without leaving stuck UI state or orphaned backend task state
- [ ] **RUN-04**: User can export current page, loaded rows, or full result through registered runtime commands with explicit limits and warnings
- [ ] **RUN-05**: User can work against PostgreSQL schemas beyond `public` by selecting or persisting an active/default schema

### Category: Workspace Flow (FLOW)

- [x] **FLOW-01**: User enters DB operations through one primary DB Workbench surface instead of split legacy vs workbench paths
- [x] **FLOW-02**: User's tabs, selected objects, and query drafts persist per connection and do not leak across different connections
- [x] **FLOW-03**: User can reopen recent queries and manage saved SQL snippets/scripts for the active connection

### Category: Navigation & Autocomplete (NAV)

- [x] **NAV-01**: User can browse schemas, tables, views, columns, indexes, and foreign keys from an object explorer for the active connection
- [x] **NAV-02**: User can open table data and starter queries directly from the object explorer
- [x] **NAV-03**: User receives schema-aware autocomplete using cached metadata, scoped to active schema and resolved table aliases

### Category: Safe Data Editing (DATA)

- [x] **DATA-01**: User can edit safe single-table result sets only when primary-key mapping is provable and the connection is not readonly
- [x] **DATA-02**: User can review generated SQL and affected-row summary before committing row edits
- [x] **DATA-03**: User can commit all pending row edits in a single transaction or discard them entirely on failure or cancel

### Category: Compare & Sync (SYNC)

- [ ] **SYNC-01**: User can compare source vs target live databases by key and see insert/update/delete classifications per table
- [ ] **SYNC-02**: User can preview sync SQL and execution counts, and execution is blocked if the target snapshot changed after comparison
- [ ] **SYNC-03**: User can execute selected sync actions with audit history and production-grade safety confirmations

---

## Future Requirements (Deferred)

- Visual ER authoring / drag-to-design relationship editing
- Stored procedures, functions, and trigger management UI
- Broader DB engine support beyond MySQL/PostgreSQL
- Team/shared connection catalogs and collaboration workflows
- SSH tunnel / bastion host connection flows

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full parity with every Navicat screen in one milestone | Focus on high-frequency daily operator workflows first |
| A second separate `db-workbench` extension ID | Keep `db-connector` as the single DB surface to avoid navigation and state duplication |
| Arbitrary result-set editing | Only provably safe single-table + key-mapped edits are acceptable |
| Cross-database vendor expansion in this milestone | MySQL/PostgreSQL daily use is the current replacement target |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 15 | Complete |
| RUN-02 | Phase 15 | Complete |
| RUN-03 | Phase 15 | Complete |
| RUN-04 | Phase 15 | Complete |
| RUN-05 | Phase 15 | Complete |
| FLOW-01 | Phase 16 | Complete |
| FLOW-02 | Phase 16 | Complete |
| FLOW-03 | Phase 16 | Complete |
| NAV-01 | Phase 16 | Complete |
| NAV-02 | Phase 16 | Complete |
| NAV-03 | Phase 16 | Complete |
| DATA-01 | Phase 17 | Complete |
| DATA-02 | Phase 17 | Complete |
| DATA-03 | Phase 17 | Complete |
| SYNC-01 | Phase 18 | Pending |
| SYNC-02 | Phase 18 | Pending |
| SYNC-03 | Phase 18 | Pending |

**Coverage: 17/17 requirements mapped (100%)**

---

*Requirements defined: 2026-04-07*
*Last updated: 2026-04-08 after Phase 16 Plan 06 gap-closure sync (NAV-03 traceability aligned to verified implementation)*
