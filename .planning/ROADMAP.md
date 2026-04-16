---
milestone: v1.8
milestone_name: Release-Grade DB Workbench
created: "2026-04-11"
granularity: coarse
total_phases: 9
total_requirements: 15
---

# Roadmap

## Milestones

- ✅ **v1.5 应用级 DB 工作台** - shipped 2026-04-08 ([archive](./milestones/v1.5-ROADMAP.md))
- ✅ **v1.6 Reliability & Validation Hardening** - shipped 2026-04-11 ([archive](./milestones/v1.6-ROADMAP.md))
- ↺ **v1.7 Operator Productivity Surfaces** - Phase 19 completed; remaining scope deferred after product-readiness refocus
- 🚧 **v1.8 Release-Grade DB Workbench** - Phases 23-31

## Milestone Goal

Turn DB Workbench from a capable internal-style operator surface into a publishable daily-use desktop product by closing release blockers in credential safety, runtime semantics, workflow coherence, inspection coverage, and release verification.

---

## Phases

- [x] **Phase 23: Release Safety Foundations** - Close credential, readonly, confirmation, and runtime-semantics blockers that prevent a publishable release claim (completed 2026-04-11)
- [x] **Phase 24: Canonical Workbench Flow** - Converge onto one coherent operator workflow and eliminate misleading legacy-vs-primary surface split (completed 2026-04-12)
- [x] **Phase 25: Deep Inspection Coverage** - Expand explorer and definition coverage so daily object inspection is credible beyond toy schemas (completed 2026-04-12)
- [ ] **Phase 26: Release Candidate Verification** - Prove the packaged product against live MySQL/PostgreSQL workflows and enforce a real ship gate
- [x] **Phase 27: Job Center And Execution History** - Turn long-running sync, verification, and export work into a first-class job surface with history and replay context (completed 2026-04-12)
- [ ] **Phase 28: Advanced Data Editing And Review Workflows** - Push grid editing from safe single-table changes toward reviewable, higher-throughput daily operator workflows
- [ ] **Phase 29: SQL Productivity And Script Operations** - Add reusable SQL productivity surfaces so repeated daily work can stay inside the workbench
- [ ] **Phase 30: Professional Connection Governance** - Make connection cataloging, grouping, and operational metadata feel credible against paid desktop DB tools
- [x] **Phase 31: DB Workbench Runtime And Sync Hardening** - Make sync compare/apply behavior truthful to the selected source and target connections, and expose the runtime key/filter contract operators need to compare real tables safely (completed 2026-04-15)

---

## Phase Details

### Phase 23: Release Safety Foundations
**Goal**: Operators and maintainers can trust saved connections and runtime safety boundaries well enough to treat the workbench as a releasable desktop DB product
**Depends on**: Archived v1.5-v1.6 baseline and completed v1.7 Phase 19 runtime trust work
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05
**Success Criteria** (what must be TRUE):
  1. Saved DB credentials no longer rely on plaintext local storage, and existing installs have a safe migration path
  2. Read-only and destructive-action protections are enforced in Rust runtime paths across execute, export, edit, and sync behaviors
  3. Operator-facing labels such as current-page export, loaded-rows export, stop-on-error, and cancel all match the behavior that actually runs
**Plans**: 23-01

### Phase 24: Canonical Workbench Flow
**Goal**: Daily DB workflows flow through one coherent product path instead of prototype-era split surfaces
**Depends on**: Phase 23
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04
**Success Criteria** (what must be TRUE):
  1. Primary DB tasks are discoverable and reachable from one canonical workbench route without depending on legacy entry points
  2. Connection context, schema context, environment cues, and read-only cues stay visible and stable while operators move through the workbench
  3. Editor/results/explain/sync state does not mislead the operator when switching tabs, views, or restoring prior session state
**Plans**: TBD
**UI hint**: yes

### Phase 25: Deep Inspection Coverage
**Goal**: Operators can inspect the database objects they need for real work, not only a toy subset of schema surfaces
**Depends on**: Phase 23 and Phase 24
**Requirements**: INSP-01, INSP-02, INSP-03
**Success Criteria** (what must be TRUE):
  1. Explorer coverage includes tables, views, indexes, and foreign keys in a way that remains usable on larger catalogs
  2. Supported routines, triggers, functions, or procedures are discoverable for the active driver when introspection exists
  3. Definitions or DDL previews can be opened directly from supported explorer objects
**Plans**: TBD
**UI hint**: yes

### Phase 26: Release Candidate Verification
**Goal**: The team has ship-quality evidence that the packaged workbench is trustworthy on supported databases before public release
**Depends on**: Phase 23, Phase 24, and Phase 25
**Requirements**: QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. Live MySQL and PostgreSQL verification covers connect, query, paging, export, cancel, edit, readonly, and object-inspection flows with reproducible evidence
  2. Packaged desktop smoke tests cover startup, connection recovery, and critical workbench workflows without relying only on source checkout execution
  3. A ship gate clearly distinguishes release blockers from deferrable issues before claiming the product is ready to publish
