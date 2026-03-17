# Codebase Structure

## Top-Level Layout

- `client/`: React application
- `server/`: Express application and domain services
- `shared/`: cross-layer schemas and typed route contracts
- `electron/`: desktop bootstrap, preload, updater
- `mcp/`: automation and agent-facing server entrypoints
- `script/`: build and utility scripts
- `test/`: behavior, whitebox, and server-focused tests
- `docs-site/`: Docusaurus documentation site

## Client Structure

- `client/src/pages/`: dashboard and settings page shells
- `client/src/components/`: feature panels and UI building blocks
- `client/src/hooks/`: data hooks built around the shared route contract
- `client/src/lib/`: client utilities
- `client/src/i18n/`: localization setup

## Server Structure

- `server/index.ts`: Express bootstrap
- `server/routes.ts`: route assembly and middleware wiring
- `server/routes/`: feature route modules
- `server/lib/`: parser, diff, validation, and service logic
- `server/constants/`: runtime and API constants
- `server/storage.ts`: storage abstraction and implementations

## Shared Structure

- `shared/schema.ts`: application data models and storage schemas
- `shared/routes.ts`: typed endpoint contract
- `shared/config.ts`: defaults and runtime config values

## Extension-Oriented Structural Observations

- Current structure is feature-friendly but not yet extension-aware
- Best insertion points for the new project:
  - `shared/`: extension manifest and host contracts
  - `server/lib/`: extension loader and DB schema adapters
  - `server/routes/`: extension management endpoints
  - `client/src/pages/` or `client/src/components/`: extension manager and extension outlet
  - `electron/`: download/install orchestration and filesystem placement

