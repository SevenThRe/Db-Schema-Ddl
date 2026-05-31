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
- 🧠 **v2.1 SQL Intelligence And AI Assistance** - Phases 49-53 complete
- ✅ **v2.2 DB Workbench Product-Truth Convergence** - Phases 54-56 complete (implemented 2026-04-18)

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
- [x] **Phase 28: Advanced Data Editing And Review Workflows** - Push grid editing from safe single-table changes toward reviewable, higher-throughput daily operator workflows (completed 2026-04-18)
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

Plans:
- [x] 28-01 Delete staging, mixed review, and single-row guardrails
- [x] 28-02 Insert-row drafting and mixed insert/update/delete review

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
**Plans**: 4/4 plans complete

Plans:
- [x] 32-01 Release-exit evidence consolidation and publish gate (implemented 2026-04-17; current checklist blocked on live evidence)
- [x] 32-02 Live-verification prereq probe and blocker handoff clarity (completed 2026-05-10)
- [x] 32-03 Prereq-artifact exclusion regression guard for ship-gate evidence discovery (completed 2026-05-10)
- [x] 32-04 Prereq-probe exit semantics for unattended verification workflows (completed 2026-05-10)

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

## Planned Later Milestone: v2.1 SQL Intelligence And AI Assistance

**Goal:** Raise SQL authoring from a strong schema-aware editor into a professional DB IDE surface with AST-grade semantics, privacy-preserving query memory, and optional local-AI assistance that never bypasses runtime safety.

**Planned phases:**
- [x] **Phase 49: Build AST-Backed SQL Context Engine And Scope Resolution** - Replace heuristic cursor interpretation with a reusable semantic context engine (completed 2026-04-18)
- [x] **Phase 50: Add FK-Aware SQL Semantics, Join Completion, And Semantic Diagnostics** - Deepen authoring quality with driver-aware ranking, join synthesis, and editor diagnostics (completed 2026-04-18)
- [x] **Phase 51: Build Query Memory, Schema/Value Grounding, And Adaptive SQL Ranking** - Add privacy-preserving operator memory and grounding for smarter suggestions (completed 2026-04-18)
- [x] **Phase 52: Add Local Model Runtime And Offline SQL Copilot Infrastructure** - Support grounded on-device SQL assistance without depending on remote model calls (completed 2026-04-18)
- [x] **Phase 53: Ship Natural-Language-To-SQL And Generated SQL Completion With Safety Gates** - Turn local assistance into reviewable generated SQL workflows with evaluation evidence (completed 2026-04-18)

### Phase 49: Build AST-Backed SQL Context Engine And Scope Resolution
**Goal**: Replace heuristic token scanning with a reusable semantic engine that understands SQL statement structure, cursor position, and nested scope well enough for professional editing workflows
**Requirements**:
  - typed local runtime settings and host contracts for provider selection, model configuration, timeout, and grounding limits
  - Tauri runtime discovery and grounded local probe execution for supported offline providers
  - reachable workbench UI for runtime state, prompt preview, warmup, and advisory probe output
