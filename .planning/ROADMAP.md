---
milestone: v1.8
milestone_name: Release-Grade DB Workbench
created: "2026-04-11"
granularity: coarse
total_phases: 8
total_requirements: 15
---

# Roadmap

## Milestones

- ✅ **v1.5 应用级 DB 工作台** - shipped 2026-04-08 ([archive](./milestones/v1.5-ROADMAP.md))
- ✅ **v1.6 Reliability & Validation Hardening** - shipped 2026-04-11 ([archive](./milestones/v1.6-ROADMAP.md))
- ↺ **v1.7 Operator Productivity Surfaces** - Phase 19 completed; remaining scope deferred after product-readiness refocus
- 🚧 **v1.8 Release-Grade DB Workbench** - active phases 23-28, 31-32
- 🧭 **v1.9 Premium Capability Parity** - planned phases 29-30, 33-42
- ✅ **v2.0 Installable Extension Platform** - Phases 43-48 complete (implemented 2026-04-18)

## Milestone Goal

Turn DB Workbench from a capable internal-style operator surface into a publishable daily-use desktop product by closing release blockers in credential safety, runtime semantics, workflow coherence, inspection coverage, and release verification.

**Execution bands:**
- `Phases 23-27`: release baseline and live-verification credibility
- `Phases 28 and 31`: editing and sync hardening needed to keep daily-use claims truthful
- `Phase 32`: release-exit evidence packaging and blocker audit before any publishable claim

---

## Active Phases (v1.8)

- [x] **Phase 23: Release Safety Foundations** - Close credential, readonly, confirmation, and runtime-semantics blockers that prevent a publishable release claim (completed 2026-04-11)
- [x] **Phase 24: Canonical Workbench Flow** - Converge onto one coherent operator workflow and eliminate misleading legacy-vs-primary surface split (completed 2026-04-12)
- [x] **Phase 25: Deep Inspection Coverage** - Expand explorer and definition coverage so daily object inspection is credible beyond toy schemas (completed 2026-04-12)
- [ ] **Phase 26: Release Candidate Verification** - Prove the packaged product against live MySQL/PostgreSQL workflows and enforce a real ship gate
- [x] **Phase 27: Job Center And Execution History** - Turn long-running sync, verification, and export work into a first-class job surface with history and replay context (completed 2026-04-12)
- [ ] **Phase 28: Advanced Data Editing And Review Workflows** - Push grid editing from safe single-table changes toward reviewable, higher-throughput daily operator workflows
- [x] **Phase 31: DB Workbench Runtime And Sync Hardening** - Make sync compare/apply behavior truthful to the selected source and target connections, and expose the runtime key/filter contract operators need to compare real tables safely (completed 2026-04-15)
- [ ] **Phase 32: Close Live Release Verification And Ship-Gate Evidence** - Package final live evidence, late hardening proof, and explicit ship-or-no-ship criteria into one release-exit gate (implementation landed 2026-04-17; current release-exit checklist remains blocked on live DB proof)

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

### Phase 31: DB Workbench Runtime And Sync Hardening
**Goal**: Make sync compare/apply behavior truthful to the selected source and target connections, and expose the runtime key/filter contract operators need to compare real tables safely
**Requirements**: TBD
**Depends on**: Phase 28
**Success Criteria** (what must be TRUE):
  1. Sync table choices come from the selected source and target connections rather than only from the active workbench connection snapshot
  2. Operators can review or override compare key columns, compare columns, and row filters before previewing a data diff
  3. Compare summary reflects the resolved runtime key/compare scope so blockers and apply behavior are understandable before execution
**Plans**: 31-01

Plans:
- [x] 31-01 Sync context and compare-contract hardening

### Phase 32: Close Live Release Verification And Ship-Gate Evidence
**Goal**: Turn the remaining live-verification gap and late hardening evidence into one final release-exit package instead of leaving publishability scattered across prior phases
**Requirements**: TBD
**Depends on**: Phase 26 and Phase 31
**Success Criteria** (what must be TRUE):
  1. Live verification, packaged smoke, and late hardening evidence are linked from one release-exit checklist tied to the current installer build
  2. Remaining issues are explicitly classified as ship blockers versus post-release backlog, with no ambiguous "probably good enough" state
  3. The product cannot be called publishable until this evidence package is current and passes the release-exit review
**Plans**: 32-01