**Plans**: 26-01, 26-02

### Phase 27: Job Center And Execution History
**Goal**: Long-running DB work is observable, reviewable, and reopenable from one operational surface instead of disappearing after a toast
**Depends on**: Phase 26
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can see active and recent background jobs such as data sync, verification, or heavy exports in one persistent job center
  2. Job detail retains enough execution history, failure context, and SQL/audit summary to reopen prior runs without guessing
  3. Daily work no longer depends on transient notifications to understand whether long-running DB actions completed or failed
**Plans**: 27-01, 27-02
**UI hint**: yes

### Phase 28: Advanced Data Editing And Review Workflows
**Goal**: Data editing workflows are credible for real daily maintenance work, not only careful single-table happy paths
**Depends on**: Phase 27
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can stage, review, revert, and commit larger edit sets without losing row context or trust in what will be written
  2. Row insert/delete/update workflows feel coherent across grid state, SQL preview, and transactional execution boundaries
  3. Editing guardrails remain explicit while throughput improves beyond the current safe-but-narrow baseline
**Plans**: 28-01, 28-02
**UI hint**: yes

### Phase 29: SQL Productivity And Script Operations
**Goal**: Repeated SQL work can stay inside the workbench through reusable script and execution productivity surfaces
**Depends on**: Phase 28
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can save, find, organize, and rerun useful SQL assets without depending only on recent-query history
  2. The workbench supports faster repeated execution patterns for investigative and operational SQL work
  3. SQL productivity features remain consistent with connection context, schema context, and existing execution safety rules
**Plans**: TBD
**UI hint**: yes

### Phase 30: Professional Connection Governance
**Goal**: Connection cataloging and operator-facing connection controls feel credible against paid desktop DB tools
**Depends on**: Phase 29
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can organize, search, prioritize, and visually govern saved connections at scale
  2. Connection metadata such as environment, readonly posture, grouping, notes, and defaults is actionable rather than decorative
  3. The connection center supports daily switching and governance work without degrading the canonical DB workflow
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Release Safety Foundations | 1/1 | Complete    | 2026-04-11 |
| 24. Canonical Workbench Flow | 2/2 | Complete    | 2026-04-12 |
| 25. Deep Inspection Coverage | 1/1 | Complete    | 2026-04-12 |
| 26. Release Candidate Verification | 2/2 | Blocked on live evidence | - |
| 27. Job Center And Execution History | 2/2 | Complete | 2026-04-12 |
| 28. Advanced Data Editing And Review Workflows | 1/2 | In progress | - |
| 29. SQL Productivity And Script Operations | 0/TBD | Not started | - |
| 30. Professional Connection Governance | 0/TBD | Not started | - |
| 31. DB Workbench Runtime And Sync Hardening | 1/1 | Complete | 2026-04-15 |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | Phase 23 | Complete |
| SAFE-02 | Phase 23 | Complete |
| SAFE-03 | Phase 23 | Complete |
| SAFE-04 | Phase 23 | Complete |
| SAFE-05 | Phase 23 | Complete |
| FLOW-01 | Phase 24 | Complete |
| FLOW-02 | Phase 24 | Complete |
| FLOW-03 | Phase 24 | Complete |
| FLOW-04 | Phase 24 | Complete |
| INSP-01 | Phase 25 | Complete |
| INSP-02 | Phase 25 | Complete |
| INSP-03 | Phase 25 | Complete |
| QUAL-01 | Phase 26 | Blocked on external live DB evidence |
| QUAL-02 | Phase 26 | Complete |
| QUAL-03 | Phase 26 | Complete |

**Total: 15/15 requirements mapped (100% coverage)**

---

## Key Constraints

- No publishable-release claim is valid while saved DB credentials still depend on plaintext storage
- Runtime guardrails must live in Rust command paths, not only in frontend intent or labels
- Keep internal extension ID `db-connector`; improve the product in place rather than splitting the workbench into a second DB extension
- Preserve existing Excel authoring/import capability while converging the DB workbench into one coherent primary path
- Defer convenience/productivity work that does not materially improve publishability until release blockers are closed

### Phase 31: DB Workbench Runtime And Sync Hardening

**Goal:** Make sync compare/apply behavior truthful to the selected source and target connections, and expose the runtime key/filter contract operators need to compare real tables safely.
**Requirements**: TBD
**Depends on:** Phase 30
**Success Criteria** (what must be TRUE):
  1. Sync table choices come from the selected source and target connections rather than only from the active workbench connection snapshot
  2. Operators can review or override compare key columns, compare columns, and row filters before previewing a data diff
  3. Compare summary reflects the resolved runtime key/compare scope so blockers and apply behavior are understandable before execution
**Plans:** 31-01

Plans:
- [x] 31-01 Sync context and compare-contract hardening

---

*Last updated: 2026-04-15 after completing Phase 31 DB Workbench Runtime And Sync Hardening*
