# Phase 3: Reverse Import Expansion - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase expands reverse import inputs beyond the current MySQL-first pasted single-DDL flow while preserving the same canonical review and workbook-export trust model already shipped in `v1.1`.

It covers:

- importing multi-statement SQL files and SQL bundles
- importing a documented first-cut Oracle DDL subset
- converging all new reverse-import inputs into the same canonical review and workbook-export flow
- preserving explicit unsupported / lossy reporting across all new entry modes

It does **not** cover:

- Oracle full-parity parsing
- live DB compare or live DB export changes
- arbitrary SQL execution or migration-runner semantics
- view / trigger / procedure / function reverse import
- DB-to-DB sync or apply

</domain>

<decisions>
## Implementation Decisions

### Input Entry and Workspace Placement
- Reverse-import expansion stays inside the existing `DDL import` workflow.
- Do **not** create a separate module or second review UI.
- The current [DdlImportWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/ddl-import/DdlImportWorkspace.tsx) becomes the home for all supported reverse-import source modes.
- The left-hand input area should expand to support:
  - `粘贴 SQL`
  - `上传单个 .sql / .ddl`
  - `上传 SQL bundle`

### SQL Bundle Scope
- Phase 3 should support multi-statement SQL bundles whose primary purpose is structural reverse import.
- Supported bundle content should center on:
  - `CREATE TABLE`
  - `PRIMARY KEY`
  - `UNIQUE`
  - `INDEX`
  - `FOREIGN KEY`
  - table / column comment statements where the parser can map them cleanly
- The workflow must stay explicit about unsupported bundle content.
- These are out of scope for the first bundle cut and should surface as unsupported or lossy:
  - `ALTER TABLE`
  - `INSERT`, `UPDATE`, `DELETE`
  - `DROP`
  - `VIEW`
  - `TRIGGER`
  - `PROCEDURE` / `FUNCTION`
  - privilege / grant statements
  - mixed migration-runner syntax that does not map cleanly to schema structure

### Oracle Support Strategy
- Oracle support in this phase must remain a **documented first-cut subset**, not full parity.
- The goal is to route supported Oracle table definitions through the same canonical review and workbook-export flow already used by MySQL import.
- The supported Oracle subset should focus on:
  - `CREATE TABLE`
  - column definitions
  - `NUMBER`, `VARCHAR2`, `CHAR`, `DATE`, `TIMESTAMP`, `CLOB`
  - `NULL` / `NOT NULL`
  - `DEFAULT`
  - `PRIMARY KEY`
  - `UNIQUE`
  - `FOREIGN KEY`
  - `COMMENT ON TABLE`
  - `COMMENT ON COLUMN`
- The following remain unsupported or explicitly lossy in the first Oracle cut:
  - complex `IDENTITY` variants
  - function-based indexes
  - virtual columns
  - tablespace / storage / segment attributes
  - partitioning
  - trigger / sequence reconstruction
  - package / procedure / view objects

### Review and Export Flow
- All new reverse-import inputs must converge on the existing three-column review workspace.
- Do **not** create separate Oracle-only or bundle-only review screens.
- The workflow remains:
  - left: source mode and input
  - middle: canonical review
  - right: issues, lossy/unsupported review, template choice, export
- New input modes may adapt the left-panel affordances, but the review/export structure remains shared.

### Canonical Artifact and AI/MCP Compatibility
- This phase must not create source-specific temporary trees that only the UI understands.
- Every supported source mode must normalize into one stable canonical import artifact.
- That artifact should carry:
  - source mode
  - dialect guess and/or confirmed dialect
  - statement-level issues
  - object-level stable ids
  - lossy / unsupported breakdown
- Downstream export, report, and future MCP behaviors should read from this same artifact rather than reparsing UI-local state.

### Trust Reporting
- Unsupported or lossy constructs must remain explicit across every new source mode.
- Truly inexpressible constructs should block export.
- Reviewable but lossy constructs may continue only with explicit confirmation, consistent with the current trust model.
- No new source mode may silently discard structure just because it came from a SQL bundle or Oracle DDL.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [client/src/components/ddl-import/DdlImportWorkspace.tsx](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/ddl-import/DdlImportWorkspace.tsx)
  Already provides the three-column reverse-authoring workspace that should remain the shared review surface.
- [server/routes/ddl-routes.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/routes/ddl-routes.ts)
  Already hosts the DDL import/export HTTP flow and is the natural place to extend source modes.
- [server/lib/ddl-import/export-service.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/ddl-import/export-service.ts)
  Already converts reviewed canonical catalogs into official workbook templates and enforces parser-backed round-trip validation.
- [server/lib/workbook-templates.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/server/lib/workbook-templates.ts)
  Already defines the two official template families and trust helpers.
- [shared/schema.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/schema.ts)
  Already carries DDL import/export contracts and DB canonical schemas; new reverse-import modes should extend, not fork, these contracts.
- [shared/routes.ts](C:/Users/ISI202502/Downloads/Db-Schema-Ddl/shared/routes.ts)
  Already exposes typed seams for current DDL import/export and should continue to be the single API contract source.

### Established Patterns
- Complex schema workflows live in dedicated workspaces but share stable backend artifacts.
- Workbook creation is never trusted until parser-backed round-trip succeeds.
- Lossy / blocking issue handling is explicit and machine-readable.
- Dialect expansion is intentionally phased; Oracle support should arrive as a documented subset first.

### Integration Points
- Extend the existing DDL import route family rather than introducing a parallel route namespace.
- Extend the existing DDL import workspace source picker rather than adding a new module.
- Reuse the official workbook export pipeline and file activation path after review.
- Preserve the current remembered-template behavior across new source modes where appropriate.

</code_context>

<specifics>
## Specific Defaults Chosen

- Keep Phase 3 inside the existing DDL import workspace.
- Treat SQL bundles as structure-oriented bundle import, not arbitrary SQL support.
- Introduce Oracle only as a documented first-cut subset.
- Normalize every new source mode into one shared canonical artifact.
- Preserve current blocker / confirm / info semantics instead of inventing a new severity model.

</specifics>

<deferred>
## Deferred Ideas

- Full Oracle parity
- `ALTER TABLE` reverse import
- migration-runner semantic reconstruction
- view / trigger / routine reverse import
- direct `live DB -> reverse-import review` shortcuts outside the existing export workflow

</deferred>

---

*Phase: 03-reverse-import-expansion-v1_2*
*Context gathered: 2026-03-18*