Plans:
- [x] 32-01 Release-exit evidence consolidation and publish gate (implemented 2026-04-17; current checklist blocked on live evidence)

---

## Planned Next Milestone: v1.9 Premium Capability Parity

**Goal:** Close the remaining premium-tool capability gaps after the release-grade baseline is credible.

**Planned phases:**
- [ ] **Phase 29: SQL Productivity And Script Operations** - Add reusable SQL productivity surfaces so repeated daily work can stay inside the workbench
- [ ] **Phase 30: Professional Connection Governance** - Make connection cataloging, grouping, and operational metadata feel credible against paid desktop DB tools
- [ ] **Phase 33: Persist Edit Drafts And Recovery Across Reruns And Restart** - Make staged grid editing survive reruns, pane churn, and app restart without losing operator trust
- [ ] **Phase 34: Promote Data Sync From Preview To Release-Grade Operator Workflow** - Raise compare/apply data sync from preview semantics to a fully trusted daily-use workflow
- [ ] **Phase 35: Build A First-Class SQL Asset Catalog And Organization Model** - Add durable SQL asset organization beyond snippets, recents, and history
- [ ] **Phase 36: Add Operational SQL Automation Runbooks And Repeat Execution Surfaces** - Turn repeatable operational SQL into faster, safer in-product runbooks
- [ ] **Phase 37: Scale Connection Governance For Large Saved-Connection Catalogs** - Make connection search, grouping, bulk governance, and metadata credible at larger team-scale inventories
- [ ] **Phase 38: Add Secure SSH And TLS Transport Connectivity For Supported Drivers** - Support secure transport posture expected from professional desktop DB tools
- [ ] **Phase 39: Add Enterprise Authentication And External Secret Posture For DB Connections** - Improve auth and secret handling beyond the local baseline for managed environments
- [ ] **Phase 40: Ship ER Diagram Relation Canvas And Graph Navigation** - Add a first-class relational graph surface for structure understanding and navigation
- [ ] **Phase 41: Build Visual Schema Change Designer With DDL Preview** - Add reviewable visual change design before execution
- [ ] **Phase 42: Build Visual Schema Authoring And Migration Workspace** - Add a full visual schema authoring and migration workspace on top of the existing DDL/runtime foundation

### Phase 29: SQL Productivity And Script Operations
**Goal**: Repeated SQL work can stay inside the workbench through reusable script and execution productivity surfaces
**Depends on**: Phase 28 and release closure from Phase 32
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can save, find, organize, and rerun useful SQL assets without depending only on recent-query history
  2. The workbench supports faster repeated execution patterns for investigative and operational SQL work
  3. SQL productivity features remain consistent with connection context, schema context, and existing execution safety rules
**Plans**: 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 29 to break down)

### Phase 30: Professional Connection Governance
**Goal**: Connection cataloging and operator-facing connection controls feel credible against paid desktop DB tools
**Depends on**: Phase 29
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can organize, search, prioritize, and visually govern saved connections at scale
  2. Connection metadata such as environment, readonly posture, grouping, notes, and defaults is actionable rather than decorative
  3. The connection center supports daily switching and governance work without degrading the canonical DB workflow
**Plans**: 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 30 to break down)

### Phase 33: Persist Edit Drafts And Recovery Across Reruns And Restart
**Goal**: Make staged insert, update, and delete drafts survive reruns, pane churn, and app restart without letting stale draft state silently corrupt operator trust
**Depends on**: Phase 28 and Phase 31
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Grid edit drafts persist per connection/schema/table/result signature and restore after restart when the underlying result is still compatible
  2. Recovered drafts are explicitly marked as restored, and stale or incompatible drafts are blocked from silent replay until the operator resolves them
  3. Operators can discard, merge, or continue recovered drafts without losing accurate SQL preview or commit counts
**Plans**: 33-01

Plans:
- [ ] 33-01 Durable edit-draft persistence and recovery

### Phase 34: Promote Data Sync From Preview To Release-Grade Operator Workflow
**Goal**: Raise compare/apply data sync from a credible preview surface into a daily-use workflow with explicit readiness, blocker, and replay semantics
**Depends on**: Phase 31 and Phase 32
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Sync compare/apply has explicit readiness and blocker states per table instead of relying on preview-only interpretation
  2. Operators can reopen, review, and continue sync work without losing key-column, compare-column, and row-filter intent
  3. Release verification can treat sync as a supported daily workflow instead of a preview-grade feature
