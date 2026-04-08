---
milestone: v1.5
milestone_name: 应用级 DB 工作台
created: "2026-04-07"
granularity: coarse
total_phases: 4
total_requirements: 17
---

# Roadmap: 应用级 DB 工作台 v1.5

## Milestone Goal

Turn DB Workbench into an app-grade daily database tool: trustworthy query/runtime behavior on real databases, one primary operator workflow, per-connection workspace isolation, multi-schema navigation, safe row editing, and snapshot-guarded live DB-to-DB sync.

---

## Phases

- [x] **Phase 15: Query Runtime Hardening** - User can trust query execution, paging, cancel, export, and schema context on real databases instead of demo-sized data
- [x] **Phase 16: Unified Workspace Flow** - User works through one primary DB Workbench path with per-connection sessions, recent work, object explorer, and schema-aware autocomplete (completed 2026-04-08)
- [ ] **Phase 17: Safe Data Editing** - User can safely edit single-table results with SQL preview, transaction commit, and rollback semantics
- [ ] **Phase 18: Live Data Compare & Sync** - User can compare source vs target live DB data, preview sync actions, and apply them with snapshot guarding and audit history

---

## Phase Details

### Phase 15: Query Runtime Hardening
**Goal**: Replace demo-oriented query behavior with app-grade runtime semantics: true first-page delivery, predictable load-more/export behavior, robust cancellation, and multi-schema connection context
**Depends on**: Current v1.4 DB Workbench shell and backend query/explain bridge
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05
**Success Criteria** (what must be TRUE):
  1. User can run a large result query and see the first page without the backend fully materializing the entire result set in memory first
  2. User can load more rows only through a paging path the system explicitly supports, and the UI clearly communicates unsupported paging cases instead of silently misbehaving
  3. User can cancel long-running query and export jobs without the UI hanging or backend registry state leaking
  4. User can export current page, loaded rows, or full result through runtime-supported commands that actually exist in the Tauri command surface
  5. User can select or persist a PostgreSQL schema context beyond `public`, and introspection/query helper flows respect it
**Plans**: 4/4 complete (15-01, 15-02, 15-03, 15-04)
**UI hint**: yes

### Phase 16: Unified Workspace Flow
**Goal**: Consolidate DB work into one primary workbench path, isolate sessions per connection, and make navigation/autocomplete good enough for repetitive daily use
**Depends on**: Phase 15 (runtime semantics and schema context are stable enough to anchor workspace state)
**Requirements**: FLOW-01, FLOW-02, FLOW-03, NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. User reaches database work through one primary workbench route instead of choosing between legacy `连接 / Schema / DIFF` and a separate operator shell
  2. User can switch connections without carrying query tabs or drafts across unrelated databases; reopening a connection restores that connection's own workbench state
  3. User can reopen recent queries and save/reuse SQL snippets for the active connection
  4. User can browse schemas, tables, views, indexes, and foreign keys from an object explorer and launch starter queries directly from that surface
  5. User receives schema-aware autocomplete from cached metadata, including alias-resolved column suggestions for active query context
**Plans**: 6/6 complete (16-01, 16-02, 16-03, 16-04, 16-05, 16-06)
**UI hint**: yes

### Phase 17: Safe Data Editing
**Goal**: Finish the row-editing loop so single-table result edits feel trustworthy: explicit eligibility, SQL preview, transaction commit, and rollback-safe failure handling
**Depends on**: Phase 16 (object navigation and per-connection state available; query runtime stable)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. User can enter edit mode only on provably safe single-table result sets with primary-key mapping and non-readonly connections
  2. User can review generated SQL and affected-row summary before commit, with enough context to understand what will change
  3. User can commit all pending row edits in one transaction or discard them entirely, and any failure rolls back the whole edit batch
**Plans**: TBD
**UI hint**: yes

### Phase 18: Live Data Compare & Sync
**Goal**: Turn the partially scaffolded data-sync idea into a first-class operator workflow with compare, preview, apply, snapshot guard, and auditability
**Depends on**: Phase 17 (safe edit/apply semantics proven; key-based row mapping and SQL preview patterns established)
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. User can compare source vs target live databases by key and see insert/update/delete classifications per table
  2. User can preview sync SQL and row counts before execution, and the system blocks apply if the target changed after the compare snapshot
  3. User can execute selected sync actions with audit history, operator-visible summaries, and production-grade safety confirmations
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 15. Query Runtime Hardening | 4/4 | Complete    | 2026-04-07 |
| 16. Unified Workspace Flow | 6/6 | Complete    | 2026-04-08 |
| 17. Safe Data Editing | 0/0 | Not started | - |
| 18. Live Data Compare & Sync | 0/0 | Not started | - |

---

## Coverage

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
| DATA-01 | Phase 17 | Pending |
| DATA-02 | Phase 17 | Pending |
| DATA-03 | Phase 17 | Pending |
| SYNC-01 | Phase 18 | Pending |
| SYNC-02 | Phase 18 | Pending |
| SYNC-03 | Phase 18 | Pending |

**Total: 17/17 requirements mapped (100% coverage)**

---

## Key Constraints

- Phase 15 must eliminate full-result prefetch semantics from the main query browsing path before later phases can be trusted
- Phase 15 must align shared schema, host API, desktop bridge, and Tauri command registration for every runtime/export path
- Phase 16 must consolidate the primary DB workflow without breaking existing file-vs-DB compare and DDL-related flows
- Phase 17 must keep edit eligibility conservative: single-table, key-mapped, non-readonly only
- Phase 18 must enforce target-snapshot validation and audit logging before any sync apply path is considered complete

---

*Last updated: 2026-04-08 — Updated after completing 16-06 gap-closure sync (NAV-03 traceability + verification command docs alignment)*
