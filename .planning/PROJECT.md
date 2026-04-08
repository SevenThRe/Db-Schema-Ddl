# DB Schema DDL

## What This Is

DB Schema DDL is a desktop-first schema workbench built around two connected loops: Excel-based schema authoring and live database operations. It ships Excel parsing, DDL generation/import, schema comparison, and an operator-grade DB Workbench for MySQL/PostgreSQL. Milestone `v1.5` is now shipped and established the app-grade DB daily workflow baseline.

## Core Value

Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.

## Current State

- ✅ Milestone `v1.5` (应用级 DB 工作台) shipped on `2026-04-08`
- ✅ Query/runtime/export/schema behavior hardened for large real-database workloads
- ✅ One primary DB Workbench workflow with per-connection workspace persistence
- ✅ Safe row editing with preview/confirm/transaction rollback guarantees
- ✅ Live compare/sync path promoted to first-class flow with stale-target and production safety guards

## Next Milestone Goals

- Define `v1.6` scope and requirements with `$gsd-new-milestone`
- Expand operator productivity surfaces built on the v1.5 runtime/session baseline
- Continue reducing residual integration risk with more live-environment validation coverage

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

### Active

- [ ] Define and ship v1.6 milestone roadmap and requirements
- [ ] Expand live-environment reliability coverage (bigger datasets, unstable network, long-running operations)
- [ ] Continue DB Workbench operator UX hardening without regressing Excel authoring/import workflows

### Out of Scope

- Full parity with every Navicat feature in a single milestone — daily high-frequency workflows come first
- Expansion beyond MySQL/PostgreSQL to Oracle/SQL Server/SSH-tunnel/team features — widen support after the core workbench is credible
- Visual schema authoring or drag-to-design ER editing — operational workflows and data safety take priority

## Context

- `v1.0` through `v1.4` established the current desktop shell, DB connectivity, schema introspection, compare/apply flows, and the first usable DB Workbench surface
- `v1.5` closed the replacement-grade DB Workbench gap across runtime semantics, navigation workflow, edit safety, and compare/sync safeguards
- Legacy routes still exist for compatibility, but the primary operator path is now the workbench shell
- Milestone archives now track v1.5 details under `.planning/milestones/`
- Next focus moves from baseline productization to targeted expansion and reliability depth

## Constraints

- **Architecture**: Keep internal extension ID `db-connector`; improve the product in place rather than creating a second DB extension
- **Compatibility**: Preserve existing `v1.0` to `v1.4` user-facing flows while consolidating the primary DB workflow
- **Safety**: Readonly, production, and destructive-action protections must be enforced in Rust command paths, not trusted to frontend-only checks
- **Performance**: No runtime path may require full result prefetch before first paint for large query browsing scenarios
- **Capability accuracy**: Planning claims must track actual reachable code paths, not design-doc intent

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat `v1.5` as productization, not feature sprawl | The blocker is trust and daily usability, not lack of surfaces | Accepted |
| Prioritize query/runtime hardening before ER or cosmetic expansion | Replacement-grade DB tools live or die on large-query behavior and workflow continuity | Accepted |
| Make per-connection sessions and multi-schema support milestone requirements | Global tab state and `public`-only assumptions break real operator usage quickly | Accepted |
| Sequence safe row editing before live DB sync apply | Sync depends on trustworthy key mapping, SQL preview, and transaction semantics | Accepted |
| Keep legacy paths while elevating one primary route | Compatibility preservation while converging operator workflow | Accepted |

---
*Last updated: 2026-04-08 after completing v1.5 milestone closeout*
