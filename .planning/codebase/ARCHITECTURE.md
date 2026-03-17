# Codebase Architecture

## High-Level Shape

The application is organized around a shared domain model and a single typed API contract.

1. Excel files are uploaded and persisted.
2. The backend parses workbook content into `TableInfo`-based structures.
3. The frontend renders file, sheet, preview, diff, and DDL generation workflows.
4. The backend can also produce schema diff and ALTER outputs based on persisted snapshots.
5. Electron packages the full experience as a desktop application with local storage and update flow.

## Architectural Boundaries

### Client

- Dashboard-oriented UI
- Data fetching through React Query hooks
- Feature panels such as preview, DDL generation, and schema diff

### Shared

- Source of truth for:
  - data models
  - validation schemas
  - route contracts

### Server

- Route registration and runtime middleware
- Domain services for parsing, diffing, validation, and export
- Storage abstraction over SQLite/PostgreSQL

### Electron

- Desktop process bootstrap
- local server startup
- updater integration
- file-system aware runtime paths

## Existing Stable Seams

- Route registration is modular (`server/routes/*.ts`)
- Feature data contracts are centralized (`shared/schema.ts`, `shared/routes.ts`)
- Dashboard view modes already support multiple work areas
- Desktop runtime already uses local writable directories for stateful features

## Brownfield Implications

This is not a greenfield plugin platform. The safest path is:

- keep the core app responsible for extension discovery and lifecycle
- let extensions mount into known seams:
  - server route registration
  - frontend routed outlet or tab view
  - local persistence tables

## Architecture Direction For The Extension Project

Introduce two new concepts:

- `ExtensionHost`: core runtime responsible for catalog, install, verify, load, enable, disable
- `CanonicalSchema`: normalized schema model richer than the current Excel-first `TableInfo`

This will allow:

- file vs file diff to remain intact
- file vs DB diff to be added without breaking current workflows
- DB management to remain optional and downloaded on demand

