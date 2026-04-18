---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Release-Grade DB Workbench
status: in_progress
stopped_at: Phase 48 completed; all extension-platform phases are done and lifecycle review is next
last_updated: "2026-04-18T19:35:00+08:00"
progress:
  total_phases: 26
  completed_phases: 13
  total_plans: 39
  completed_plans: 28
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-17)

**Core value:** Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.
**Current focus:** Extension-platform phases complete — lifecycle review pending

## Current Position

Phase: Extension-platform phases complete
Plan: Audit / complete / cleanup decision pending

## Performance Metrics

**Velocity:**

- Total plans completed: 22
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
| 28 | 1 | In progress | not tracked |
| 29-30, 33-42 | 0 | Planned for v1.9 | - |
| 31 | 1 | Complete | not tracked |
| 32 | 1 | Implemented, release exit blocked | - |
| 43 | 2 | Complete | not tracked |
| 44 | 3 | Complete | not tracked |
| 45 | 3 | Complete | not tracked |
| 46 | 3 | Complete | not tracked |
| 47 | 3 | Complete | not tracked |
| 48 | 3 | Complete | not tracked |

**Recent Trend:**

- Last completed plan: 48-03
- Trend: host leakage cleanup is now done; the remaining question is whether lifecycle closure should target the same milestone metadata or stop for manual milestone alignment

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
- Planning cleanup: v1.8 narrowed to release-grade scope; phases 29-30 and 33-42 moved into planned v1.9, while phases 43-48 remain planned for v2.0
- Phase 31 completed: DB Workbench Runtime And Sync Hardening
- Phase 32 implemented: release-exit checklist and checklist-first ship gate now exist, but the current gate is blocked by live driver evidence
- Phase 43 completed: canonical extension shell contributions and frontend resolver normalization now exist for the future installable extension host
- Phase 44 completed: visible extension shell chrome, DB connector adoption, and regression guards now exist ahead of runtime bundle loading work
- Phase 45 completed: runtime UI bundle declaration, backend validation, asset-protocol loading, and iframe shell fallbacks now exist for future external extension packages
- Phase 46 completed: db-connector now builds as a separate installable extension package, the shell no longer hardcodes it as builtin, and runtime UI now talks to host APIs through explicit messaging
- Phase 47 completed: the reachable extension center now installs and manages official tools, lifecycle persistence no longer strands disabled-state residue, and the dashboard recovers cleanly when active extensions disappear
- Phase 48 completed: host route state no longer leaks panel ids, DDL import now hands users to the DB tool boundary explicitly, and boundary docs now match the canonical shell contract

### Pending Todos

None yet.

### Blockers/Concerns

- Extension-platform implementation is complete. Remaining concern: the autonomous lifecycle step still points at milestone metadata that remains centered on the separate v1.8 release track.

## Session Continuity

Last session: 2026-04-18 19:35 SGT
Stopped at: Phase 48 completed with host leakage cleanup, DB-tool handoff cleanup, and final extension-platform regression evidence
Resume file: .planning/phases/48-migrate-non-core-db-surfaces-behind-extension-boundaries-and-retire-host-leakage/48-VERIFICATION.md

---
*Last updated: 2026-04-18 after completing Phase 48 and preparing for lifecycle review*