**Plans**: 34-01

Plans:
- [ ] 34-01 Release-grade data sync readiness and replay semantics

### Phase 35: Build A First-Class SQL Asset Catalog And Organization Model
**Goal**: Move SQL reuse beyond flat snippets into a durable catalog with structure, metadata, and migration from the current session-level library
**Depends on**: Phase 29
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. SQL assets support folders or paths, tags, descriptions, and connection scope instead of only name plus SQL text
  2. Operators can browse, search, sort, and preview SQL assets through one coherent catalog surface
  3. Existing snippets and history survive migration into the richer model without silent data loss
**Plans**: 35-01

Plans:
- [ ] 35-01 SQL asset catalog model and migration

### Phase 36: Add Operational SQL Automation Runbooks And Repeat Execution Surfaces
**Goal**: Turn repeated operational SQL into parameterized, reviewable runbooks that execute safely inside the workbench
**Depends on**: Phase 35
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can define parameterized SQL runbooks with explicit execution mode and confirmation rules
  2. Runbooks flow through existing parameter review and dangerous-SQL guardrails instead of bypassing them
  3. Runbook execution history is visible enough to rerun or audit repeated operational work
**Plans**: 36-01

Plans:
- [ ] 36-01 Parameterized SQL runbooks and repeat execution

### Phase 37: Scale Connection Governance For Large Saved-Connection Catalogs
**Goal**: Make large saved-connection inventories governable through dense filters, bulk actions, and metadata that stays actionable at scale
**Depends on**: Phase 30
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can filter and sort large connection lists by tags, environment, readonly posture, favorite state, archive state, and recent activity
  2. Bulk governance actions can update common metadata without forcing one-by-one edits
  3. The quick-switch workbench surfaces reflect the richer governance metadata without becoming misleading or noisy
**Plans**: 37-01

Plans:
- [ ] 37-01 Large-scale connection governance metadata and bulk workflows

### Phase 38: Add Secure SSH And TLS Transport Connectivity For Supported Drivers
**Goal**: Add secure transport profiles for MySQL and PostgreSQL so operators can connect through TLS and SSH-tunneled topologies expected from professional desktop DB tools
**Depends on**: Phase 37
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Saved connections can express TLS mode, certificate paths, and SSH tunnel settings through explicit typed config
  2. Connection test, introspection, query, and explain paths honor the configured transport profile rather than treating it as form-only metadata
  3. Transport failures produce diagnosable errors without leaking secrets or certificate contents
**Plans**: 38-01

Plans:
- [ ] 38-01 TLS and SSH transport profiles for supported drivers

### Phase 39: Add Enterprise Authentication And External Secret Posture For DB Connections
**Goal**: Support non-inline credential flows and external secret references so enterprise-managed environments do not depend on locally stored static passwords alone
**Depends on**: Phase 38
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Saved connections can use concrete credential modes such as secure-store password, environment-variable secret, runtime prompt, or token command output
  2. The runtime resolves credential material only at execution time and does not serialize resolved secrets back into saved config
  3. Operators can understand auth posture and failure state without exposing secret values in UI, logs, or artifacts
**Plans**: 39-01

Plans:
- [ ] 39-01 Enterprise credential modes and external secret posture

### Phase 40: Ship ER Diagram Relation Canvas And Graph Navigation
**Goal**: Add a first-class relation canvas so operators can understand schema structure visually without leaving the canonical workbench
**Depends on**: Phase 25
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. The workbench can render table relationships from introspected schema snapshots as a scalable navigable graph
  2. Explorer, inspection, and relation-canvas navigation stay linked so selecting a table in one surface can focus it in the others
  3. Large schema views remain usable through layout, filtering, and focus controls rather than turning into an unreadable wall of nodes
**Plans**: 40-01

Plans:
- [ ] 40-01 Relation graph model, canvas, and navigation sync

### Phase 41: Build Visual Schema Change Designer With DDL Preview
**Goal**: Let operators design schema changes visually while still ending in deterministic DDL preview and explicit review before execution
**Depends on**: Phase 40
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can stage add, alter, and drop changes for tables, columns, indexes, and foreign keys through a visual designer surface
  2. Every staged change produces deterministic DDL preview and risk summary before any execution handoff
  3. Visual design state remains aligned with the current connection/schema context instead of drifting into disconnected mockups
