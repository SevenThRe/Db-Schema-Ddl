---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Release-Grade DB Workbench
status: in_progress
stopped_at: Phase 32-04 completed; v1.8 is still blocked on external live DB evidence, and prereq-probe failures now stop unattended workflows earlier without blocking advisory warnings
last_updated: "2026-05-10T21:18:00+08:00"
progress:
  total_phases: 34
  completed_phases: 20
  total_plans: 42
  completed_plans: 32
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-18)

**Core value:** Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.
**Current focus:** v1.8 release evidence is still the publishability blocker; the latest local improvements are the prereq probe, clearer handoff, strict helper-artifact exclusion, and unattended-friendly prereq exit semantics

## Current Position

Phase: v1.8 release-evidence closure with v2.2 defect-closure follow-up complete
Plan: Capture MySQL/PostgreSQL live verification for v1.8, using the prereq probe for early failure detection while keeping ship-gate evidence discovery fail-closed and automation-friendly

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Average duration: not tracked yet
- Total execution time: not tracked yet

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 19 | 1 | Complete | not tracked |
| 23 | 1 | Complete | not tracked |
| 24 | 2 | Complete | not tracked |
| 25 | 1 | Complete | not tracked |
| 26 | 2 | Implemented, evidence blocked | not tracked |
| 27 | 2 | Complete | not tracked |
| 28 | 2 | Complete | not tracked |
| 29-30, 33-42 | 0 | Planned for v1.9 | - |
| 31 | 1 | Complete | not tracked |
| 32 | 4 | Implemented, release exit blocked | - |
| 43 | 2 | Complete | not tracked |
| 44 | 3 | Complete | not tracked |
| 45 | 3 | Complete | not tracked |
| 46 | 3 | Complete | not tracked |
| 47 | 3 | Complete | not tracked |
| 48 | 3 | Complete | not tracked |
| 49 | 1 | Complete | not tracked |
| 50 | 1 | Complete | not tracked |
| 51 | 1 | Complete | not tracked |
| 52 | 1 | Complete | not tracked |
| 53 | 1 | Complete | not tracked |
| 54-56 | 3 | Complete | not tracked |

**Recent Trend:**

- Last completed plan: 32-04
- Trend: the release blocker is still live DB evidence, but the maintainer path is now lower-friction, more fail-closed, and better suited for unattended runs through prereq probing, helper-artifact exclusion, and explicit exit semantics

## Accumulated Context

### Decisions

- `v1.8` starts at Phase 23 so the existing historical sequence remains intact after the `v1.7` refocus
- Product-readiness blockers outrank unfinished productivity surfaces from `v1.7`
- Saved DB credential handling is now a release blocker, not a later hardening task
- One canonical workbench route is required before calling the DB Workbench publishable
- Deep inspection coverage is part of the release baseline, not an optional follow-up enhancement
- Live MySQL/PostgreSQL verification must exist as release evidence, not only static source-level checks
- Job history belongs inside the canonical workbench instead of transient notification state
- Phase 31 should land as scoped sync compare-contract hardening instead of a broader runtime rewrite
- The release-exit checklist artifact is now the canonical ship-gate input; packaged smoke anchors the current installer candidate and Phase 31 verification serves as the late hardening proof
- Phase 43 made `activityBar`, `sidebarViews`, and `workbenchViews` the canonical extension-shell contract while preserving legacy manifest compatibility
- Extension routing now carries activity and workbench identity explicitly, with `panelId` retained only as a migration fallback
- Phase 44 moved extension navigation out of the core file sidebar and into dedicated activity/secondary sidebar shell chrome
- `db-connector` now contributes explicit shell ids and can run in host-managed sidebar mode without duplicating internal left chrome
- External extensions can now declare `uiBundle` and `runtimeViewId`, while builtin surfaces still resolve through local registries
- The shell now mounts external runtime UI through Tauri asset protocol plus a sandboxed iframe, with explicit `ready/missing/invalid/incompatible` bundle states
- Phase 46 made `db-connector` a UI-only installable package path, added iframe host RPC, and removed host-bundled DB workbench registration from the main build
- Phase 49 establishes a shared SQL semantic-context module so completion and hover can evolve from the same statement-analysis contract
- Phase 50 builds on that semantic context with driver-aware SQL catalogs, ON-clause FK guidance, and semantic diagnostics before execution
- Phase 51 makes SQL memory explicit and operator-visible: accepted completions, grounded query patterns, and safe value-shape summaries now drive adaptive ranking with inspect and clear controls
- Phase 52 keeps the local SQL copilot strictly offline-first, with explicit provider state, grounded prompt packaging, and advisory probe output instead of implicit generated-SQL claims
- The remaining workbench coherence defects should be queued as explicit follow-up phases, not silently folded back into the current `v1.8` publishability bar

### Roadmap Evolution

