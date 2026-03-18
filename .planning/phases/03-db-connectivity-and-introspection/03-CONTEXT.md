# Phase 3: DB Connectivity and Introspection - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the DB-management extension's first live-database slice: connection management, protected credential handling, database selection, and canonical schema introspection for MySQL. It does not yet cover file-vs-DB diff presentation, SQL preview generation, schema deployment execution, or ER-style visualization from later phases.

</domain>

<decisions>
## Implementation Decisions

### Engine scope
- Phase 3 should target MySQL only.
- Oracle is explicitly deferred and must not become a blocker for the first connectivity slice.
- The extension should still leave room for later dialect expansion, but planning should optimize for a clean MySQL-first path.

### Connection-management surface
- DB connection creation, editing, testing, and selection should live inside the `DB 管理` module itself.
- This capability should not be pushed into the base app shell or treated as a host-level Settings-only concern.
- Settings can still surface extension status from earlier phases, but live DB workflows belong to the module workspace.

### Credential behavior
- The default experience should be "remember password and reconnect directly next time."
- Sensitive connection material must still be stored locally in protected form rather than as routine plain-text state.
- Routine UI should favor saved credentials and quick reconnect over repeated credential prompts.

### Database selection flow
- The user should be able to switch which MySQL `database` they are inspecting from inside the module.
- Phase 3 should not force the database choice to be permanently baked into the initial connection-creation step.
- The connection model and UI need to support reconnecting and then browsing or switching the target database within the module workflow.

### Introspection scope
- The user's final answer of `3` is interpreted here as choosing the more complete initial introspection slice for Phase 3.
- Planning should therefore assume canonical ingestion includes, at minimum: tables, columns, primary keys, foreign keys, indexes or unique constraints, and comments for the selected database.
- If plan-time feasibility review finds this interpretation too broad for Phase 3, the first fallback should be trimming implementation sequencing inside the phase rather than widening scope to later product surfaces.

### Claude's Discretion
- Exact form layout for saved-connection management inside `DB 管理`
- Exact wording for "remember password" and reconnect messaging
- Exact balance between connection-level metadata and per-database browsing UI
- Exact canonical type names and adapter layering, as long as later diff phases can reuse the output cleanly

</decisions>

<specifics>
## Specific Ideas

- The user is optimizing for a practical existing-DB workflow, not for a generic database-client experience.
- Fast reconnect matters more than minimal credential persistence prompts, as long as storage is still protected.
- The module should feel self-contained: connect, test, pick a database, inspect schema, all in one place.
- MySQL-first execution is preferred so the extension can become useful sooner without Oracle packaging or driver complexity slowing Phase 3 down.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/pages/Dashboard.tsx`: already exposes the `DB 管理` module entry and provides the host-side workspace where the extension can mount connection and introspection flows.
- `client/src/components/settings/ExtensionManagementSection.tsx`: already covers extension lifecycle management, which means Phase 3 can keep DB connection UX inside the module instead of overloading Settings.
- `server/storage.ts` and `shared/schema.ts`: already provide the shared persistence and schema-contract pattern that can be extended for saved connections, protected credential metadata, and introspection snapshots.
- `server/init-db.ts`, `server/constants/db-init.ts`, and `server/constants/db-migrations.ts`: already establish a local SQLite migration path suitable for extension-owned connection and snapshot tables.

### Established Patterns
- The app now has a clear host-versus-extension boundary: installation and lifecycle live in the host, while operational DB workflows should live in the extension module.
- Typed Zod-based shared contracts remain the expected path for adding connection, introspection, and snapshot APIs.
- Existing schema-diff work is file-oriented today, so Phase 3 needs a canonical live-schema model rather than ad hoc MySQL response objects.

### Integration Points
- The extension should add module-local UI for connection CRUD, connection testing, and current-database selection under the existing `DB 管理` workspace.
- The persistence layer should store connection metadata and encrypted credential material alongside the existing local SQLite state, with clear ownership boundaries for extension tables.
- Canonical introspection output should be shaped to feed future work in `server/lib/schema-diff.ts` and related diff UI rather than creating a second incompatible compare model.

</code_context>

<deferred>
## Deferred Ideas

- Multi-dialect support beyond MySQL
- File-vs-DB diff presentation and rename handling
- SQL preview, dry-run deploy, and apply-to-DB execution
- ER diagram visualization and deployment history dashboards

</deferred>

---

*Phase: 03-db-connectivity-and-introspection*
*Context gathered: 2026-03-17*