**Plans**: 41-01

Plans:
- [ ] 41-01 Visual schema change drafting with deterministic DDL preview

### Phase 42: Build Visual Schema Authoring And Migration Workspace
**Goal**: Extend the change designer into a full visual schema authoring workspace that can create multi-table drafts and hand them off into safe migration review
**Depends on**: Phase 41
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Operators can author multi-table schema drafts with relationships, ordering, and object metadata inside one workspace
  2. Drafts can import from or export to the existing DDL and workbook flows instead of becoming a disconnected side tool
  3. Migration handoff preserves the same review, preview, and safety posture expected from the rest of the workbench
**Plans**: 42-01

Plans:
- [ ] 42-01 Visual schema authoring workspace and migration handoff

**Capability blocks:**
- SQL productivity and organization: `Phases 29, 35-36`
- Connection governance and secure connectivity: `Phases 30, 37-39`
- Editing and sync graduation: `Phases 33-34`
- Structure visualization and visual schema design: `Phases 40-42`

---

## Planned Later Milestone: v2.0 Installable Extension Platform

**Goal:** Generalize the desktop shell into an installable extension platform without weakening the DB workbench baseline.

**Planned phases:**
- [x] **Phase 43: Define Extension Shell And Contribution Model For Activity Bar, Sidebar Views, And Workbench Surfaces** (completed 2026-04-17)
- [x] **Phase 44: Build VS Code-Style Extension Activity Bar And Secondary Sidebar Host** (completed 2026-04-17)
- [x] **Phase 45: Support Installable Frontend Extension Bundles And Runtime UI Mounting** (completed 2026-04-18)
- [x] **Phase 46: Extract DB Workbench Into An On-Demand Installable Extension Package** (completed 2026-04-18)
- [x] **Phase 47: Build Extension Install, Activation, And Persisted Enablement Flow** (completed 2026-04-18)
- [x] **Phase 48: Migrate Non-Core DB Surfaces Behind Extension Boundaries And Retire Host Leakage** (completed 2026-04-18)

### Phase 43: Define Extension Shell And Contribution Model For Activity Bar, Sidebar Views, And Workbench Surfaces
**Goal**: Replace the current nav-item-to-panel assumption with one typed extension-shell contract that can express activity bar entries, per-extension sidebar views, and main workbench surfaces across builtin and external extensions
**Requirements**: TBD
**Depends on**: Existing extension registry foundation and the current `db-connector` builtin workbench baseline
**Success Criteria** (what must be TRUE):
  1. Shared TypeScript and Rust manifest schemas both support `activityBar`, `sidebarViews`, and `workbenchViews` contribution types without relying on `navigation -> workspacePanels[0]` inference
  2. Frontend host resolvers can normalize the new contribution model while still parsing older builtin or external manifests during the migration window
  3. Extension shell routing can identify an activity item, a sidebar view, and a workbench view separately before any UI host chrome is rebuilt
**Plans**: 2/2 plans complete

Plans:
- [x] 43-01 Extension contribution schema and manifest parity
- [x] 43-02 Frontend resolver and host-route normalization

### Phase 44: Build VS Code-Style Extension Activity Bar And Secondary Sidebar Host
**Goal**: Rebuild the app shell so extensions render through a primary activity bar and a contextual secondary sidebar instead of footer shortcuts and single-panel mounting
**Requirements**: TBD
**Depends on**: Phase 43
**Success Criteria** (what must be TRUE):
  1. The desktop shell has a distinct activity bar, extension secondary sidebar, and main workbench area rather than mixing extension entrypoints into the core file sidebar footer
  2. Selecting an extension activity swaps that extension's sidebar tabs and preserves a stable main workbench surface without duplicating internal sidebars
  3. `db-connector` can run as the first adopter of the new host shell while preserving the existing DB workbench baseline during the transition
**Plans**: 3/3 plans complete
**UI hint**: yes

Plans:
- [x] 44-01 Extension shell chrome and surface routing
- [x] 44-02 DB connector adoption of host-managed secondary sidebar views
- [x] 44-03 Shell regression guards and route contract checks

