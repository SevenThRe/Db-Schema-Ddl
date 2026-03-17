# Codebase Conventions

## Language and Typing

- TypeScript is used across client, server, shared, Electron, and MCP code
- Strict typing is enabled in `tsconfig.json`
- Shared Zod schemas are the preferred boundary contract

## API Convention

- Define endpoint contracts in `shared/routes.ts`
- Parse request and response payloads against the shared schema
- Prefer route-specific modules under `server/routes/`

## Data Model Convention

- Shared business shapes live in `shared/schema.ts`
- Storage rows and runtime domain types are kept close to the shared schema
- Feature logic should prefer schema-backed types over ad hoc interfaces

## UI Convention

- Dashboard feature panels are composed rather than globally state-managed
- React Query is used for server state
- Local component state is used for view selection and panel-level interactions

## Packaging Convention

- Production artifacts are built into `dist/`
- Electron-specific bundles are produced separately
- Desktop runtime paths are resolved at startup rather than hardcoded

## Test Convention

- Behavior and whitebox tests both exist
- Server-heavy logic is tested in `test/server/`
- Regression tests accompany DDL/parser changes

## Conventions To Preserve In The New Project

- New extension host contracts should be defined in `shared/`
- New routes should be registered through modular route files
- DB management should not bypass schema validation or typed route parsing
- The base app should remain usable without the extension installed

