---
phase: 23-release-safety-foundations
plan: 01
subsystem: db-workbench-safety
tags: [db-workbench, security, credential-storage, runtime-safety]
provides:
  - Saved DB connection passwords now live in OS-backed secure storage instead of SQLite plaintext JSON
  - Legacy plaintext saved connections auto-migrate to secure storage during normal reads/saves
  - Connection save/delete invalidates cached runtime pools and the workbench export scope labels now map 1:1 to runtime payloads
requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05]
completed: 2026-04-11
---

# Phase 23 Plan 01: Release Safety Foundations Summary

**Phase 23 turned saved connections and core workbench safety controls into a release-grade baseline. Passwords are no longer persisted in plaintext connection metadata, legacy installs migrate to secure storage automatically, and the operator-facing connection/export controls now describe the exact runtime behavior that executes.**

## Accomplishments

- Added OS-backed secure password storage in `src-tauri/src/storage.rs` using a dedicated secure-store service key, and rewrote saved-connection persistence so SQLite keeps only redacted connection metadata.
- Implemented automatic legacy migration for old `db_connections.config_json.password` rows and added storage tests that prove migrated rows are rewritten without plaintext.
- Added `hasStoredPassword` / `clearStoredPassword` to the shared connection contract so the UI can preserve or explicitly remove stored secrets without repopulating the password input.
- Updated `DbConnectorWorkspace.tsx` to explain when a password is already stored securely and to offer an explicit "remove saved password on save" path.
- Rewired connection save/delete commands to invalidate cached runtime pools immediately, which makes credential, readonly, and schema changes take effect on the next operation.
- Kept runtime-side export safety truthful by preserving the current-page / loaded-rows / full-result contract in the shared request payload and the backend export-row resolver.
- Preserved the stop-on-error truth path by keeping `WorkbenchLayout` as the single state owner and passing that state directly into `ResultGridPane`.

## Files Modified

- `shared/schema.ts`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/ResultExportMenu.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `src-tauri/Cargo.toml`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/storage.rs`
- `test/client/db-connection-config.test.ts`
- `.planning/phases/23-release-safety-foundations/23-CONTEXT.md`
- `.planning/phases/23-release-safety-foundations/23-01-PLAN.md`
- `.planning/phases/23-release-safety-foundations/23-01-SUMMARY.md`

## Decisions Made

- Secure-secret presence is represented explicitly through `hasStoredPassword`; saved-connection payloads never round-trip the secret itself.
- Leaving the password field blank preserves an existing stored secret by default, while clearing it requires explicit operator intent through `clearStoredPassword`.
- Runtime pool invalidation belongs on connection save/delete so security-sensitive configuration edits take effect immediately rather than through stale cached pools.
- Export scope labels remain strict: `current_page` serializes only the visible page, `loaded_rows` serializes the loaded in-memory batch set, and `full_result` re-executes only when the runtime can page safely.

## Verification

- `npm run check`
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/client/db-connection-config.test.ts`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`
- `cargo test --manifest-path src-tauri/Cargo.toml -j 1 -- --nocapture`

## Task Commits

No commits were created in this execution run.

## Next Phase Readiness

- Phase 24 can now simplify the operator workflow on top of a safer saved-connection/runtime foundation instead of inheriting plaintext secret handling.
- Canonical workbench-route cleanup can assume export scopes, stop-on-error wiring, and connection secret preservation are aligned with runtime truth.
