# DB Schema DDL

## What This Is

DB Schema DDL is a desktop-first schema workbench built around two connected loops: Excel-based schema authoring and live database operations. It ships Excel parsing, DDL generation/import, schema comparison, and a DB Workbench for MySQL/PostgreSQL. Milestones `v1.5` and `v1.6` established the runtime trust baseline; `v1.7` proved part of the operator-continuity direction, but also exposed that the remaining blocker is no longer feature breadth. The next milestone shifts the product from "capable prototype" to "publishable DB tool".

## Core Value

Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.

## Current State

- ✅ Milestone `v1.5` (应用级 DB 工作台) shipped on `2026-04-08`
- ✅ Milestone `v1.6` (Reliability & Validation Hardening) shipped on `2026-04-11`
- ✅ Phase 19 in `v1.7` closed trusted execution continuity gaps around supported non-pageable statements and recent-query continuity
- ✅ Query/runtime/export/schema behavior now has a substantially stronger trust baseline than the original workbench prototype
- ⚠️ DB Workbench is still not release-grade because credential storage, workflow coherence, inspection depth, and live verification standards are not yet at publishable quality
- ⚠️ Remaining `v1.7` productivity work is deferred until release blockers are closed

## Current Milestone: v1.8 Release-Grade DB Workbench

**Goal:** Turn DB Workbench from a capable internal-style operator surface into a publishable daily-use product by closing release blockers in credential safety, runtime semantics, workflow coherence, inspection depth, and ship validation.

**Target features:**
- Secure local credential handling with a migration path away from plaintext storage
- Release-safe runtime guardrails so readonly, destructive-action, export, edit, and cancel semantics stay aligned with what the UI promises
- One canonical workbench workflow instead of split primary-vs-legacy operator paths
- Deeper object inspection and object-definition coverage for real daily database operations
- Reproducible MySQL/PostgreSQL release verification and explicit ship gates for desktop delivery

## Requirements

### Validated

- ✓ Users can upload Excel definition files, parse workbook table definitions, and generate MySQL/Oracle DDL
- ✓ Users can import DDL back into workbook templates and reverse-import schema assets
- ✓ Users can connect to MySQL/PostgreSQL, introspect schema, compare DB state, run SQL, browse results, and inspect execution plans inside the app
- ✓ Users can ship and run the desktop app reliably enough for packaged and runtime smoke testing
- ✓ Runtime paging/cancel/export flows are trustworthy on real databases (`v1.5`)
- ✓ DB operations now flow through one primary workbench surface with per-connection state isolation (`v1.5`)
- ✓ Object explorer/autocomplete behavior is schema-aware for daily operator usage (`v1.5`)
- ✓ Safe single-table editing loop is complete with SQL preview and transactional commit/rollback (`v1.5`)
- ✓ Live DB-to-DB compare/sync is first-class with snapshot guards and execution auditability (`v1.5`)
- ✓ Supported non-pageable statements now execute visibly without pretending paging exists, and recent-query continuity survives restart (`v1.7` Phase 19)

### Active

- [ ] Credentials must be stored and migrated in a release-safe way instead of relying on plaintext local storage
- [ ] Workbench runtime semantics must remain consistent across execute/export/edit/cancel/readonly paths
- [ ] Operators must have one canonical product workflow rather than split modern-vs-legacy entry paths
- [ ] Object inspection depth must cover the daily database surfaces expected from a publishable tool
- [ ] Release readiness must be backed by live verification evidence, not only source-level tests

### Future Requirements

- Connection-scoped script library, favorites, and quick-launch surfaces from `v1.7`
- Richer data-browse presets and repeat-inspection accelerators from `v1.7`
- Broader personalization and operator-memory niceties after publishability blockers are closed

### Out of Scope

- Full parity with every Navicat feature in a single milestone
- Expansion beyond MySQL/PostgreSQL to Oracle/SQL Server/SSH-tunnel/team features before the core product is publishable
- Visual schema authoring or drag-to-design ER editing while release blockers remain open
- Productivity niceties that do not materially improve product readiness

## Context

- `v1.0` through `v1.4` established the current desktop shell, DB connectivity, schema introspection, compare/apply flows, and the first usable DB Workbench surface
- `v1.5` closed the replacement-grade DB Workbench gap across runtime semantics, navigation workflow, edit safety, and compare/sync safeguards
- `v1.6` closed runtime resilience evidence debt and archived Nyquist validation gaps for the `v1.5` phases
- `v1.7` started as an operator-productivity milestone, but Phase 19 completion and the subsequent review made the deeper problem explicit: publishability blockers now matter more than new convenience surfaces
- Legacy routes still exist for compatibility, but the product goal now requires one canonical operator path
- Milestone archives currently track shipped `v1.5` and `v1.6` under `.planning/milestones/`

## Constraints

- **Architecture**: Keep internal extension ID `db-connector`; improve the product in place rather than creating a second DB extension
- **Compatibility**: Preserve existing `v1.0` to `v1.7` user-facing flows while converging on one publishable primary DB workflow
- **Safety**: Readonly, production, destructive-action, export, and edit protections must be enforced in Rust command paths, not trusted to frontend-only checks
- **Security**: No release claim is valid while saved DB credentials still depend on plaintext storage
- **Performance**: No runtime path may require full result prefetch before first paint for large query browsing scenarios
- **Capability accuracy**: Planning claims must track actual reachable code paths, not design-doc intent

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat `v1.8` as a release-blocker milestone instead of continuing `v1.7` productivity breadth | The current gap is publishability and trust, not missing shortcuts | Accepted |
| Defer unfinished `v1.7` productivity items into future scope | Script libraries and favorites do not solve plaintext secrets, split workflows, or shallow inspection coverage | Accepted |
| Make credential safety a first-order milestone requirement | A database tool cannot be considered publishable while local DB passwords remain plaintext by default | Accepted |
| Require one canonical workbench route before calling the product ready | Split legacy/new entry points keep the user experience in prototype territory | Accepted |
| Put live MySQL/PostgreSQL ship verification into milestone scope | Static tests are not enough evidence for a release-grade DB operator tool | Accepted |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-11 after opening v1.8 Release-Grade DB Workbench*
