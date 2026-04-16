# Spec: Connection Governance Center

## Problem

DB Workbench already supports saved connections, secure password storage, discovery, environment labels, and readonly execution guards. But the connection center still behaves like a basic CRUD list instead of a professional connection catalog. Important connection governance fields are not editable in the main form, and operators cannot organize, search, or prioritize saved connections the way paid database tools allow.

## Goal

Turn the connection center into an operator-grade connection catalog with richer connection metadata and practical governance controls.

## Requirements

### R1. Connection Metadata Must Be Editable

The connection form must expose governance metadata that already exists or is needed for connection operations, including environment, readonly mode, default schema, color tag, favorite, group, and operator notes.

### R2. Saved Connections Must Be Searchable And Filterable

Operators must be able to quickly find saved connections by searching across name, host, database, group, and notes, and filter by environment or favorites.

### R3. Connection Catalog Must Support Organization

Saved connections must be visually grouped by connection group and surface favorite connections prominently, with clear metadata badges for environment, readonly state, and default schema.

### R4. Existing Connection Safety Must Stay Intact

Secure password handling, connection testing, discovery prefill, and workbench launch behavior must continue to work after the catalog changes.

## Acceptance Criteria

1. Operators can edit and persist environment, readonly, default schema, color tag, favorite, group, and notes for a saved connection.
2. The connection center supports text search and at least environment / favorites filtering.
3. Saved connections render in organized groups with visible metadata badges and favorite status.
4. `npm run check` and `cargo check` pass.