### Phase 45: Support Installable Frontend Extension Bundles And Runtime UI Mounting
**Goal**: Let external extensions ship their own frontend UI bundles and mount them at runtime instead of depending on a host-local registry entry
**Requirements**: TBD
**Depends on**: Phase 43 and Phase 44
**Success Criteria** (what must be TRUE):
  1. External extensions can declare a frontend UI bundle entry that the host can verify and load at runtime
  2. The host can mount extension-provided sidebar and workbench UI safely without recompiling the app
  3. Failure states for missing, invalid, or incompatible UI bundles are explicit in the shell
**Plans**: 3/3 plans complete

Plans:
- [x] 45-01 Runtime bundle manifest parity and backend validation
- [x] 45-02 Asset-protocol loader and shell runtime mount fallback
- [x] 45-03 Runtime bundle regression guard and roadmap/state handoff

### Phase 46: Extract DB Workbench Into An On-Demand Installable Extension Package
**Goal**: Move the DB workbench UI and optional runtime packaging behind an installable extension boundary so the base app can ship without it preloaded
**Requirements**: TBD
**Depends on**: Phase 45
**Success Criteria** (what must be TRUE):
  1. Initial install can ship the Excel and DDL core without bundling the DB workbench UI as an always-present host surface
  2. Installing the DB workbench package adds its activity item, sidebar views, and workbench UI through the extension shell
  3. Existing DB host APIs and runtime packaging stay compatible enough to preserve operator trust during the extraction
**Plans**: 3/3 plans complete

Plans:
- [x] 46-01 UI-only extension contract and truthful install controls
- [x] 46-02 Runtime host bridge and extracted db-connector bundle entry
- [x] 46-03 Host cleanup, package scaffold, and regression handoff

### Phase 47: Build Extension Install, Activation, And Persisted Enablement Flow
**Goal**: Make extension installation, activation, and remembered enablement feel like product behavior instead of a developer-only toggle list
**Requirements**: TBD
**Depends on**: Phase 45 and Phase 46
**Success Criteria** (what must be TRUE):
  1. Operators can install, enable, disable, and reopen extensions with persistent state and clear activation outcomes
  2. The shell only exposes activity items and sidebar views for installed and enabled extensions
  3. Install, update, disable, and uninstall flows leave the host in a truthful and recoverable state
**Plans**: 3/3 plans complete

Plans:
- [x] 47-01 Lifecycle truth and persisted enablement normalization
- [x] 47-02 Canonical extension-management install and activation surface
- [x] 47-03 Shell fallback, regression evidence, and roadmap/state handoff

### Phase 48: Migrate Non-Core DB Surfaces Behind Extension Boundaries And Retire Host Leakage
**Goal**: Finish the architectural split by moving non-core DB product surfaces behind extension boundaries and removing extension implementation leakage from host navigation
**Requirements**: TBD
**Depends on**: Phase 46 and Phase 47
**Success Criteria** (what must be TRUE):
  1. Host navigation no longer exposes extension implementation details such as panel ids or builtin-extension-first assumptions
  2. Non-core DB surfaces are reachable through extension-provided activity, sidebar, and workbench contributions instead of host hardcoding
  3. The core host remains focused on Excel and DDL loops plus extension management without silently reabsorbing extension UI concerns
**Plans**: 3/3 plans complete

Plans:
- [x] 48-01 Host route contract cleanup and panelId retirement
- [x] 48-02 DB-tool handoff and host copy cleanup
- [x] 48-03 Boundary-doc refresh, regression evidence, and lifecycle handoff

---

## Progress (v1.8 Active Milestone)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Release Safety Foundations | 1/1 | Complete | 2026-04-11 |
| 24. Canonical Workbench Flow | 2/2 | Complete | 2026-04-12 |
| 25. Deep Inspection Coverage | 1/1 | Complete | 2026-04-12 |
| 26. Release Candidate Verification | 2/2 | Blocked on live evidence | - |
| 27. Job Center And Execution History | 2/2 | Complete | 2026-04-12 |
| 28. Advanced Data Editing And Review Workflows | 1/2 | In progress | - |
| 31. DB Workbench Runtime And Sync Hardening | 1/1 | Complete | 2026-04-15 |
| 32. Close Live Release Verification And Ship-Gate Evidence | 1/1 | Blocked on current live evidence | - |

---

## Coverage (v1.8 Active Milestone)

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
- Future parity and extension-platform phases must not silently expand the minimum `v1.8` publishability bar

---

*Last updated: 2026-04-18 after completing Phase 46 and advancing the installable extension platform to Phase 47*
