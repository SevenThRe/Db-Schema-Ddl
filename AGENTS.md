# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Project Reality

This repository is no longer just an `Excel -> DDL` converter.

It is now a desktop-first schema workbench built with:

- Vite + React + TypeScript for the UI
- Tauri + Rust for desktop capabilities and DB access
- shared TypeScript contracts in `shared/schema.ts`

The product currently spans these workflows:

- Excel definition parsing and DDL generation
- DDL import back into workbook templates
- schema diff / rename suggestion flows
- name-fix workflows
- builtin extension hosting
- DB Workbench for live database introspection and query execution

Do not assume design docs describe shipped behavior. Verify the code path first.

## Source Of Truth Order

When project docs disagree, use this precedence:

1. Runtime code and invoked command wiring
2. `shared/schema.ts`
3. builtin extension manifests and workspace registration
4. focused design docs under `docs/`
5. `agent.md` UI intent notes

`agent.md` is design guidance, not a capability contract.

## Development Commands

Use the actual scripts from `package.json`:

```bash
# Web UI dev server
npm run dev

# Desktop app dev
npm run tauri:dev

# Web build
npm run build

# Desktop build
npm run tauri:build

# TypeScript check
npm run check

# i18n key validation
npm run check:i18n

# Docs site
npm run docs:dev
npm run docs:build
npm run docs:serve
```

The older `npm start` / `npm run db:push` guidance is obsolete for this repository state.

## Architecture Map

### Frontend Shell

The main desktop shell is centered around:

- `client/src/pages/Dashboard.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
- `client/src/extensions/builtin/register-all.tsx`

Builtin extensions are first-class surfaces, not side experiments. When a feature lives under an extension workspace, treat that as part of the main product architecture.

### DB Workbench

The DB Workbench currently uses a shell + specialized pane model:

- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/ExplainPlanPane.tsx`
- `client/src/components/extensions/db-workbench/QueryTabs.tsx`
- `client/src/components/extensions/db-workbench/DangerousSqlDialog.tsx`

Current implemented DB Workbench capabilities include:

- saved DB connections
- schema introspection
- indexes and foreign keys in schema snapshots
- Monaco SQL editor with keyboard actions
- query execution and cancellation
- EXPLAIN plan visualization
- dangerous SQL preview / confirmation flow
- result grid with batch tabs, filtering, column resize, and incremental loading
- desktop-style split panes and persistent query tabs

Important boundary:

- `DbConnectorWorkspace.tsx` still contains a legacy `连接 / Schema / DIFF` path
- `WorkbenchLayout.tsx` is the newer operator-focused path
- both paths coexist, so do not remove one unless the migration is intentional and complete

Not fully integrated yet:

- data sync workflow is designed and partially scaffolded, but not yet wired as a first-class workbench view
- row editing / transactional grid commit is not complete
- ER authoring is not present as a finished shipped feature

### Desktop Bridge And DB Backend

DB Workbench behavior is spread across these layers and must stay in sync:

- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/lib/desktop-bridge.ts`
- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/db_connector/explain.rs`
- `src-tauri/src/db_connector/introspect.rs`
- `src-tauri/src/lib.rs`

If you change query, explain, schema, or export behavior, verify all of those layers.

### Excel Parsing Core

The original parser architecture still matters, but it now lives in Rust.

The core parsing logic is centered in `src-tauri/src/excel.rs` and still uses the multi-table scan pattern to handle sheets containing multiple table definitions:

1. Detect `論理テーブル名` to locate table starts
2. Search forward for the header row containing required labels
3. Build a dynamic column map from the discovered header row
4. Use the next `論理テーブル名` as the boundary
5. Stop parsing columns at the first empty physical-name cell

When touching Excel parsing:

- tables can appear anywhere in a sheet
- headers can shift by column
- label lookup is not limited to a single row direction
- parser fixes should be validated against real workbook structure, not assumptions

## Shared Contract Rules

`shared/schema.ts` is the typed contract between UI and desktop backend.

When a DB feature changes shape:

- update `shared/schema.ts` first
- then update host API interfaces
- then update desktop bridge invoke payloads
- then update Rust command/request/response types
- then update UI consumers

Do not silently change only one layer.

## Frontend Conventions

### Path Aliases

```text
@/       -> client/src/
@shared/ -> shared/
```

Prefer these aliases for frontend/shared imports.

### Desktop UI Baseline

This product should feel like a native database tool, not a marketing page.

- prefer panes over cards
- prefer density and alignment over decorative spacing
- prefer borders over shadows
- prefer small radii
- use monospace in code/data contexts
- preserve persistent workspace controls where practical
- avoid hero sections, glassmorphism, and ornamental gradients in primary work surfaces

### Capability Accuracy

For DB Workbench work, do not promote design intentions into user-facing claims unless the path is actually wired.

Examples:

- a file existing under `db-workbench/` does not mean the feature is reachable
- a design doc under `docs/` does not mean the command exists
- a type in `shared/schema.ts` does not mean the Tauri invoke handler is registered

Trace the actual route before claiming support.

## Important Files

- `client/` — React frontend
- `shared/` — shared API and schema contracts
- `src-tauri/` — desktop backend and builtin extension manifests
- `docs/` — targeted product/design docs
- `docs-site/` — published manual site
- `script/` — project utilities
- `attached_assets/` — local workbook assets for testing
- `uploads/` — runtime uploads, not source-controlled

## Working Guidance

- Prefer small, verifiable fixes over broad rewrites in DB Workbench files because the area is actively evolving.
- Preserve both desktop shell consistency and operator safety.
- When fixing DB Workbench robustness, prioritize:
  - connection context clarity
  - safe execution boundaries
  - schema/query/result synchronization
  - explicit handling of incomplete backend wiring
- Before saying a DB workflow is “done”, confirm:
  - the frontend surface is reachable
  - the host API is wired
  - the Tauri command is registered
  - the shared schema matches the runtime payload