- Phase 27 completed: Job Center And Execution History
- Phase 28 added: Advanced Data Editing And Review Workflows
- Phase 29 added: SQL Productivity And Script Operations
- Phase 30 added: Professional Connection Governance
- Phase 31 added: DB Workbench Runtime And Sync Hardening
- Phase 32 added: Close live release verification and ship-gate evidence
- Phase 33 added: Persist edit drafts and recovery across reruns and restart
- Phase 34 added: Promote data sync from preview to release-grade operator workflow
- Phase 35 added: Build a first-class SQL asset catalog and organization model
- Phase 36 added: Add operational SQL automation runbooks and repeat execution surfaces
- Phase 37 added: Scale connection governance for large saved-connection catalogs
- Phase 38 added: Add secure SSH and TLS transport connectivity for supported drivers
- Phase 39 added: Add enterprise authentication and external secret posture for DB connections
- Phase 40 added: Ship ER diagram relation canvas and graph navigation
- Phase 41 added: Build visual schema change designer with DDL preview
- Phase 42 added: Build visual schema authoring and migration workspace
- Phase 43 added: Define extension shell and contribution model for activity bar, sidebar views, and workbench surfaces
- Phase 44 added: Build VS Code-style extension activity bar and secondary sidebar host
- Phase 45 added: Support installable frontend extension bundles and runtime UI mounting
- Phase 46 added: Extract DB Workbench into an on-demand installable extension package
- Phase 47 added: Build extension install, activation, and persisted enablement flow
- Phase 48 added: Migrate non-core DB surfaces behind extension boundaries and retire host leakage
- Phase 49 added: Build AST-backed SQL context engine and scope resolution
- Phase 50 added: Add FK-aware SQL semantics, join completion, and semantic diagnostics
- Phase 51 added: Build query memory, schema/value grounding, and adaptive SQL ranking
- Phase 52 added: Add local model runtime and offline SQL copilot infrastructure
- Phase 53 added: Ship natural-language-to-SQL and generated SQL completion with safety gates
- Phase 54 added: Consolidate canonical DB workbench surfaces and legacy retirement criteria
- Phase 55 added: Audit and normalize product-truth labels, comments, and preview semantics
- Phase 56 added: Anchor release verification to one end-to-end operator journey
- Planning cleanup: v1.8 narrowed to release-grade scope; phases 29-30 and 33-42 moved into planned v1.9, while phases 43-48 remain planned for v2.0
- Planning cleanup: v2.1 now tracks SQL intelligence and local AI assistance in phases 49-53
- Planning cleanup: v2.2 now tracks post-release workbench convergence, product-truth cleanup, and journey-first verification cohesion in phases 54-56
- Phase 31 completed: DB Workbench Runtime And Sync Hardening
- Phase 32 implemented: release-exit checklist and checklist-first ship gate now exist, but the current gate is blocked by live driver evidence
- Phase 32 follow-up completed: a prereq-only live-verification probe now checks bootstrap parseability and TCP reachability before a full Tauri live run
- Phase 32 follow-up completed: prereq-only helper artifacts are now explicitly excluded from release ship-gate live-evidence discovery by regression test coverage
- Phase 32 follow-up completed: prereq-only failure states now produce a non-zero exit path suitable for unattended verification workflows
- Phase 43 completed: canonical extension shell contributions and frontend resolver normalization now exist for the future installable extension host
- Phase 44 completed: visible extension shell chrome, DB connector adoption, and regression guards now exist ahead of runtime bundle loading work
- Phase 45 completed: runtime UI bundle declaration, backend validation, asset-protocol loading, and iframe shell fallbacks now exist for future external extension packages
- Phase 46 completed: db-connector now builds as a separate installable extension package, the shell no longer hardcodes it as builtin, and runtime UI now talks to host APIs through explicit messaging
- Phase 47 completed: the reachable extension center now installs and manages official tools, lifecycle persistence no longer strands disabled-state residue, and the dashboard recovers cleanly when active extensions disappear
- Phase 48 completed: host route state no longer leaks panel ids, DDL import now hands users to the DB tool boundary explicitly, and boundary docs now match the canonical shell contract
- Phase 49 completed: the workbench editor now has a shared semantic context engine, Monaco hover consumes it, and direct semantic regression tests cover common DML plus `WITH`
- Phase 50 completed: the editor now exposes driver-aware SQL catalogs, ON-clause FK join suggestions, and semantic diagnostics for high-signal mistakes before execution
- Phase 51 completed: SQL memory, safe value grounding, adaptive completion ranking, and operator memory controls now exist as a reachable workbench capability
- Phase 52 completed: the workbench now exposes a local SQL-copilot runtime dialog, grounded prompt packaging, and Tauri-backed offline runtime discovery and probe execution
- Phase 53 completed: the workbench now supports generated SQL drafts with visible assumptions, acceptance into the editor, safety-gated execution reuse, and evaluation artifacts
- Phase 54 completed: the DB shell now classifies canonical, support, and compatibility routes explicitly, and retained surfaces are tied to written retirement criteria
- Phase 55 completed: shipped, compatibility-only, and preview-grade wording now align across current workbench code, high-signal docs, and regression tests
- Phase 56 completed: release verification now anchors to one extension-shell-aware operator journey, and desktop preflight guards the modern DB entry seam
- Phase 28 completed: advanced grid-edit flow now covers mixed insert/update/delete review and runtime insert planning for the scoped release-grade editing goal

### Pending Todos

None yet.

### Blockers/Concerns

- The remaining blocker for closing v1.8 is external live DB evidence, not additional local feature implementation.
- Nyquist validation artifacts are still missing for v1.8 milestone phases.

## Session Continuity

Last session: 2026-05-10 21:18 SGT
Stopped at: Phase 32-04 completed with automation-friendly prereq exit semantics
Resume file: .planning/phases/32-close-live-release-verification-and-ship-gate-evidence/32-VERIFICATION.md

---
*Last updated: 2026-05-10 after adding a Phase 32 prereq-probe follow-up while v1.8 remains blocked on external live DB evidence*
