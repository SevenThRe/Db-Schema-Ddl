# DB Schema DDL

## What This Is

DB Schema DDL is a desktop-first schema workbench built around two connected loops: Excel-based schema authoring and live database operations. It already ships Excel parsing, DDL generation/import, schema comparison, and a DB Workbench for MySQL/PostgreSQL. In `v1.5`, the priority shifts from proving that DB Workbench features exist to making the workbench reliable enough to replace day-to-day Navicat-class workflows for core database work.

## Core Value

Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.

## Current Milestone: v1.5 应用级 DB 工作台

**Goal:** Turn the current DB Workbench shell into an app-grade daily database tool: one primary workflow, real result paging/export semantics, multi-schema awareness, safe data editing, and live DB-to-DB sync.

**Target features:**
- True server-side query runtime for large result sets, cancellation, and predictable export
- One primary DB Workbench path instead of split legacy vs workbench surfaces
- Per-connection workspace sessions, recent queries, and saved SQL snippets
- Multi-schema-aware object explorer and schema-scoped autocomplete
- Safe single-table grid editing with SQL preview and transactional commit
- Snapshot-guarded live DB compare and synchronization workflows

## Requirements

### Validated

- ✓ Users can upload Excel definition files, parse workbook table definitions, and generate MySQL/Oracle DDL
- ✓ Users can import DDL back into workbook templates and reverse-import schema assets
- ✓ Users can connect to MySQL/PostgreSQL, introspect schema, compare DB state, run SQL, browse results, and inspect execution plans inside the app
- ✓ Users can ship and run the desktop app reliably enough for packaged and runtime smoke testing

### Active

- [ ] Runtime & paging are trustworthy on real databases, not just small/demo result sets
- [ ] DB operations flow through one primary workbench surface with per-connection state isolation
- [ ] Object navigation and autocomplete are schema-aware enough for daily operator use
- [ ] Safe single-table data editing is complete and transactionally reliable
- [ ] Live DB-to-DB compare/sync becomes a first-class workflow with auditing and safety gates

### Out of Scope

- Full parity with every Navicat feature in a single milestone — daily high-frequency workflows come first
- Expansion beyond MySQL/PostgreSQL to Oracle/SQL Server/SSH-tunnel/team features — widen support after the core workbench is credible
- Visual schema authoring or drag-to-design ER editing — operational workflows and data safety take priority

## Context

- `v1.0` through `v1.4` established the current desktop shell, DB connectivity, schema introspection, compare/apply flows, and the first usable DB Workbench surface
- The current workbench already has Monaco SQL editing, result browsing, EXPLAIN visualization, and dangerous-SQL confirmation, but legacy routes still coexist with the newer workbench path
- The current query runtime still fetches full result sets before applying frontend limits, which blocks app-grade behavior on large datasets
- PostgreSQL introspection is still anchored to `public`, and workbench tab/session persistence is still global rather than connection-scoped
- Data sync has design and partial scaffolding, but it is not yet wired as a first-class operator workflow
- The user goal for this milestone is explicit: make DB Workbench credible as a replacement for Navicat-like tools, not a sidecar feature inside an Excel utility

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

---
*Last updated: 2026-04-07 after opening v1.5 应用级 DB 工作台*
