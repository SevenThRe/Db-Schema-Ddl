# Codebase Integrations

## External Libraries

- `xlsx`: workbook parsing and sheet data extraction
- `better-sqlite3`: desktop-local persistence
- `pg`: PostgreSQL connectivity for web/server deployments
- `drizzle-orm` and `drizzle-zod`: schema and validation
- `electron-updater`: GitHub release-backed application updates
- `archiver`: ZIP export for generated SQL artifacts

## Internal Cross-Boundary Integrations

- Frontend to backend:
  - `client/src/hooks/use-ddl.ts` consumes the typed routes from `shared/routes.ts`
  - UI features fetch files, sheets, table data, DDL previews, name-fix jobs, and schema diff results
- Backend to storage:
  - `server/storage.ts` exposes an `IStorage` abstraction over SQLite/PostgreSQL
- Backend to parser/generator:
  - `server/lib/excel.ts` parses workbook structures
  - `server/lib/ddl.ts` generates MySQL/Oracle DDL
  - `server/lib/schema-diff.ts` compares structured schema snapshots
- Electron to server/UI:
  - `electron/main.ts` starts the bundled Express server and loads it in the desktop window
  - `electron/preload.ts` and updater IPC events bridge desktop-only behavior

## Distribution Integrations

- GitHub Releases is already the application release channel
- Electron updater already follows a "check, confirm, download, install" UX

## Missing Integrations For The Planned Extension

- No extension catalog or extension manifest fetch yet
- No runtime extension loader for server routes or frontend micro-UI
- No DB connectivity layer for external target databases
- No schema introspection integration for live MySQL/Oracle targets

## Integration Guidance For The New Work

- Reuse GitHub as the official source of truth for extension assets
- Keep extension APIs namespaced under an extension prefix
- Prefer manifest-driven loading rather than hardcoding one extension into the core app

