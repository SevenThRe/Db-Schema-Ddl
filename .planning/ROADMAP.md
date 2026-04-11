---
milestone: v1.7
milestone_name: Operator Productivity Surfaces
created: "2026-04-11"
granularity: coarse
total_phases: 4
total_requirements: 13
---

# Roadmap

## Milestones

- ✅ **v1.5 应用级 DB 工作台** - shipped 2026-04-08 ([archive](./milestones/v1.5-ROADMAP.md))
- ✅ **v1.6 Reliability & Validation Hardening** - shipped 2026-04-11 ([archive](./milestones/v1.6-ROADMAP.md))
- 🚧 **v1.7 Operator Productivity Surfaces** - Phases 19-22

## Milestone Goal

Make DB Workbench faster to live in every day by improving trusted execution continuity, persistent operator memory, deeper object inspection, and repeat data-browse shortcuts without expanding into broader platform scope.

---

## Phases

- [ ] **Phase 19: Trusted Query Continuity** - Preserve trustworthy execution semantics for supported statements and restore recent query context after restart
- [ ] **Phase 20: Operator Memory & Favorites** - Let operators save, organize, and quick-launch reusable SQL work per connection
- [ ] **Phase 21: Deep Object Inspection** - Expand the explorer to more object types with definition preview and stronger filtering
- [ ] **Phase 22: Data Browse Accelerators** - Speed up repeat table inspection with starter actions, presets, and cleaner copy/export flows

---

## Phase Details

### Phase 19: Trusted Query Continuity
**Goal**: Operators can trust supported execution semantics in the workbench and recover recent query context when they come back to a connection
**Depends on**: Archived v1.5-v1.6 DB Workbench baseline
**Requirements**: COR-01, COR-02, MEM-01
**Success Criteria** (what must be TRUE):
  1. Operator can execute supported result-returning statements such as `SHOW` and `EXPLAIN` even when load-more paging is unavailable for that result shape
  2. When paging is unsupported, the workbench clearly states that limitation without showing a silent empty result or implying the statement did not run
  3. After restarting the app and reopening a connection, operator can reopen recent queries for that connection and continue working from prior context
**Plans**: TBD

### Phase 20: Operator Memory & Favorites
**Goal**: Operators can build reusable connection-scoped memory surfaces for repeat SQL work and launch them quickly from the workbench
**Depends on**: Phase 19
**Requirements**: MEM-02, MEM-03, MEM-04
**Success Criteria** (what must be TRUE):
  1. Operator can save a named SQL snippet or script for the active connection and find it again in a reusable library
  2. Operator can rename, duplicate, delete, and insert saved scripts or snippets into the current editor tab without losing active work
  3. Operator can pin favorite queries or tables and relaunch them quickly from the workbench
**Plans**: TBD
**UI hint**: yes

### Phase 21: Deep Object Inspection
**Goal**: Operators can inspect more database object types and preview their definitions from one explorer surface
**Depends on**: Phase 19
**Requirements**: INSP-01, INSP-02, INSP-03, INSP-04
**Success Criteria** (what must be TRUE):
  1. Operator can browse views alongside tables for the active schema
  2. Operator can browse supported routines and triggers when the current driver exposes them
  3. Operator can open a definition or DDL preview for tables, views, and supported routines or triggers directly from the explorer
  4. Operator can search or filter the explorer by schema and object type to narrow large catalogs quickly
**Plans**: TBD
**UI hint**: yes

### Phase 22: Data Browse Accelerators
**Goal**: Operators can start repeat table investigations faster and move browsed data out of the grid cleanly
**Depends on**: Phase 19 and Phase 21
**Requirements**: BROW-01, BROW-02, BROW-03
**Success Criteria** (what must be TRUE):
  1. Operator can open table data with starter actions such as top-N rows, row count, and explicit-column select without hand-writing the initial SQL
  2. Operator can save a browse preset for a table and later reapply the same limit, sort, and filter behavior as executable SQL
  3. Operator can copy or export selected cells, rows, or columns with headers and type-aware formatting
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 19. Trusted Query Continuity | 0/TBD | Not started | - |
| 20. Operator Memory & Favorites | 0/TBD | Not started | - |
| 21. Deep Object Inspection | 0/TBD | Not started | - |
| 22. Data Browse Accelerators | 0/TBD | Not started | - |

---

## Coverage

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

**Total: 13/13 requirements mapped (100% coverage)**

---

## Key Constraints

- Keep scope centered on operator productivity surfaces inside the existing `db-connector` workbench rather than broader platform expansion
- Preserve the trusted `v1.5` and `v1.6` execution, safety, and validation baseline while adding new surfaces
- Enforce safety and execution correctness in reachable runtime paths, not frontend-only intent
- Avoid regressions to existing Excel authoring and import workflows while improving DB Workbench productivity

---

*Last updated: 2026-04-11 after creating the v1.7 roadmap*
