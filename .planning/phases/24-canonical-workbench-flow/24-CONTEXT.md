# Phase 24: Canonical Workbench Flow - Context

**Gathered:** 2026-04-12
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Converge the DB product onto one coherent operator workflow so daily database work no longer depends on bouncing between prototype-era shell surfaces.

This phase delivers:
- one canonical DB route centered on the unified `Database Workspace`
- stable operator context while moving across connection, schema, results, explain, diff, sync, and inspection work
- explicit restore and recovery behavior when reopening the app or when the previously active connection is no longer available

Out of scope in this phase:
- expanding explorer object coverage beyond the already shipped table/view/index/foreign-key/routine/trigger/sequence work (Phase 25)
- adding new productivity capabilities such as snippet libraries, job center, or bulk editing workflows (later phases)
- removing the file-oriented Excel `SchemaDiffPanel`, which remains a separate workbook workflow rather than part of the DB operator route

</domain>

<decisions>
## Implementation Decisions

### Canonical Route Boundary
- `Database Workspace` is the only first-class DB operator route inside `DbConnectorWorkspace`.
- `Connection Center` remains reachable, but as a management surface for choosing or editing connections rather than as a parallel product mode.
- Legacy DB-only `Schema` and `Diff` surfaces stop appearing as peer navigation beside the canonical workspace; if kept for migration, they must move behind an explicit secondary affordance such as a legacy tools drawer/section.

### Stable Operator Context
- Active connection identity, driver, database, environment, readonly posture, and active schema remain visible in one stable shell position while the operator changes panes or tabs.
- Schema diff, sync, explain, results, and object inspection are treated as modes inside the same workbench shell, not separate workspaces with their own connection truth.
- Opening connection management must not silently discard the current workbench session state.

### View Switch Semantics
- Switching among results, explain, schema diff, sync, and inspection must preserve the operator's in-flight context unless a reset is explicit.
- Per-connection workspace state must remember more than SQL tabs: the last active pane, selected table, inspection target, and relevant compare/sync target connection ids should restore when reopening that same connection.
- Connection switches may rebase driver-specific data, but they must do so with explicit reset semantics rather than hidden loss.

### Restore And Recovery
- The app remembers the last active DB connection and re-enters the canonical workbench route on reopen when that connection still exists.
- If the remembered connection no longer exists, the app falls back to `Connection Center` with an explicit recovery notice instead of silently dropping context.
- If the remembered connection exists but runtime introspection/query bootstrap fails, the shell still restores the intended workspace and shows the failure in-place so the operator understands what was being recovered.

### the agent's Discretion
- Small shell refactors inside `DbConnectorWorkspace`, `WorkbenchLayout`, and session helpers are allowed if they reduce duplicated route state and make restoration behavior more truthful.
- Targeted UI copy changes are allowed when they make legacy-vs-primary boundaries clearer without introducing new workflows.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement anchors
- `.planning/ROADMAP.md` — Phase 24 goal, success criteria, and v1.8 constraints
- `.planning/PROJECT.md` — publishability goal and one-canonical-workbench decision
- `.planning/REQUIREMENTS.md` — `FLOW-01` through `FLOW-04` requirement contract
- `.planning/STATE.md` — current milestone position and known blockers
- `.planning/phases/23-release-safety-foundations/23-CONTEXT.md` — prior safety decisions that Phase 24 must carry forward

### Product and repo operating rules
- `AGENTS.md` — source-of-truth order, DB Workbench boundary rules, and contract update discipline

### Runtime truth surfaces
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — current shell still exposes canonical vs legacy view state and is the main convergence point
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` — canonical workbench shell, pane switching, and per-connection state restoration
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx` — visible connection/schema/environment cues inside the canonical shell
- `client/src/components/extensions/db-workbench/workbench-session.ts` — per-connection persisted session state
- `src-tauri/src/builtin_extensions/mod.rs` — builtin DB workspace and standalone schema-diff panel contributions
- `client/src/extensions/builtin/register-all.tsx` — frontend panel registration for DB and diff surfaces
- `client/src/pages/Dashboard.tsx` — top-level dedicated database surface behavior in the app shell

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - already contains unified panes for results, explain, schema diff, sync, and object inspection under one connection shell.
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
  - already shows connection metadata, schema chooser, explorer counts, and object tree state that can anchor stable operator context.
- `client/src/components/extensions/db-workbench/workbench-session.ts`
  - already persists tabs, recent SQL, snippets, and selected table by connection id and is the natural place to extend restore semantics.

### Current Workflow Gaps
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - still models `connections`, `schema`, `diff`, and `sql` as peer workspace modes, which keeps the prototype-era split visible.
- `client/src/components/extensions/db-workbench/workbench-session.ts`
  - does not persist the last active pane, inspection state, or compare/sync target ids, so reopening a connection loses part of the operator context.
- `DbConnectorWorkspace` clears invalid remembered connection state by silently falling back to `connections`, without an explicit recovery message.
- `src-tauri/src/builtin_extensions/mod.rs` and `client/src/extensions/builtin/register-all.tsx`
  - still keep a separate `SchemaDiffPanel` surface for Excel workflows, so Phase 24 must avoid conflating workbook diff with DB-route cleanup.

### Integration Points
- Shared restore and routing state:
  - `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - `client/src/components/extensions/db-workbench/workbench-session.ts`
- Canonical in-workbench context:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- App-shell exposure of the DB route:
  - `src-tauri/src/builtin_extensions/mod.rs`
  - `client/src/extensions/builtin/register-all.tsx`
  - `client/src/pages/Dashboard.tsx`

</code_context>

<specifics>
## Specific Ideas

- Replace top-level peer buttons for legacy DB `Schema` and `Diff` with a secondary `Legacy tools` affordance so the shell teaches one canonical route by default.
- Add a small persisted resume record for the DB shell so the app can restore the last active connection and show a clear recovery banner when the saved connection disappears.
- Extend per-connection workbench session persistence with:
  - last active pane
  - selected inspection object
  - schema diff target connection id
  - sync source/target connection ids
- Keep file-oriented Excel `SchemaDiffPanel` untouched in this phase; the cleanup applies to the DB workspace route only.

</specifics>

<deferred>
## Deferred Ideas

- A full standalone Job Center belongs to Phase 27.
- Rich SQL library and script-launch surfaces belong to Phase 29.
- Broader connection governance and large-scale catalog workflows belong to Phase 30.

</deferred>

---

*Phase: 24-canonical-workbench-flow*
*Context gathered: 2026-04-12*