**Depends on**: Phase 29 and Phase 48
**Success Criteria** (what must be TRUE):
  1. Cursor context resolves the active statement, clause, and syntactic slot for common MySQL/PostgreSQL `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `WITH` forms
  2. Alias, CTE, and nested subquery scopes produce accurate relation and projected-column visibility without relying on regex-only inference
  3. Monaco completion, hover, and future diagnostic consumers all read from one shared semantic-context contract instead of each reparsing SQL ad hoc
**Plans**: 1/1 plans complete

Plans:
- [x] 49-01 Shared SQL semantic context engine, Monaco hover wiring, and regression coverage

### Phase 50: Add FK-Aware SQL Semantics, Join Completion, And Semantic Diagnostics
**Goal**: Lift SQL editing from basic semantic completion to professional IDE-grade guidance with driver-aware catalogs, join synthesis, and preflight diagnostics
**Requirements**: TBD
**Depends on**: Phase 49
**Success Criteria** (what must be TRUE):
  1. MySQL and PostgreSQL builtins, types, system schemas, and relation catalogs rank according to the active clause and driver
  2. FK-aware join suggestions can synthesize candidate tables and `ON` clauses from the real schema graph while respecting aliases and current scope
  3. Unknown tables or columns, alias breaks, incompatible clause usage, and risky DML patterns surface as lightweight editor diagnostics before execution
**Plans**: 1/1 plans complete

Plans:
- [x] 50-01 Driver-aware SQL catalogs, ON-clause FK join guidance, and semantic diagnostics

### Phase 51: Build Query Memory, Schema/Value Grounding, And Adaptive SQL Ranking
**Goal**: Add a privacy-preserving memory layer so SQL assistance can learn from operator history and safe database summaries without storing raw sensitive result sets by default
**Requirements**:
  - Persist accepted SQL completions, reusable query patterns, and safe value-shape summaries per connection
  - Use this memory to bias SQL ranking without replacing the Phase 49-50 semantic engine
  - Expose inspect, retention, and clear controls from the reachable workbench UI
**Depends on**: Phase 50
**Success Criteria** (what must be TRUE):
  1. The workbench records reusable query history, accepted suggestions, and repeatable statement patterns per connection or schema with explicit retention controls
  2. Assistance can rank or draft suggestions using schema graph context, column or value summaries, and approved history rather than raw prompt guessing alone
  3. Operators can inspect, clear, and scope this memory so personalization never turns into opaque hidden state
**Plans**: 1/1 plans complete

Plans:
- [x] 51-01 SQL memory, schema or value grounding, adaptive ranking, and operator controls

### Phase 52: Add Local Model Runtime And Offline SQL Copilot Infrastructure
**Goal**: Provide a first-class local model runtime and prompt-grounding layer so SQL assistance can run in privacy-preserving offline mode inside the desktop product
**Requirements**:
  - typed local runtime settings and host contracts for provider selection, model configuration, timeout, and grounding limits
  - Tauri runtime discovery and grounded local probe execution for supported offline providers
  - reachable workbench UI for runtime state, prompt preview, warmup, and advisory probe output
**Depends on**: Phase 51
**Success Criteria** (what must be TRUE):
  1. The desktop runtime can discover, configure, and execute supported on-device SQL-assist models with explicit availability, warmup, and resource state
  2. Prompt orchestration grounds the model in current schema context, safe memory summaries, and driver rules instead of freeform ungrounded chat
  3. Model failure, latency, and privacy posture are visible enough that AI assistance never masquerades as deterministic engine behavior
**Plans**: 1/1 plans complete

Plans:
- [x] 52-01 Local runtime contracts, grounded prompt packaging, workbench copilot dialog, and regression coverage

### Phase 53: Ship Natural-Language-To-SQL And Generated SQL Completion With Safety Gates
**Goal**: Turn the local copilot foundation into reviewable generated-SQL workflows that speed authoring without bypassing the workbench's existing safety model
**Requirements**:
  - generated prompt packaging must declare a structured draft contract and mode-specific behavior for natural language, refinement, and partial completion
  - accepted drafts must reuse the existing workbench execution safety path instead of bypassing parameter review, script review, dangerous-SQL confirmation, or readonly guards
  - representative evaluation artifacts must exist for MySQL and PostgreSQL generation quality
**Depends on**: Phase 52
**Success Criteria** (what must be TRUE):
  1. Operators can request SQL from natural language, inline intent prompts, or partial statements and receive grounded draft SQL with visible assumptions
  2. Generated SQL flows through parameter review, dangerous-SQL confirmation, readonly guards, and explicit human acceptance before execution
  3. Evaluation artifacts track generation quality, hallucination rate, and safety regressions against representative MySQL and PostgreSQL tasks
**Plans**: 1/1 plans complete

Plans:
- [x] 53-01 Generated SQL prompt packaging, review flow, safety-gated execution reuse, and evaluation evidence

**Capability blocks:**
- AST and semantic SQL foundation: `Phases 49-50`
- Query memory and grounding: `Phase 51`
- Local model runtime and generated SQL assistance: `Phases 52-53`

---

## Completed Later Milestone: v2.2 DB Workbench Product-Truth Convergence

**Goal:** Close the remaining operator-coherence defects that no longer block `v1.8` publishability, but still leave the DB workbench broader, noisier, and less self-verifying than an operator-grade desktop tool should be.

**Completed phases:**
- [x] **Phase 54: Consolidate Canonical DB Workbench Surfaces And Legacy Retirement Criteria** - Reduced migration ambiguity by classifying canonical, support, and compatibility surfaces (completed 2026-04-18)
- [x] **Phase 55: Audit And Normalize Product-Truth Labels, Comments, And Preview Semantics** - Aligned shipped runtime behavior and operator-facing language across UI, docs, and comments (completed 2026-04-18)
- [x] **Phase 56: Anchor Release Verification To One End-To-End Operator Journey** - Centered release evidence on one real daily-driver flow and the current extension-shell seam (completed 2026-04-18)

### Phase 54: Consolidate Canonical DB Workbench Surfaces And Legacy Retirement Criteria
**Goal**: Turn the current coexistence of primary and legacy DB paths into an explicit compatibility strategy with one canonical operator route and clear retirement criteria
**Requirements**: CONV-01, CONV-02, CONV-03
**Depends on**: Phase 48 and Phase 53
**Success Criteria** (what must be TRUE):
  1. Every reachable DB workbench entry point is classified as canonical, compatibility-only, or retirement-targeted, with no ambiguous "maybe primary" surface left in shell navigation or extension handoff flows
  2. Operators can complete the main daily path through one canonical workbench route while any still-needed legacy surface declares its narrower purpose and limitations explicitly
  3. Remaining legacy surfaces have explicit removal criteria, regression checks, and parity proof so future retirement work is gated by truth instead of intuition
**Plans**: 1/1 plans complete

Plans:
- [x] 54-01 Canonical surface inventory, compatibility labeling, and retirement handoff

### Phase 55: Audit And Normalize Product-Truth Labels, Comments, And Preview Semantics
**Goal**: Make UI copy, runtime status labels, comments, and agent-facing guidance reflect what is actually shipped so the product does not undersell or misdescribe live DB workflows
**Requirements**: TRUTH-01, TRUTH-02, TRUTH-03
**Depends on**: Phase 54
**Success Criteria** (what must be TRUE):
  1. Operator-facing labels, badges, empty states, warnings, and secondary copy distinguish supported workflows, compatibility-only paths, and true preview surfaces consistently across the workbench
  2. Comments, docs, and agent guidance that influence future implementation no longer describe reachable runtime flows as merely planned, preview-only, or migration-era scaffolding when the behavior is already live
  3. Review or regression checks exist for high-signal product-truth language so stale preview wording is less likely to re-enter core DB workbench surfaces
**Plans**: 1/1 plans complete

Plans:
- [x] 55-01 Product-truth copy, preview-semantics normalization, and wording regression guardrails

### Phase 56: Anchor Release Verification To One End-To-End Operator Journey
**Goal**: Keep release confidence tied to one packaged daily-driver workflow so ship-gate evidence reflects the real operator journey instead of disconnected feature slices
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03
**Depends on**: Phase 32 and Phase 55
**Success Criteria** (what must be TRUE):
  1. One reproducible packaged-desktop journey such as connect -> inspect -> query -> edit/apply -> audit is defined per supported driver and exercised with evidence against the current release candidate
  2. Release gates fail when this journey regresses at any critical step, even if isolated unit or feature tests still pass
  3. Evidence artifacts tie the tested installer build, environment assumptions, blocker classification, and final go/no-go decision back to the same operator journey
**Plans**: 1/1 plans complete

Plans:
- [x] 56-01 Canonical operator-journey contract, extension-shell preflight seam, and journey-first gate coverage

**Capability blocks:**
- Canonical surface convergence and legacy retirement: `Phase 54`
- Product-truth language and preview-semantics cleanup: `Phase 55`
- Journey-first release verification cohesion: `Phase 56`

---

## Progress (v1.8 Active Milestone)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Release Safety Foundations | 1/1 | Complete | 2026-04-11 |
| 24. Canonical Workbench Flow | 2/2 | Complete | 2026-04-12 |
| 25. Deep Inspection Coverage | 1/1 | Complete | 2026-04-12 |
| 26. Release Candidate Verification | 2/2 | Blocked on live evidence | - |
| 27. Job Center And Execution History | 2/2 | Complete | 2026-04-12 |
| 28. Advanced Data Editing And Review Workflows | 2/2 | Complete | 2026-04-18 |
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

*Last updated: 2026-05-10 after adding Phase 32 prereq-probe follow-up for live release-evidence handoff*
